export class Prompt {
  name: string;
  prompt: string;
  enabled: boolean;

  constructor(name: string = '', prompt: string = '', enabled: boolean = false) {
    this.name = name;
    this.prompt = prompt;
    this.enabled = enabled;
  }

  // Convert to plain object for Firestore
  toJSON(): { name: string; prompt: string; enabled: boolean } {
    return {
      name: this.name,
      prompt: this.prompt,
      enabled: this.enabled
    };
  }

  // Create from plain object
  static fromJSON(data: { name: string; prompt: string; enabled: boolean }): Prompt {
    return new Prompt(data.name, data.prompt, data.enabled);
  }
}

