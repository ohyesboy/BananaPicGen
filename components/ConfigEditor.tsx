import React, { useState, useEffect } from 'react';
import { AppConfig } from '../types';
import { Settings, Save, RotateCcw } from 'lucide-react';

interface ConfigEditorProps {
  config: AppConfig;
  onSave: (newConfig: AppConfig) => void;
}

export const ConfigEditor: React.FC<ConfigEditorProps> = ({ config, onSave }) => {
  const [jsonText, setJsonText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setJsonText(JSON.stringify(config, null, 2));
  }, [config]);

  const handleSave = () => {
    try {
      const parsed = JSON.parse(jsonText);
      // Basic validation
      if (!parsed.prompts || !parsed.combos || !parsed.input_file_pattern) {
        throw new Error("Missing required config keys (prompts, combos, input_file_pattern)");
      }
      setError(null);
      onSave(parsed);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleReset = () => {
    setJsonText(JSON.stringify(config, null, 2));
    setError(null);
  };

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 flex flex-col h-full">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2 text-slate-200 font-semibold">
          <Settings size={18} />
          <h3>config.json</h3>
        </div>
        <div className="flex gap-2">
           <button 
            onClick={handleReset}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition"
            title="Reset to current"
          >
            <RotateCcw size={16} />
          </button>
          <button 
            onClick={handleSave}
            className="p-1.5 text-green-400 hover:text-green-300 hover:bg-slate-700 rounded transition flex items-center gap-1 text-sm font-medium"
          >
            <Save size={16} />
            Apply
          </button>
        </div>
      </div>
      
      <textarea
        value={jsonText}
        onChange={(e) => setJsonText(e.target.value)}
        className="flex-1 bg-slate-950 text-slate-300 font-mono text-xs p-3 rounded border border-slate-800 focus:border-blue-500 focus:outline-none resize-none"
        spellCheck={false}
      />
      
      {error && (
        <div className="mt-2 text-red-400 text-xs font-mono bg-red-900/20 p-2 rounded">
          Error: {error}
        </div>
      )}
    </div>
  );
};