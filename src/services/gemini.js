import axios from "axios";
import { INGREDIENTS_PROMPT, GENERATE_RECIPE_PROMPT } from "./utils/prompts.js";
import { validateRecipesResponse } from "./utils/validateRecipe.js";

class AIService {
  constructor() {
    this.apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY || "";
    this.baseUrl =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent";
    if (!this.apiKey) {
      throw new Error("EXPO_PUBLIC_GEMINI_API_KEY is not set");
    }
  }

  async callGeminiAPI(prompt, imageBase64) {
    const parts = [];

    if (imageBase64) {
      // Remove data URL prefix if present
      const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");

      parts.push({
        text: prompt,
      });
      parts.push({
        inline_data: {
          mime_type: "image/jpeg",
          data: base64Data,
        },
      });
    } else {
      parts.push({ text: prompt });
    }

    try {
      const requestBody = {
        contents: [
          {
            parts,
          },
        ],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2048,
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_ONLY_HIGH",
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_ONLY_HIGH",
          },
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_ONLY_HIGH",
          },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_ONLY_HIGH",
          },
        ],
      };

      const response = await axios.post(
        `${this.baseUrl}?key=${this.apiKey}`,
        requestBody,
        {
          headers: {
            "Content-Type": "application/json",
          },
          timeout: 30000, // 30 second timeout
        }
      );

      if (
        !response.data ||
        !response.data.candidates ||
        response.data.candidates.length === 0
      ) {
        throw new Error("No response from Gemini API");
      }

      const candidate = response.data.candidates[0];

      // Check if response was blocked by safety filters
      if (candidate.finishReason === "SAFETY") {
        throw new Error(
          "Content was blocked by safety filters. Please try with different ingredients or a different image."
        );
      }

      if (
        !candidate.content ||
        !candidate.content.parts ||
        candidate.content.parts.length === 0
      ) {
        throw new Error("Invalid response structure from Gemini API");
      }

      const text = candidate.content.parts[0].text;

      // Try to extract JSON from the response
      const jsonMatch =
        text.match(/```json\n?(.*?)\n?```/s) || text.match(/\{.*\}/s);
      if (jsonMatch) {
        try {
          const jsonStr = jsonMatch[1] || jsonMatch[0];
          return JSON.parse(jsonStr);
        } catch (parseError) {
          throw new Error("Failed to parse JSON response");
        }
      }

      // If no JSON found, try to parse the entire response
      try {
        return JSON.parse(text);
      } catch (parseError) {
        throw new Error("Response is not valid JSON");
      }
    } catch (error) {
      if (error.response) {
        if (error.response.status === 400) {
          throw new Error(
            "Invalid request to Gemini API. Please check your request format."
          );
        } else if (error.response.status === 401) {
          throw new Error(
            "Invalid API key. Please check your EXPO_PUBLIC_GEMINI_API_KEY."
          );
        } else if (error.response.status === 429) {
          throw new Error("Rate limit exceeded. Please try again later.");
        }
      }

      if (error.code === "ECONNABORTED") {
        throw new Error("Request timeout. Please try again.");
      }

      throw new Error(`Failed to process AI request: ${error.message}`);
    }
  }

  async identifyIngredients(input) {
    const prompt = INGREDIENTS_PROMPT;

    try {
      const result = await this.callGeminiAPI(prompt, input.photoDataUri);

      // Validate the response structure
      if (!result || !Array.isArray(result.ingredients)) {
        throw new Error("Invalid response format from AI service");
      }

      return result;
    } catch (error) {
      console.error("Error identifying ingredients:", error);
      throw new Error(`Failed to identify ingredients: ${error.message}`);
    }
  }

  async generateRecipes(input) {
    // Use the custom prompt if provided, otherwise use the default
    const prompt = input.prompt
      ? input.prompt
      : GENERATE_RECIPE_PROMPT({ ingredients: input.ingredients });

    try {
      const result = await this.callGeminiAPI(prompt);

      // Validate the response structure
      if (!result || !Array.isArray(result.recipes)) {
        throw new Error("Invalid response format from AI service");
      }

      // Validate recipes using shared utility
      validateRecipesResponse(result);

      return result;
    } catch (error) {
      console.error("Error generating recipes:", error);
      throw new Error(`Failed to generate recipes: ${error.message}`);
    }
  }
}

const aiService = new AIService();
export default aiService;
