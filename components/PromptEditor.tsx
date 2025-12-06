import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Trash2, Loader2, Check } from 'lucide-react';

interface PromptItem {
  name: string;
  prompt: string;
  selected: boolean;
}

interface PromptEditorProps {
  prompts: Record<string, string>;
  selectedPrompts: string;
  onSave: (prompts: Record<string, string>, selectedPrompts: string) => void;
  onChange?: (prompts: Record<string, string>, selectedPrompts: string) => void;
  isSaving?: boolean;
}

export const PromptEditor: React.FC<PromptEditorProps> = ({ 
  prompts, 
  selectedPrompts, 
  onSave,
  onChange,
  isSaving = false
}) => {
  const [items, setItems] = useState<PromptItem[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const lastInputTime = useRef<number>(Date.now());
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize items from props
  useEffect(() => {
    const selectedSet = new Set(selectedPrompts.split(',').map(s => s.trim()).filter(Boolean));
    const promptItems: PromptItem[] = Object.entries(prompts).map(([name, prompt]) => ({
      name,
      prompt: prompt as string,
      selected: selectedSet.has(name)
    }));
    setItems(promptItems);
    setHasChanges(false);
  }, [prompts, selectedPrompts]);

  // Auto-save logic: save if changes exist and no input for 10 seconds
  useEffect(() => {
    if (!hasChanges) return;

    const checkAndSave = () => {
      const timeSinceLastInput = Date.now() - lastInputTime.current;
      if (timeSinceLastInput >= 10000 && hasChanges) {
        triggerSave();
      }
    };

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout to check after 10 seconds from last input
    saveTimeoutRef.current = setTimeout(checkAndSave, 10000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [hasChanges, items]);

  const triggerSave = useCallback(() => {
    // Build prompts object and selected string
    const newPrompts: Record<string, string> = {};
    const selectedNames: string[] = [];

    items.forEach(item => {
      if (item.name.trim()) {
        newPrompts[item.name.trim()] = item.prompt;
        if (item.selected) {
          selectedNames.push(item.name.trim());
        }
      }
    });

    onSave(newPrompts, selectedNames.join(','));
    setHasChanges(false);
  }, [items, onSave]);

  // Notify parent of changes immediately (for local state updates)
  const notifyChange = useCallback((updatedItems: PromptItem[]) => {
    if (!onChange) return;
    
    const newPrompts: Record<string, string> = {};
    const selectedNames: string[] = [];

    updatedItems.forEach(item => {
      if (item.name.trim()) {
        newPrompts[item.name.trim()] = item.prompt;
        if (item.selected) {
          selectedNames.push(item.name.trim());
        }
      }
    });

    onChange(newPrompts, selectedNames.join(','));
  }, [onChange]);

  const recordInput = () => {
    lastInputTime.current = Date.now();
    setHasChanges(true);
  };

  const handleNameChange = (index: number, name: string) => {
    recordInput();
    setItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], name };
      notifyChange(next);
      return next;
    });
  };

  const handlePromptChange = (index: number, prompt: string) => {
    recordInput();
    setItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], prompt };
      notifyChange(next);
      return next;
    });
  };

  const handleSelectionChange = (index: number, selected: boolean) => {
    recordInput();
    setItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], selected };
      notifyChange(next);
      return next;
    });
  };

  const handleAddPrompt = () => {
    recordInput();
    setItems(prev => {
      const next = [...prev, { name: '', prompt: '', selected: false }];
      notifyChange(next);
      return next;
    });
  };

  const handleDeletePrompt = (index: number) => {
    recordInput();
    setItems(prev => {
      const next = prev.filter((_, i) => i !== index);
      notifyChange(next);
      return next;
    });
  };

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 flex flex-col h-full">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2 text-slate-200 font-semibold">
          <span>Prompts</span>
          {hasChanges && !isSaving && (
            <span className="text-xs text-amber-400 font-normal">(unsaved)</span>
          )}
          {isSaving && (
            <Loader2 size={14} className="animate-spin text-amber-400" />
          )}
          {!hasChanges && !isSaving && items.length > 0 && (
            <Check size={14} className="text-green-400" />
          )}
        </div>
        <button 
          onClick={handleAddPrompt}
          className="p-1.5 text-green-400 hover:text-green-300 hover:bg-slate-700 rounded transition flex items-center gap-1 text-sm font-medium"
        >
          <Plus size={16} />
          Add
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto space-y-3">
        {items.length === 0 && (
          <div className="text-center text-slate-500 py-8">
            <p className="text-sm">No prompts yet.</p>
            <p className="text-xs mt-1">Click "Add" to create your first prompt.</p>
          </div>
        )}
        
        {items.map((item, index) => (
          <div key={index} className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              {/* Checkbox */}
              <input
                type="checkbox"
                checked={item.selected}
                onChange={(e) => handleSelectionChange(index, e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500 focus:ring-offset-0 cursor-pointer"
              />
              
              {/* Name Input */}
              <input
                type="text"
                value={item.name}
                onChange={(e) => handleNameChange(index, e.target.value)}
                placeholder="Prompt name..."
                className="flex-1 bg-slate-900 text-slate-200 text-sm px-2 py-1.5 rounded border border-slate-700 focus:border-amber-500 focus:outline-none"
              />
              
              {/* Delete Button */}
              <button
                onClick={() => handleDeletePrompt(index)}
                className="p-1 text-slate-500 hover:text-red-400 transition"
              >
                <Trash2 size={14} />
              </button>
            </div>
            
            {/* Prompt Textarea */}
            <textarea
              value={item.prompt}
              onChange={(e) => handlePromptChange(index, e.target.value)}
              placeholder="Enter your prompt text..."
              rows={3}
              className="w-full bg-slate-900 text-slate-300 text-xs px-2 py-1.5 rounded border border-slate-700 focus:border-amber-500 focus:outline-none resize-none"
            />
          </div>
        ))}
      </div>
      
      <div className="mt-3 pt-3 border-t border-slate-800">
        <p className="text-[10px] text-slate-500 text-center">
          Auto-saves 10 seconds after last edit
        </p>
      </div>
    </div>
  );
};
