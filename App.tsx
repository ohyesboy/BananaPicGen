import React, { useState, useEffect, useCallback } from 'react';
import { User } from 'firebase/auth';
import { auth, logout } from './services/firebase';
import { AppConfig, LogEntry, ProcessingResult } from './types';
import { Terminal } from './components/Terminal';
import { ConfigEditor } from './components/ConfigEditor';
import { generateImageFromReference, fileToBase64 } from './services/geminiService';
import { FolderOpen, Play, Download, Image as ImageIcon, CheckCircle, AlertCircle, Loader2, Key, Trash2, ChevronDown } from 'lucide-react';
import defaultConfig from './config.json';

const DEFAULT_CONFIG: AppConfig = defaultConfig;
const STORAGE_KEY = 'banana_pic_gen_config';
const STORAGE_KEY_COMBO = 'banana_pic_gen_combo';
const STORAGE_KEY_ASPECT_RATIO = 'banana_pic_gen_aspect_ratio';
const STORAGE_KEY_IMAGE_SIZE = 'banana_pic_gen_image_size';
const STORAGE_KEY_MODEL = 'banana_pic_gen_model';
const STORAGE_KEY_TOKEN_USAGE = 'banana_pic_gen_token_usage';

const MODEL_OPTIONS = [
  { label: "Nano Banana 3 Pro", value: "gemini-3-pro-image-preview" },
  { label: "Nano Banana 2", value: "gemini-2.5-flash-image" }
];

const App: React.FC = () => {
  // Get user from auth (already authenticated via AuthWrapper)
  const user = auth?.currentUser;

  // Config State
  const [config, setConfig] = useState<AppConfig>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved config", e);
        return DEFAULT_CONFIG;
      }
    }
    return DEFAULT_CONFIG;
  });
  
  // App State
  const [hasKey, setHasKey] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedCombo, setSelectedCombo] = useState<string | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_COMBO);
    if (saved && config.combos[saved]) {
      return saved;
    }
    const keys = Object.keys(config.combos);
    return keys.length > 0 ? keys[0] : null;
  });
  const [results, setResults] = useState<ProcessingResult[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [tokenUsage, setTokenUsage] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_TOKEN_USAGE);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved token usage", e);
      }
    }
    return { total: 0, input: 0, output_image: 0, output_text: 0, images: 0 };
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

  // PWA Install State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);

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
    if (selectedCombo) {
      localStorage.setItem(STORAGE_KEY_COMBO, selectedCombo);
    }
  }, [selectedCombo]);

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
    localStorage.setItem(STORAGE_KEY_TOKEN_USAGE, JSON.stringify(tokenUsage));
  }, [tokenUsage]);

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
    if (!selectedCombo) {
      log("Error: No prompt combo selected.", "error");
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

    // 2. Get Prompts from Combo
    const comboString = config.combos[selectedCombo];
    if (!comboString) {
      log(`Combo "${selectedCombo}" definition not found.`, "error");
      setIsProcessing(false);
      return;
    }
    
    const promptNames = comboString.split(',').map(s => s.trim());
    const tasks: ProcessingResult[] = [];

    // 3. Build Task List
    filesToProcess.forEach(file => {
      promptNames.forEach(pName => {
        if (config.prompts[pName]) {
          tasks.push({
            id: `${file.name}-${pName}-${Date.now()}`,
            originalFileName: file.name,
            promptName: pName,
            status: 'pending'
          });
        } else {
          log(`Warning: Prompt "${pName}" not found in config.`, "warning");
        }
      });
    });

    setResults(tasks);
    log(`Queued ${tasks.length} generation tasks.`, "info");

    // 4. Process Loop (Sequential to be safe with rate limits/complexity)
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const file = filesToProcess.find(f => f.name === task.originalFileName);
      const promptText = config.prompts[task.promptName];

      if (!file || !promptText) continue;

      // Update status to processing
      updateResultStatus(i, 'processing');
      log(`Processing [${i+1}/${tasks.length}]: ${file.name} -> ${task.promptName}`, "info");
      try {
        const base64 = await fileToBase64(file);
        const { imageUrl, usage } = await generateImageFromReference(
          base64, 
          file.type, 
          promptText,
          selectedAspectRatio,
          selectedImageSize,
          selectedModel
        );
        
        setTokenUsage(prev => ({
          total: prev.total + usage.total,
          input: prev.input + usage.input,
          output_image: prev.output_image + usage.output_image,
          output_text: prev.output_text + usage.output_text,
          images: prev.images + 1
        }));
        updateResultStatus(i, 'completed', imageUrl);
        log(`Success: ${file.name} (${task.promptName}) generated. Tokens: ${usage.total} (In: ${usage.input}, Out: ${usage.output_image + usage.output_text})`, "success");
      } catch (err: any) {
        updateResultStatus(i, 'failed', undefined, err.message);
        log(`Failed: ${file.name} (${task.promptName}) - ${err.message}`, "error");
        
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
    setTokenUsage({ total: 0, input: 0, output_image: 0, output_text: 0, images: 0 });
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
    const namePart = res.originalFileName.replace(/\.[^/.]+$/, "");
    link.download = `${namePart}_${res.promptName}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col md:flex-row">
      {/* Sidebar / Config Panel */}
      <div className={`fixed inset-y-0 left-0 z-50 w-full md:w-96 bg-slate-950 border-r border-slate-800 transform transition-transform duration-300 ${showConfig ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 md:static flex flex-col`}>
        <div className="p-4 border-b border-slate-800 flex justify-between items-center">
          <div className="relative group">
            <select 
                className="bg-transparent font-bold text-xl tracking-tight text-amber-500 focus:outline-none cursor-pointer appearance-none pr-8"
                value={selectedModel}
                onChange={(e) => {
                  setSelectedModel(e.target.value);
                  setTokenUsage({ total: 0, input: 0, output_image: 0, output_text: 0, images: 0 });
                  log("Model changed. Token usage cleared.", "info");
                }}
            >
              {MODEL_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value} className="bg-slate-950 text-slate-200 text-sm">{opt.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 text-amber-500 pointer-events-none" size={20} />
          </div>
          <button onClick={() => setShowConfig(false)} className="md:hidden text-slate-400"><CheckCircle/></button>
        </div>
        
        <div className="flex-1 p-4 overflow-hidden">
          <ConfigEditor 
            config={config} 
            onSave={(newConf) => {
              setConfig(newConf);
              localStorage.setItem(STORAGE_KEY, JSON.stringify(newConf));
              log("Configuration updated and saved to local storage.", "success");
            }} 
          />
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
               {user?.photoURL ? (
                 <img src={user.photoURL} alt="User" className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
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
                <div className="flex flex-col group relative">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold cursor-help">Input</span>
                  <span className="text-sm font-mono text-blue-400">{tokenUsage.input.toLocaleString()}</span>
                  
                  {/* Tooltip */}
                  <div className="absolute top-full left-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded p-2 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                    <div className="text-xs text-slate-400 mb-1">
                      {selectedModel === 'gemini-2.5-flash-image' ? '$0.30 / 1M tokens' : '$2.00 / 1M tokens'}
                    </div>
                    <div className="text-xs font-mono text-green-400 font-bold">
                      ${((tokenUsage.input / 1000000) * (selectedModel === 'gemini-2.5-flash-image' ? 0.3 : 2)).toFixed(6)}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col group relative">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold cursor-help">Output</span>
                  <span className="text-sm font-mono text-green-400">{(tokenUsage.output_image + tokenUsage.output_text).toLocaleString()} ({tokenUsage.images})</span>

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
                      ${selectedModel === 'gemini-2.5-flash-image' 
                        ? (tokenUsage.images * 0.039).toFixed(6)
                        : (((tokenUsage.output_image / 1000000) * 120) + ((tokenUsage.output_text / 1000000) * 12)).toFixed(6)
                      }
                    </div>
                  </div>
                </div>
                <div className="flex flex-col group relative">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold cursor-help">Total</span>
                  <span className="text-sm font-mono text-amber-400">{tokenUsage.total.toLocaleString()}</span>

                  {/* Tooltip */}
                  <div className="absolute top-full left-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded p-2 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                    <div className="text-xs font-mono text-amber-400 font-bold">
                      ${selectedModel === 'gemini-2.5-flash-image'
                        ? (((tokenUsage.input / 1000000) * 0.3) + (tokenUsage.images * 0.039)).toFixed(6)
                        : (((tokenUsage.input / 1000000) * 2) + ((tokenUsage.output_image / 1000000) * 120) + ((tokenUsage.output_text / 1000000) * 12)).toFixed(6)
                      }
                    </div>
                  </div>
                </div>
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
           {/* Combo Selector */}
           <div className="w-64">
             <label className="block text-xs font-mono text-slate-500 mb-2 uppercase">Select Combo (-combo)</label>
             <select 
                className="w-full bg-slate-950 text-slate-200 border border-slate-700 rounded p-2.5 focus:border-amber-500 focus:outline-none"
                value={selectedCombo || ''}
                onChange={(e) => setSelectedCombo(e.target.value)}
                disabled={isProcessing}
             >
               <option value="" disabled>-- Select a prompt combo --</option>
               {Object.keys(config.combos).map(key => (
                 <option key={key} value={key}>{key}</option>
               ))}
             </select>
           </div>

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
           
           {/* Run Button */}
           <button 
             onClick={handleProcess}
             disabled={isProcessing || !hasKey || selectedFiles.length === 0 || !selectedCombo}
             className={`px-6 py-2.5 rounded font-bold flex items-center gap-2 transition ${
               isProcessing || !hasKey || selectedFiles.length === 0 || !selectedCombo
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
             className={`px-6 py-2.5 rounded font-bold flex items-center gap-2 transition ${
               isProcessing 
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
                         <img src={res.imageUrl} alt="Generated" className="w-full h-full object-cover" />
                       )}
                       
                       {/* Overlay Actions */}
                       {res.status === 'completed' && (
                         <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                           <button 
                             onClick={() => handleDownload(res)}
                             className="bg-white text-black p-2 rounded-full hover:bg-slate-200 transition"
                             title="Download"
                           >
                             <Download size={20} />
                           </button>
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