import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User } from 'firebase/auth';
import { auth, logout, getUserDocument, updateUserDocument, UserDocument } from './services/firebase';
import { LogEntry, ProcessingResult } from './types';
import { Terminal } from './components/Terminal';
import { PromptEditor } from './components/PromptEditor';
import { generateImageFromReference, fileToBase64 } from './services/geminiService';
import { TokenUsage, ModelType } from './services/TokenUsage';
import { FolderOpen, Play, Download, Image as ImageIcon, CheckCircle, AlertCircle, Loader2, Key, Trash2, ChevronDown, X } from 'lucide-react';

const STORAGE_KEY_ASPECT_RATIO = 'banana_pic_gen_aspect_ratio';
const STORAGE_KEY_IMAGE_SIZE = 'banana_pic_gen_image_size';
const STORAGE_KEY_MODEL = 'banana_pic_gen_model';
const STORAGE_KEY_TOKEN_USAGE = 'banana_pic_gen_token_usage';
const STORAGE_KEY_TEMPERATURE = 'banana_pic_gen_temperature';

const MODEL_OPTIONS = [
  { label: "Nano Banana Pro", value: "gemini-3-pro-image-preview" },
  { label: "Nano Banana", value: "gemini-2.5-flash-image" }
];

// Helper to get user photo URL with Facebook fallback
const getUserPhotoURL = (user: User | null): string | null => {
  if (!user) return null;

  // Check if this is a Facebook user
  const facebookProvider = user.providerData?.find(p => p.providerId === 'facebook.com');

  if (facebookProvider) {
    // For Facebook, we need to use the access token to get the real profile picture
    const accessToken = sessionStorage.getItem('fb_access_token');
    if (accessToken && facebookProvider.uid) {
      return `https://graph.facebook.com/${facebookProvider.uid}/picture?type=large&access_token=${accessToken}`;
    }
    // If we have photoURL from provider, try it (though it may not work without token)
    if (facebookProvider.photoURL) {
      return facebookProvider.photoURL;
    }
  }

  // For other providers (Google, Microsoft, etc.), use the standard photoURL
  if (user.photoURL) return user.photoURL;

  return null;
};

const App: React.FC = () => {
  // Get user from auth (already authenticated via AuthWrapper)
  const user = auth?.currentUser;

  // User Document State (from Firestore)
  const [userDoc, setUserDoc] = useState<UserDocument | null>(null);
  const [isLoadingUserDoc, setIsLoadingUserDoc] = useState(true);
  const [isSavingUserDoc, setIsSavingUserDoc] = useState(false);

  // App State
  const [hasKey, setHasKey] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [results, setResults] = useState<ProcessingResult[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>(() => {
    return TokenUsage.fromLocalStorage(STORAGE_KEY_TOKEN_USAGE);
  });
  const [selectedAspectRatio, setSelectedAspectRatio] = useState(() => {
    return localStorage.getItem(STORAGE_KEY_ASPECT_RATIO) || "4:5";
  });
  const [selectedImageSize, setSelectedImageSize] = useState(() => {
    return localStorage.getItem(STORAGE_KEY_IMAGE_SIZE) || "2K";
  });
  const [selectedModel, setSelectedModel] = useState(() => {
    return localStorage.getItem(STORAGE_KEY_MODEL) || "gemini-2.5-flash-image";
  });
  const [temperature, setTemperature] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_TEMPERATURE);
    return saved ? parseFloat(saved) : 1.0;
  });

  // PWA Install State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);

  // Lightbox State
  const [lightboxImage, setLightboxImage] = useState<ProcessingResult | null>(null);

  // Close lightbox on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && lightboxImage) {
        setLightboxImage(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxImage]);

  // Fetch user document on mount
  useEffect(() => {
    const fetchUserDoc = async () => {
      if (!user?.email) {
        setIsLoadingUserDoc(false);
        return;
      }

      try {
        const doc = await getUserDocument(user.email);
        setUserDoc(doc);
        log("User profile loaded.", "info");
      } catch (error) {
        console.error("Error fetching user document", error);
        log("Failed to load user profile.", "error");
      } finally {
        setIsLoadingUserDoc(false);
      }
    };

    fetchUserDoc();
  }, [user?.email]);

  // Save prompts to Firestore
  const handleSavePrompts = useCallback(async (prompts: Array<{ name: string; prompt: string; enabled: boolean }>, promptBefore: string, promptAfter: string) => {
    if (!user?.email) return;

    console.log('[handleSavePrompts] Saving prompts:', prompts);
    setIsSavingUserDoc(true);
    try {
      await updateUserDocument(user.email, { prompts, prompt_before: promptBefore, prompt_after: promptAfter });
      setUserDoc(prev => prev ? { ...prev, prompts, prompt_before: promptBefore, prompt_after: promptAfter } : null);
      log("Prompts saved to cloud.", "success");
    } catch (error) {
      console.error("Error saving prompts", error);
      log("Failed to save prompts.", "error");
    } finally {
      setIsSavingUserDoc(false);
    }
  }, [user?.email]);

  // Update local userDoc state immediately when prompts change (for RUN button to work)
  const handlePromptsChange = useCallback((prompts: Array<{ name: string; prompt: string; enabled: boolean }>, promptBefore: string, promptAfter: string) => {
    setUserDoc(prev => prev ? { ...prev, prompts, prompt_before: promptBefore, prompt_after: promptAfter } : null);
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  // Save preferences when they change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ASPECT_RATIO, selectedAspectRatio);
  }, [selectedAspectRatio]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_IMAGE_SIZE, selectedImageSize);
  }, [selectedImageSize]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_MODEL, selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_TEMPERATURE, temperature.toString());
  }, [temperature]);

  useEffect(() => {
    tokenUsage.saveToLocalStorage(STORAGE_KEY_TOKEN_USAGE);
  }, [tokenUsage]);

  // Track previous historic values to detect changes
  const prevHistoricCostRef = useRef<number>(tokenUsage.historic_cost);
  const prevHistoricImagesRef = useRef<number>(tokenUsage.historic_images);

  // Sync historic_cost and historic_images to cloud when they change
  useEffect(() => {
    if (!user?.email) return;

    const currentCost = tokenUsage.historic_cost;
    const currentImages = tokenUsage.historic_images;
    const costChanged = currentCost !== prevHistoricCostRef.current;
    const imagesChanged = currentImages !== prevHistoricImagesRef.current;

    if (costChanged || imagesChanged) {
      prevHistoricCostRef.current = currentCost;
      prevHistoricImagesRef.current = currentImages;

      // Save to cloud (fire and forget, don't block UI)
      updateUserDocument(user.email, {
        historic_cost: currentCost,
        historic_images: currentImages
      }).catch(err => console.error('Failed to sync historic data to cloud:', err));
    }
  }, [tokenUsage.historic_cost, tokenUsage.historic_images, user?.email]);

  // Load historic data from cloud on initial load
  useEffect(() => {
    let needsUpdate = false;
    const updates: Partial<{ historic_cost: number; historic_images: number }> = {};

    if (userDoc?.historic_cost !== undefined && userDoc.historic_cost > tokenUsage.historic_cost) {
      updates.historic_cost = userDoc.historic_cost;
      needsUpdate = true;
    }
    if (userDoc?.historic_images !== undefined && userDoc.historic_images > tokenUsage.historic_images) {
      updates.historic_images = userDoc.historic_images;
      needsUpdate = true;
    }

    if (needsUpdate) {
      setTokenUsage(prev => {
        const next = TokenUsage.fromJSON(prev.toJSON());
        if (updates.historic_cost !== undefined) next.historic_cost = updates.historic_cost;
        if (updates.historic_images !== undefined) next.historic_images = updates.historic_images;
        return next;
      });
    }
  }, [userDoc?.historic_cost, userDoc?.historic_images]);

  // Initialization
  useEffect(() => {
    checkApiKey();
    log("Welcome to Banana Pro Batch Generator.", "info");
    log("System initialized. Please select API Key and Files.", "info");
  }, []);

  const checkApiKey = async () => {
    // Check for hosted environment key selection
    if (window.aistudio && window.aistudio.hasSelectedApiKey) {
      const has = await window.aistudio.hasSelectedApiKey();
      setHasKey(has);
    } else {
      // Fallback for local development
      // If process.env.API_KEY is available (set in .env), we treat it as having a key
      const envKey = window.env?.API_KEY || process.env.API_KEY;
      if (envKey) {
        setHasKey(true);
        log("Using environment API Key (Local Mode).", "info");
      } else {
        setHasKey(false);
        log("No API Key detected. For local use, set API_KEY in your environment.", "warning");
      }
    }
  };

  const handleSelectKey = async () => {
    if (window.aistudio && window.aistudio.openSelectKey) {
      await window.aistudio.openSelectKey();
      await checkApiKey();
    } else {
      log("Key selection not available in local mode.", "error");
      alert("Running Locally: Please set the 'API_KEY' environment variable in your .env file or system config.");
    }
  };

  const log = (message: string, type: LogEntry['type'] = 'info') => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs(prev => [...prev, { timestamp, message, type }]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files) as File[];
      setSelectedFiles(files);
      log(`Selected ${files.length} file(s) from path.`, 'info');
    }
  };

  const handleProcess = async () => {
    if (!userDoc || !userDoc.prompts || userDoc.prompts.length === 0) {
      log("Error: No prompts configured.", "error");
      return;
    }

    // Get enabled prompts
    const enabledPrompts = userDoc.prompts.filter(p => p.enabled && p.name.trim());
    if (enabledPrompts.length === 0) {
      log("Error: No prompts selected.", "error");
      return;
    }

    if (selectedFiles.length === 0) {
      log("Error: No files selected.", "error");
      return;
    }
    if (!hasKey) {
      log("Error: API Key not configured.", "error");
      return;
    }

    setIsProcessing(true);
    setResults([]); // Clear previous results

    // 1. Use all selected files
    const filesToProcess = selectedFiles;

    if (filesToProcess.length === 0) {
      log("No files selected.", "warning");
      setIsProcessing(false);
      return;
    }

    log(`Starting batch for ${filesToProcess.length} files...`, "info");

    const tasks: ProcessingResult[] = [];

    // 2. Build Task List from enabled prompts
    enabledPrompts.forEach(prompt => {
      // Combine before + prompt + after
      const beforeText = userDoc.prompt_before || '';
      const afterText = userDoc.prompt_after || '';
      const basePrompt = prompt.prompt;
      const fullPrompt = `${beforeText}${beforeText ? '\n' : ''}${basePrompt}${afterText ? '\n' : ''}${afterText}`.trim();

      tasks.push({
        id: `${prompt.name}-${Date.now()}`,
        files: filesToProcess,
        promptName: prompt.name,
        promptText: fullPrompt,
        status: 'pending'
      });
    });


    setResults(tasks);
    log(`Queued ${tasks.length} generation tasks.`, "info");

    // 4. Process Loop (Sequential to be safe with rate limits/complexity)
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];

      // Update status to processing
      updateResultStatus(i, 'processing');
      log(`Processing [${i + 1}/${tasks.length}]:  ${task.promptName}`, "info");
      try {

        const { imageUrl, usage } = await generateImageFromReference(
          task.files,
          task.promptText,
          selectedAspectRatio,
          selectedImageSize,
          selectedModel,
          temperature
        );

        setTokenUsage(prev => {
          const next = TokenUsage.fromJSON(prev.toJSON());
          next.addItem(usage.input, usage.output_text, usage.output_image, selectedModel as ModelType);
          return next;
        });
        updateResultStatus(i, 'completed', imageUrl);
        log(`Success: (${task.promptName}) generated. Tokens: ${usage.total} (In: ${usage.input}, Out: ${usage.output_image + usage.output_text})`, "success");
      } catch (err: any) {
        updateResultStatus(i, 'failed', undefined, err.message);
        log(`Failed: (${task.promptName}) - ${err.message}`, "error");

        // Re-check auth on specific errors if needed
        if (err.message && err.message.includes("Requested entity was not found")) {
          log("API Key might be invalid or expired. Check environment or re-select key.", "error");
          // Only force reset if we are in a mode where selection is possible, 
          // otherwise just stop and warn.
          if (window.aistudio) {
            setHasKey(false);
          }
          break; // Stop batch
        }
      }
    }

    setIsProcessing(false);
    log("Batch processing finished.", "success");
  };

  const updateResultStatus = (index: number, status: ProcessingResult['status'], imageUrl?: string, error?: string) => {
    setResults(prev => {
      const next = [...prev];
      next[index] = { ...next[index], status, imageUrl, error };
      return next;
    });
  };

  const handleClear = () => {
    setResults([]);
    setTokenUsage(prev => {
      const next = TokenUsage.fromJSON(prev.toJSON());
      next.reset();
      return next;
    });
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs([{ timestamp, message: "Workspace and Console cleared.", type: 'info' }]);
  };

  // Helper to handle download
  const handleDownload = (res: ProcessingResult) => {
    if (!res.imageUrl) return;
    const link = document.createElement('a');
    link.href = res.imageUrl;
    // Format: 3_beach standing_.jpg (Simulating the request requirement: {original}_{prompt}.jpg)
    // Removing extension from original for cleaner name if needed, but request said "origin file name"
    const namePart = res.files[0].name.replace(/\.[^/.]+$/, "");
    link.download = `${namePart}_${res.promptName}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col md:flex-row">
      {/* Lightbox Modal */}
      {lightboxImage && lightboxImage.imageUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          {/* Close Button */}
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2 z-10"
            onClick={() => setLightboxImage(null)}
          >
            <X size={32} />
          </button>

          {/* Image */}
          <div className="flex-1 flex items-center justify-center w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightboxImage.imageUrl}
              alt="Generated"
              className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-2xl"
            />
          </div>

          {/* Info & Download */}
          <div className="w-full max-w-md mt-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="text-center">
              <div className="text-slate-400 text-sm">{lightboxImage.originalFileName}</div>
              <div className="text-white font-bold">{lightboxImage.promptName}</div>
            </div>
            <button
              onClick={() => handleDownload(lightboxImage)}
              className="w-full bg-green-600 hover:bg-green-500 text-white py-4 px-6 rounded-xl font-bold text-lg flex items-center justify-center gap-3 shadow-lg active:scale-95 transition-transform"
            >
              <Download size={24} />
              Download Image
            </button>
          </div>
        </div>
      )}
      {/* Sidebar / Config Panel */}
      <div className={`fixed inset-y-0 left-0 z-50 w-full md:w-96 bg-slate-950 border-r border-slate-800 transform transition-transform duration-300 ${showConfig ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 md:static flex flex-col`}>
        <div className="p-4 border-b border-slate-800 flex justify-between items-center">
          <div className="relative group">
            <select
              className="bg-transparent font-bold text-xl tracking-tight text-amber-500 focus:outline-none cursor-pointer appearance-none pr-8"
              value={selectedModel}
              onChange={(e) => {
                setSelectedModel(e.target.value);
                setTokenUsage(prev => {
                  const next = TokenUsage.fromJSON(prev.toJSON());
                  next.reset();
                  return next;
                });
                log("Model changed. Token usage cleared.", "info");
              }}
            >
              {MODEL_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value} className="bg-slate-950 text-slate-200 text-sm">{opt.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 text-amber-500 pointer-events-none" size={20} />
          </div>
          <button onClick={() => setShowConfig(false)} className="md:hidden text-slate-400"><CheckCircle /></button>
        </div>

        <div className="flex-1 p-4 overflow-hidden">
          {isLoadingUserDoc ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="animate-spin text-amber-500" size={32} />
            </div>
          ) : userDoc ? (
            <PromptEditor
              prompts={userDoc.prompts}
              promptBefore={userDoc.prompt_before}
              promptAfter={userDoc.prompt_after}
              onSave={handleSavePrompts}
              onChange={handlePromptsChange}
              isSaving={isSavingUserDoc}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-slate-500">
              <p>Failed to load user profile</p>
            </div>
          )}
        </div>
        <div className="p-4 bg-slate-900 border-t border-slate-800 space-y-4">
          {/* API Key Status */}
          <div className="flex items-center justify-between bg-slate-800 p-3 rounded-lg">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${hasKey ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-sm font-medium text-slate-300">API Key</span>
            </div>
            {!hasKey && (
              <button onClick={handleSelectKey} className="text-xs bg-amber-600 hover:bg-amber-700 text-white px-2 py-1 rounded flex items-center gap-1">
                <Key size={12} /> Select Key
              </button>
            )}
            {hasKey && <span className="text-xs text-green-400 font-mono">ACTIVE</span>}
          </div>

          {/* User Auth Status */}
          <div className="flex items-center justify-between bg-slate-800 p-3 rounded-lg">
            <div className="flex items-center gap-2 overflow-hidden">
              {getUserPhotoURL(user) ? (
                <img src={getUserPhotoURL(user)!} alt="User" className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-6 h-6 rounded-full flex items-center justify-center bg-blue-500">
                  <span className="text-xs font-bold">{user?.displayName?.[0] || '?'}</span>
                </div>
              )}
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-medium text-slate-300 truncate max-w-[100px]">{user?.displayName || 'User'}</span>
              </div>
            </div>
            <button onClick={logout} className="text-xs bg-slate-700 hover:bg-red-600 text-white px-2 py-1 rounded">
              Logout
            </button>
          </div>

          <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="block text-xs text-slate-500 text-center hover:text-slate-400">
            Billing Information
          </a>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => setShowConfig(true)} className="md:hidden text-slate-400 hover:text-white">
              <ImageIcon />
            </button>
            <div className="flex gap-4">
              {(() => {
                const costBreakdown = tokenUsage.getCostBreakdown(selectedModel as ModelType);
                return (
                  <>
                    <div className="flex flex-col group relative">
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold cursor-help">Input</span>
                      <span className="text-sm font-mono text-blue-400">${costBreakdown.inputCost.toFixed(4)}</span>

                      {/* Tooltip */}
                      <div className="absolute top-full left-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded p-2 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                        <div className="text-xs text-slate-400 mb-1">
                          {selectedModel === 'gemini-2.5-flash-image' ? '$0.30 / 1M tokens' : '$2.00 / 1M tokens'}
                        </div>
                        <div className="text-xs font-mono text-blue-400 font-bold">
                          {tokenUsage.input.toLocaleString()} tokens
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col group relative">
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold cursor-help">Output</span>
                      <span className="text-sm font-mono text-green-400">${costBreakdown.outputCost.toFixed(4)}</span>

                      {/* Tooltip */}
                      <div className="absolute top-full left-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded p-2 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                        {selectedModel === 'gemini-2.5-flash-image' ? (
                          <div className="text-xs text-slate-400 mb-1">$0.039 / image</div>
                        ) : (
                          <>
                            <div className="text-xs text-slate-400 mb-1">$120.00 / 1M tokens (image)</div>
                            <div className="text-xs text-slate-400 mb-1">$12.00 / 1M tokens (text)</div>
                          </>
                        )}
                        <div className="text-xs font-mono text-green-400 font-bold">
                          {(tokenUsage.output_image + tokenUsage.output_text).toLocaleString()} tokens ({tokenUsage.images} images)
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col group relative">
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold cursor-help">Total</span>
                      <span className="text-sm font-mono text-amber-400">${costBreakdown.totalCost.toFixed(4)}</span>

                      {/* Tooltip */}
                      <div className="absolute top-full left-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded p-2 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                        <div className="text-xs font-mono text-amber-400 font-bold">
                          {tokenUsage.total.toLocaleString()} tokens
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          Historic: ${tokenUsage.historic_cost.toFixed(4)} ({tokenUsage.historic_images} images)
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          <div className="flex items-center gap-4">
            {deferredPrompt && (
              <button
                onClick={handleInstallClick}
                className="hidden md:flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-md transition border border-amber-500 shadow-lg shadow-amber-900/20"
              >
                <Download size={18} />
                <span>Install App</span>
              </button>
            )}
            <div className="relative">
              <input
                type="file"
                multiple
                onChange={handleFileSelect}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <button className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-md transition border border-slate-700">
                <FolderOpen size={18} />
                <span>{selectedFiles.length > 0 ? `${selectedFiles.length} selected` : ''}</span>
              </button>
            </div>
          </div>
        </header>

        {/* Action Bar */}
        <div className="p-6 bg-slate-900 border-b border-slate-800 flex flex-wrap gap-6 items-end">
          {/* Aspect Ratio Selector */}
          <div className="w-32">
            <label className="block text-xs font-mono text-slate-500 mb-2 uppercase">Aspect Ratio</label>
            <select
              className="w-full bg-slate-950 text-slate-200 border border-slate-700 rounded p-2.5 focus:border-amber-500 focus:outline-none"
              value={selectedAspectRatio}
              onChange={(e) => setSelectedAspectRatio(e.target.value)}
              disabled={isProcessing}
            >
              {['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'].map(ratio => (
                <option key={ratio} value={ratio}>{ratio}</option>
              ))}
            </select>
          </div>

          {/* Image Size Selector */}
          <div className="w-32">
            <label className="block text-xs font-mono text-slate-500 mb-2 uppercase">Image Size</label>
            <select
              className="w-full bg-slate-950 text-slate-200 border border-slate-700 rounded p-2.5 focus:border-amber-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              value={selectedImageSize}
              onChange={(e) => setSelectedImageSize(e.target.value)}
              disabled={isProcessing || selectedModel === 'gemini-2.5-flash-image'}
            >
              {['1K', '2K', '4K'].map(size => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </div>

          {/* Temperature Slider */}
          <div className="w-40">
            <label className="block text-xs font-mono text-slate-500 mb-2 uppercase">Temperature: {temperature.toFixed(1)}</label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              disabled={isProcessing}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <div className="flex justify-between text-[10px] text-slate-600 mt-1">
              <span>Precise</span>
              <span>Creative</span>
            </div>
          </div>

          {/* Run Button */}
          <button
            onClick={handleProcess}
            disabled={isProcessing || !hasKey || selectedFiles.length === 0 || !userDoc?.prompts?.some(p => p.enabled)}
            className={`px-6 py-2.5 rounded font-bold flex items-center gap-2 transition ${isProcessing || !hasKey || selectedFiles.length === 0 || !userDoc?.prompts?.some(p => p.enabled)
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
              : 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/20'
              }`}
          >
            {isProcessing ? <Loader2 className="animate-spin" size={20} /> : <Play size={20} />}
            RUN
          </button>

          {/* Clear Button */}
          <button
            onClick={handleClear}
            disabled={isProcessing}
            className={`px-6 py-2.5 rounded font-bold flex items-center gap-2 transition ${isProcessing
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
              : 'bg-slate-700 hover:bg-red-600 text-white'
              }`}
          >
            <Trash2 size={20} />

          </button>
        </div>

        {/* Workspace */}
        <div className="flex-1 overflow-hidden flex flex-col p-6 gap-6">

          {/* Terminal Logs */}
          <Terminal logs={logs} />

          {/* Results Grid */}
          <div className="flex-1 overflow-y-auto min-h-0 bg-slate-900/50 rounded-lg border border-slate-800/50 p-4">
            {results.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-4">
                <ImageIcon size={48} className="opacity-20" />
                <p>Generated images will appear here.</p>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {results.map((res) => (
                <div key={res.id} className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden flex flex-col group">
                  <div className="aspect-square bg-slate-900 relative flex items-center justify-center">
                    {res.status === 'processing' && <Loader2 className="animate-spin text-amber-500" size={32} />}
                    {res.status === 'pending' && <span className="text-slate-700 text-xs">Waiting...</span>}
                    {res.status === 'failed' && <AlertCircle className="text-red-500" size={32} />}
                    {res.status === 'completed' && res.imageUrl && (
                      <img
                        src={res.imageUrl}
                        alt="Generated"
                        className="w-full h-full object-cover cursor-pointer"
                        onClick={() => setLightboxImage(res)}
                      />
                    )}

                    {/* Overlay Actions (desktop hover) */}
                    {res.status === 'completed' && (
                      <div
                        className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center cursor-pointer"
                        onClick={() => setLightboxImage(res)}
                      >
                        <span className="text-white text-xs">Tap to view</span>
                      </div>
                    )}
                  </div>
                  <div className="p-3 border-t border-slate-800">
                    <div className="text-xs text-slate-400 truncate" title={res.originalFileName}>{res.originalFileName}</div>
                    <div className="text-xs font-bold text-slate-200 mt-1 truncate" title={res.promptName}>{res.promptName}</div>
                    {res.error && <div className="text-[10px] text-red-400 mt-1 leading-tight">{res.error}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;