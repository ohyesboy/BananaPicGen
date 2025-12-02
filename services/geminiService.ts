import { GoogleGenAI } from "@google/genai";

const MODEL_NAME = 'gemini-3-pro-image-preview'; // Nano banana pro

export const generateImageFromReference = async (
  referenceImageBase64: string,
  mimeType: string,
  promptText: string,
  aspectRatio: string = "4:5",
  imageSize: string = "2K"
): Promise<{ imageUrl: string; usage: number }> => {
  try {
    // We must instantiate a new client for each request to ensure we pick up the latest API key
    // if the user re-selected it via window.aistudio.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          {
            text: promptText,
          },
          {
            inlineData: {
              mimeType: mimeType,
              data: referenceImageBase64,
            },
          },
        ],
      },
      // Nano banana pro / gemini-3-pro-image-preview specific configuration
      // Assuming we want standard square aspect ratio unless specified otherwise, but strict instructions say default 1:1
      config: {
         imageConfig: {
           aspectRatio: aspectRatio,
           imageSize: imageSize // Defaulting to 1K for speed/stability
         }
      }
    });

    // Extract image from response
    if (response.candidates && response.candidates.length > 0) {
      const parts = response.candidates[0].content?.parts;
      if (parts) {
        for (const part of parts) {
          if (part.inlineData && part.inlineData.data) {
             const imageUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
             const usage = response.usageMetadata?.totalTokenCount || 0;
             return { imageUrl, usage };
          }
        }
      }
    }
    
    throw new Error("No image data found in response");

  } catch (error: any) {
    console.error("Gemini Generation Error:", error);
    throw new Error(error.message || "Unknown error during generation");
  }
};

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        // Remove the data URL prefix (e.g., "data:image/jpeg;base64,") to get just the base64 string
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      } else {
        reject(new Error("Failed to read file"));
      }
    };
    reader.onerror = error => reject(error);
  });
};