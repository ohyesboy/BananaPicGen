import React, { useState, useEffect, useCallback } from 'react';
import { AppConfig, LogEntry, ProcessingResult } from './types';
import { Terminal } from './components/Terminal';
import { ConfigEditor } from './components/ConfigEditor';
import { generateImageFromReference, fileToBase64 } from './services/geminiService';
import { FolderOpen, Play, Download, Image as ImageIcon, CheckCircle, AlertCircle, Loader2, Key, Trash2 } from 'lucide-react';
import defaultConfig from './config.json';

const DEFAULT_CONFIG: AppConfig = defaultConfig;

const App: React.FC = () => {
  // Config State
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  
  // App State
  const [hasKey, setHasKey] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedCombo, setSelectedCombo] = useState<string | null>(null);
  const [results, setResults] = useState<ProcessingResult[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [tokenUsage, setTokenUsage] = useState({ total: 0, input: 0, output: 0 });

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
      if (process.env.API_KEY) {
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
      
      // Preview regex match
      try {
        const regex = new RegExp(config.input_file_pattern, 'i');
        const matches = files.filter(f => regex.test(f.name));
        log(`Pattern "${config.input_file_pattern}" matches ${matches.length} of ${files.length} files.`, matches.length > 0 ? 'success' : 'warning');
      } catch (err) {
        log(`Invalid Regex Pattern: ${config.input_file_pattern}`, 'error');
      }
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
    
    // 1. Filter Files
    let filesToProcess: File[] = [];
    try {
      const regex = new RegExp(config.input_file_pattern, 'i');
      filesToProcess = selectedFiles.filter(f => regex.test(f.name));
    } catch (err) {
      log("Regex Error. Aborting.", "error");
      setIsProcessing(false);
      return;
    }

    if (filesToProcess.length === 0) {
      log("No files matched the configuration pattern.", "warning");
      setIsProcessing(false);
      return;
    }

    log(`Starting batch for ${filesToProcess.length} matched files...`, "info");

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
          config.aspectRatio,
          config.imageSize
        );
        
        setTokenUsage(prev => ({
          total: prev.total + usage.total,
          input: prev.input + usage.input,
          output: prev.output + usage.output
        }));
        updateResultStatus(i, 'completed', imageUrl);
        log(`Success: ${file.name} (${task.promptName}) generated. Tokens: ${usage.total} (In: ${usage.input}, Out: ${usage.output})`, "success");
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
    log("Results cleared.", "info");
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
          <h1 className="font-bold text-xl tracking-tight text-amber-500">Banana Pro</h1>
          <button onClick={() => setShowConfig(false)} className="md:hidden text-slate-400"><CheckCircle/></button>
        </div>
        
        <div className="flex-1 p-4 overflow-hidden">
          <ConfigEditor 
            config={config} 
            onSave={(newConf) => {
              setConfig(newConf);
              log("Configuration updated.", "success");
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
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Input</span>
                  <span className="text-sm font-mono text-blue-400">{tokenUsage.input.toLocaleString()}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Output</span>
                  <span className="text-sm font-mono text-green-400">{tokenUsage.output.toLocaleString()}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Total</span>
                  <span className="text-sm font-mono text-amber-400">{tokenUsage.total.toLocaleString()}</span>
                </div>
             </div>
          </div>
          
          <div className="flex items-center gap-4">
             <div className="relative">
                <input 
                  type="file" 
                  multiple 
                  onChange={handleFileSelect} 
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <button className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-md transition border border-slate-700">
                  <FolderOpen size={18} />
                  <span>{selectedFiles.length > 0 ? `${selectedFiles.length} files selected` : 'Select Files (Path)'}</span>
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
             RUN BATCH
           </button>

           {/* Clear Button */}
           <button 
             onClick={handleClear}
             disabled={isProcessing || results.length === 0}
             className={`px-6 py-2.5 rounded font-bold flex items-center gap-2 transition ${
               isProcessing || results.length === 0
               ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
               : 'bg-slate-700 hover:bg-red-600 text-white'
             }`}
           >
             <Trash2 size={20} />
             CLEAR
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