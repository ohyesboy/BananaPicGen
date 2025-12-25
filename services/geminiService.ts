import { GoogleGenAI } from "@google/genai";

export const generateImageFromReference = async (
  inputFiles: File[],
  promptText: string,
  aspectRatio: string = "4:5",
  imageSize: string = "2K",
  modelName: string = 'gemini-2.5-flash-image',
  temperature: number = 1.0
): Promise<{ imageUrl: string; usage: { total: number; input: number; output_image: number; output_text: number } }> => {
  try {
    // We must instantiate a new client for each request to ensure we pick up the latest API key
    // if the user re-selected it via window.aistudio.
    const apiKey = window.env?.API_KEY || process.env.API_KEY;
    const ai = new GoogleGenAI({ apiKey });

    const inlineDataArray = [];
    for (const file of inputFiles) {
      const base64Data = await fileToBase64(file);
      inlineDataArray.push({
        inlineData: {
          mimeType: file.type,
          data: base64Data
        }
      });
    }
    
    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          {
            text: promptText,
          },
          ...inlineDataArray,
        ],
      },
      // gemini-2.5-flash-image configuration
      config: {
        temperature: temperature,
        imageConfig: {
          aspectRatio: aspectRatio,
          imageSize: modelName === 'gemini-2.5-flash-image' ? undefined : imageSize.toUpperCase() 
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
             const usage = {
               total: response.usageMetadata?.totalTokenCount || 0,
               input: (response.usageMetadata?.promptTokenCount || 0)+(response.usageMetadata?.toolUsePromptTokenCount || 0),
               output_image: (response.usageMetadata?.candidatesTokenCount || 0),
               output_text: (response.usageMetadata?.thoughtsTokenCount || 0),
             };
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