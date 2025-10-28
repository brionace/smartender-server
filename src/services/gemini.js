import axios from "axios";
import { INGREDIENTS_PROMPT, GENERATE_RECIPE_PROMPT } from "./utils/prompts.js";
import { validateRecipesResponse } from "./utils/validateRecipe.js";
import logger from "../utils/logger.js";

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
          temperature: 0.0,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
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

      const networkStart = Date.now();
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
      const networkLatencyMs = Date.now() - networkStart;

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
      let parseLatencyMs = 0;
      if (jsonMatch) {
        try {
          const parseStart = Date.now();
          const jsonStr = jsonMatch[1] || jsonMatch[0];
          const parsed = JSON.parse(jsonStr);
          parseLatencyMs = Date.now() - parseStart;
          return {
            data: parsed,
            timings: {
              networkLatencyMs,
              parseLatencyMs,
              totalMs: networkLatencyMs + parseLatencyMs,
            },
          };
        } catch (parseError) {
          throw new Error("Failed to parse JSON response");
        }
      }

      // If no JSON found, try to parse the entire response
      try {
        const parseStart = Date.now();
        const parsed = JSON.parse(text);
        parseLatencyMs = Date.now() - parseStart;
        return {
          data: parsed,
          timings: {
            networkLatencyMs,
            parseLatencyMs,
            totalMs: networkLatencyMs + parseLatencyMs,
          },
        };
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

      logger.warn("Gemini API call failed", { error: error?.message || error });
      throw new Error(`Failed to process AI request: ${error.message}`);
    }
  }

  async identifyIngredients(input) {
    const prompt = INGREDIENTS_PROMPT({
      currentIngredients: input.ingredients,
    });

    try {
      const resp = await this.callGeminiAPI(prompt, input.photoDataUri);
      const payload = resp && resp.data ? resp.data : resp;

      // Normalize payload similar to deepinfra service
      let normalized = null;
      if (payload && Array.isArray(payload.ingredients)) {
        normalized = {
          ingredients: payload.ingredients,
          duplicates: payload.duplicates || [],
          guesses: payload.guesses || [],
          uncertain: !!payload.uncertain,
        };
      } else if (payload && Array.isArray(payload.newIngredients)) {
        normalized = {
          ingredients: payload.newIngredients,
          duplicates: payload.duplicates || [],
          guesses: payload.guesses || [],
          uncertain: !!payload.uncertain,
        };
      } else {
        throw new Error("Invalid response format from AI service");
      }

      return resp && resp.timings
        ? { data: normalized, timings: resp.timings }
        : normalized;
    } catch (error) {
      console.error("Error identifying ingredients:", error);
      throw new Error(`Failed to identify ingredients: ${error.message}`);
    }
  }

  async generateRecipes(input) {
    // Use the custom prompt if provided, otherwise use the default
    // const prompt = GENERATE_RECIPE_PROMPT({
    //   ingredients: input.ingredients,
    //   filters: input.filters,
    // });

    try {
      const resp = await this.callGeminiAPI(input.prompt);
      const result = resp && resp.data ? resp.data : resp;

      // Validate the response structure
      if (!result || !Array.isArray(result.recipes)) {
        throw new Error("Invalid response format from AI service");
      }

      const providedIngredients = Array.isArray(input.ingredients)
        ? input.ingredients
        : String(input.ingredients || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

      validateRecipesResponse(result, {
        providedIngredients,
        combineOnly: !!input?.filters?.combineOnly,
        existingRecipes: input?.recipes || [],
      });

      return resp && resp.timings
        ? { data: result, timings: resp.timings }
        : result;
    } catch (error) {
      console.error("Error generating recipes:", error);
      throw new Error(`Failed to generate recipes: ${error.message}`);
    }
  }
}

const aiService = new AIService();
export default aiService;
