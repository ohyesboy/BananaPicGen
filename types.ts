export interface AppConfig {
  input_file_pattern: string;
  prompts: Record<string, string>;
  combos: Record<string, string>;
}

export interface ProcessingResult {
  id: string;
  originalFileName: string;
  promptName: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  imageUrl?: string;
  error?: string;
}

export interface LogEntry {
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    aistudio?: AIStudio;
  }
}