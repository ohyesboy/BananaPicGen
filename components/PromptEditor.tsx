import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Trash2, Loader2, Check, GripVertical } from 'lucide-react';

interface PromptItem {
  name: string;
  prompt: string;
  enabled: boolean;
  skip_beforeafter_prompt: boolean;
}

interface PromptEditorProps {
  prompts: Array<{ name: string; prompt: string; enabled: boolean; skip_beforeafter_prompt: boolean }>;
  promptBefore?: string;
  promptAfter?: string;
  onSave: (prompts: Array<{ name: string; prompt: string; enabled: boolean; skip_beforeafter_prompt: boolean }>, promptBefore: string, promptAfter: string) => void;
  onChange?: (prompts: Array<{ name: string; prompt: string; enabled: boolean; skip_beforeafter_prompt: boolean }>, promptBefore: string, promptAfter: string) => void;
  isSaving?: boolean;
}

export const PromptEditor: React.FC<PromptEditorProps> = ({
  prompts,
  promptBefore = '',
  promptAfter = '',
  onSave,
  onChange,
  isSaving = false
}) => {
  const [items, setItems] = useState<PromptItem[]>([]);
  const [beforeText, setBeforeText] = useState(promptBefore);
  const [afterText, setAfterText] = useState(promptAfter);
  const [hasChanges, setHasChanges] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const lastInputTime = useRef<number>(Date.now());
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const itemsRef = useRef<PromptItem[]>([]);
  const beforeTextRef = useRef<string>(promptBefore);
  const afterTextRef = useRef<string>(promptAfter);
  const isLocalChange = useRef(false);
  const isInitialized = useRef(false);

  // Keep refs in sync
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    beforeTextRef.current = beforeText;
  }, [beforeText]);

  useEffect(() => {
    afterTextRef.current = afterText;
  }, [afterText]);

  // Sync beforeText and afterText from props
  useEffect(() => {
    if (!isLocalChange.current) {
      setBeforeText(promptBefore);
      setAfterText(promptAfter);
    }
  }, [promptBefore, promptAfter]);

  // Initialize items from props (only on first load or external changes)
  useEffect(() => {
    // Skip if this is a local change propagating back through props
    if (isLocalChange.current) {
      isLocalChange.current = false;
      return;
    }

    // Skip re-initialization after first load - local state is source of truth
    if (isInitialized.current) {
      return;
    }

    // Convert prompts array to PromptItem array
    const promptItems: PromptItem[] = prompts.map(p => ({
      name: p.name,
      prompt: p.prompt,
      enabled: p.enabled,
      skip_beforeafter_prompt: p.skip_beforeafter_prompt ?? false
    }));

    setItems(promptItems);
    setHasChanges(false);
    isInitialized.current = true;
  }, [prompts]);

  // Trigger save function using ref to get latest items
  const triggerSave = useCallback(() => {
    const currentItems = itemsRef.current;
    const currentBefore = beforeTextRef.current;
    const currentAfter = afterTextRef.current;
    console.log('[triggerSave] Saving items:', currentItems);

    // Convert items to prompts array
    const promptsArray = currentItems.map(item => ({
      name: item.name,
      prompt: item.prompt,
      enabled: item.enabled,
      skip_beforeafter_prompt: item.skip_beforeafter_prompt
    }));

    console.log('[triggerSave] Final prompts to save:', promptsArray);
    onSave(promptsArray, currentBefore, currentAfter);
    setHasChanges(false);
  }, [onSave]);

  // Notify parent of changes when items or before/after text changes
  useEffect(() => {
    if (!onChange || !isInitialized.current) return;

    // Mark this as a local change so we don't reset state when props update
    isLocalChange.current = true;

    // Convert items to prompts array
    const promptsArray = items.map(item => ({
      name: item.name,
      prompt: item.prompt,
      enabled: item.enabled,
      skip_beforeafter_prompt: item.skip_beforeafter_prompt
    }));

    onChange(promptsArray, beforeText, afterText);
  }, [items, beforeText, afterText, onChange]);

  // Auto-save logic: check every second if we have changes and no input for 5 seconds
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (!itemsRef.current.length) return;

      const hasUnsavedChanges = hasChanges;
      if (!hasUnsavedChanges) return;

      const timeSinceLastInput = Date.now() - lastInputTime.current;
      console.log('[AutoSave] Checking, timeSinceLastInput:', timeSinceLastInput, 'hasChanges:', hasUnsavedChanges);

      if (timeSinceLastInput >= 5000) {
        console.log('[AutoSave] Triggering save, items:', itemsRef.current);
        triggerSave();
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [triggerSave, hasChanges]);

  const recordInput = () => {
    console.log('[recordInput] Recording input, setting hasChanges to true');
    lastInputTime.current = Date.now();
    setHasChanges(true);
  };

  const handleNameChange = (index: number, name: string) => {
    recordInput();
    setItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], name };
      return next;
    });
  };

  const handlePromptChange = (index: number, prompt: string) => {
    recordInput();
    setItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], prompt };
      return next;
    });
  };

  const handleBeforeTextChange = (text: string) => {
    recordInput();
    setBeforeText(text);
  };

  const handleAfterTextChange = (text: string) => {
    recordInput();
    setAfterText(text);
  };

  const handleSelectionChange = (index: number, enabled: boolean) => {
    recordInput();
    setItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], enabled };
      return next;
    });
  };

  const handleSkipBeforeAfterChange = (index: number, skip: boolean) => {
    recordInput();
    setItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], skip_beforeafter_prompt: skip };
      return next;
    });
  };

  const handleAddPrompt = () => {
    recordInput();
    setItems(prev => {
      const next = [...prev, { name: '', prompt: '', enabled: false, skip_beforeafter_prompt: false }];
      return next;
    });
  };

  const handleDeletePrompt = (index: number) => {
    recordInput();
    setItems(prev => {
      const next = prev.filter((_, i) => i !== index);
      return next;
    });
  };

  // Drag and drop handlers
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (index: number) => {
    if (draggedIndex === null || draggedIndex === index) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    recordInput();
    setItems(prev => {
      const next = [...prev];
      const [draggedItem] = next.splice(draggedIndex, 1);
      next.splice(index, 0, draggedItem);
      return next;
    });

    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
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

      {/* Before/After Prompt Textboxes */}
      <div className="space-y-2 mb-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Before each prompt</label>
          <textarea
            value={beforeText}
            onChange={(e) => handleBeforeTextChange(e.target.value)}
            placeholder="Text to add before each prompt..."
            rows={2}
            className="w-full bg-slate-950 text-slate-300 text-xs px-2 py-1.5 rounded border border-slate-700 focus:border-amber-500 focus:outline-none resize-none"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">After each prompt</label>
          <textarea
            value={afterText}
            onChange={(e) => handleAfterTextChange(e.target.value)}
            placeholder="Text to add after each prompt..."
            rows={2}
            className="w-full bg-slate-950 text-slate-300 text-xs px-2 py-1.5 rounded border border-slate-700 focus:border-amber-500 focus:outline-none resize-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3">
        {items.length === 0 && (
          <div className="text-center text-slate-500 py-8">
            <p className="text-sm">No prompts yet.</p>
            <p className="text-xs mt-1">Click "Add" to create your first prompt.</p>
          </div>
        )}
        
        {items.map((item, index) => (
          <div 
            key={index} 
            className={`bg-slate-950 border rounded-lg p-3 space-y-2 transition-all ${
              draggedIndex === index 
                ? 'opacity-50 border-amber-500' 
                : dragOverIndex === index 
                  ? 'border-amber-400 border-2' 
                  : 'border-slate-800'
            }`}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={handleDragLeave}
            onDrop={() => handleDrop(index)}
            onDragEnd={handleDragEnd}
          >
            <div className="flex items-center gap-2">
              {/* Drag Handle */}
              <div className="cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-400 transition">
                <GripVertical size={16} />
              </div>
              
              {/* Checkbox */}
              <input
                type="checkbox"
                checked={item.enabled}
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

            {/* Skip Before/After Checkbox */}
            <div className="flex items-center gap-2 ml-6">
              <input
                type="checkbox"
                checked={item.skip_beforeafter_prompt}
                onChange={(e) => handleSkipBeforeAfterChange(index, e.target.checked)}
                className="w-3 h-3 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500 focus:ring-offset-0 cursor-pointer"
              />
              <label className="text-xs text-slate-400 cursor-pointer" onClick={() => handleSkipBeforeAfterChange(index, !item.skip_beforeafter_prompt)}>
                Skip before/after text
              </label>
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-3 pt-3 border-t border-slate-800">
        <p className="text-[10px] text-slate-500 text-center">
          Auto-saves 5 seconds after last edit
        </p>
      </div>
    </div>
  );
};
