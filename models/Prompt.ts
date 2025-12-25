export class Prompt {
  name: string;
  prompt: string;
  enabled: boolean;
  skip_beforeafter_prompt: boolean;

  constructor(name: string = '', prompt: string = '', enabled: boolean = false, skip_beforeafter_prompt: boolean = false) {
    this.name = name;
    this.prompt = prompt;
    this.enabled = enabled;
    this.skip_beforeafter_prompt = skip_beforeafter_prompt;
  }

  // Convert to plain object for Firestore
  toJSON(): { name: string; prompt: string; enabled: boolean; skip_beforeafter_prompt: boolean } {
    return {
      name: this.name,
      prompt: this.prompt,
      enabled: this.enabled,
      skip_beforeafter_prompt: this.skip_beforeafter_prompt
    };
  }

  // Create from plain object
  static fromJSON(data: { name: string; prompt: string; enabled: boolean; skip_beforeafter_prompt?: boolean }): Prompt {
    return new Prompt(data.name, data.prompt, data.enabled, data.skip_beforeafter_prompt ?? false);
  }
}

