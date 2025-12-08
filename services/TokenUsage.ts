export type ModelType = "gemini-2.5-flash-image" | "gemini-3-pro-image-preview";

// Pricing per model (in USD)
const PRICING = {
  "gemini-2.5-flash-image": {
    input: 0,                       // No token cost
    output_text: 0,                 // No token cost
    output_image: 0,                // No token cost
    output_imageflat: 0.039,        // $0.039 flat rate per image
  },
  "gemini-3-pro-image-preview": {
    input: 2.00 / 1_000_000,        // $2.00 per 1M tokens
    output_text: 12.00 / 1_000_000, // $12.00 per 1M tokens
    output_image: 120.00 / 1_000_000, // $120.00 per 1M tokens
    output_imageflat: 0,            // No flat rate
  },
};

export interface TokenUsageData {
  total: number;
  input: number;
  output_image: number;
  output_text: number;
  images: number;
  total_cost: number;
  historic_cost: number;
  historic_images: number;
}

export class TokenUsage {
  total: number = 0;
  input: number = 0;
  output_image: number = 0;
  output_text: number = 0;
  images: number = 0;
  total_cost: number = 0;
  historic_cost: number = 0;
  historic_images: number = 0;

  constructor(data?: Partial<TokenUsageData>) {
    if (data) {
      this.total = data.total ?? 0;
      this.input = data.input ?? 0;
      this.output_image = data.output_image ?? 0;
      this.output_text = data.output_text ?? 0;
      this.images = data.images ?? 0;
      this.total_cost = data.total_cost ?? 0;
      this.historic_cost = data.historic_cost ?? 0;
      this.historic_images = data.historic_images ?? 0;
    }
  }

  /**
   * Add a new item (API call result) and update all fields
   */
  addItem(
    input: number,
    output_text: number,
    output_image: number,
    model: ModelType
  ): void {
    const pricing = PRICING[model];

    // Update token counts
    this.input += input;
    this.output_text += output_text;
    this.output_image += output_image;
    this.total += input + output_text + output_image;
    this.images += 1;

    // Calculate cost for this item
    const itemCost =
      input * pricing.input +
      output_text * pricing.output_text +
      output_image * pricing.output_image +
      pricing.output_imageflat;

    // Update costs
    this.total_cost += itemCost;
    this.historic_cost += itemCost;
    this.historic_images += 1;
  }

  /**
   * Reset current session (keeps total_cost and historic_cost)
   */
  reset(): void {
    this.total = 0;
    this.input = 0;
    this.output_image = 0;
    this.output_text = 0;
    this.images = 0;
    this.total_cost = 0;
    // total_cost and historic_cost are preserved
  }

  /**
   * Get the current cost breakdown
   */
  getCostBreakdown(model: ModelType): {
    inputCost: number;
    outputCost: number;
    totalCost: number;
    historic_cost: number;
  } {
    const pricing = PRICING[model];

    return {
      inputCost: this.input * pricing.input,
      outputCost:
        this.output_text * pricing.output_text +
        this.output_image * pricing.output_image +
        this.images * pricing.output_imageflat,
      totalCost: this.total_cost,
      historic_cost: this.historic_cost,
    };
  }

  /**
   * Serialize to plain object (for localStorage)
   */
  toJSON(): TokenUsageData {
    return {
      total: this.total,
      input: this.input,
      output_image: this.output_image,
      output_text: this.output_text,
      images: this.images,
      total_cost: this.total_cost,
      historic_cost: this.historic_cost,
      historic_images: this.historic_images,
    };
  }

  /**
   * Create from plain object (from localStorage)
   */
  static fromJSON(data: Partial<TokenUsageData>): TokenUsage {
    return new TokenUsage(data);
  }

  /**
   * Create from localStorage with a given key
   */
  static fromLocalStorage(key: string): TokenUsage {
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        return TokenUsage.fromJSON(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Failed to parse saved token usage", e);
    }
    return new TokenUsage();
  }

  /**
   * Save to localStorage with a given key
   */
  saveToLocalStorage(key: string): void {
    localStorage.setItem(key, JSON.stringify(this.toJSON()));
  }
}
