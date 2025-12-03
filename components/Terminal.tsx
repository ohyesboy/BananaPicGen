import React, { useEffect, useRef, useState } from 'react';
import { LogEntry } from '../types';
import { Terminal as TerminalIcon, ChevronDown, ChevronRight } from 'lucide-react';

interface TerminalProps {
  logs: LogEntry[];
}

const STORAGE_KEY_TERMINAL_COLLAPSED = 'banana_pic_gen_terminal_collapsed';

export const Terminal: React.FC<TerminalProps> = ({ logs }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem(STORAGE_KEY_TERMINAL_COLLAPSED) === 'true';
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_TERMINAL_COLLAPSED, String(isCollapsed));
  }, [isCollapsed]);

  useEffect(() => {
    if (!isCollapsed && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isCollapsed]);

  return (
    <div className={`bg-slate-950 border border-slate-700 rounded-lg overflow-hidden flex flex-col shadow-2xl transition-all duration-300 ${isCollapsed ? 'h-auto' : 'h-64'}`}>
      <div 
        className="bg-slate-800 px-4 py-2 flex items-center justify-between border-b border-slate-700 cursor-pointer hover:bg-slate-700/80 transition-colors"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-2">
          <TerminalIcon size={16} className="text-slate-400" />
          <span className="text-xs font-mono text-slate-300">Console Output</span>
        </div>
        {isCollapsed ? <ChevronRight size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
      </div>
      {!isCollapsed && (
        <div 
          ref={scrollRef}
          className="flex-1 p-4 overflow-y-auto font-mono text-sm space-y-1"
        >
          {logs.length === 0 && (
            <div className="text-slate-600 italic">Waiting for input...</div>
          )}
          {logs.map((log, idx) => (
            <div key={idx} className="flex gap-3">
              <span className="text-slate-500 shrink-0">[{log.timestamp}]</span>
              <span className={`${
                log.type === 'error' ? 'text-red-400' :
                log.type === 'success' ? 'text-green-400' :
                log.type === 'warning' ? 'text-yellow-400' :
                'text-slate-300'
              }`}>
                {log.message}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};