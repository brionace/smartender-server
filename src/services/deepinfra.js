import axios from "axios";
import {
  INGREDIENTS_PROMPT,
  GENERATE_RECIPE_PROMPT,
  GENERATE_RECIPE_PROMPT_SIMPLE,
} from "./utils/prompts.js";
import logger from "../utils/logger.js";
import { validateRecipesResponse } from "./utils/validateRecipe.js";

class AIServiceOpenAI {
  apiKey;
  model;
  baseUrl = "https://api.deepinfra.com/v1/openai/chat/completions";

  constructor() {
    this.apiKey = process.env.EXPO_PUBLIC_DEEP_INFRA_KEY || "";
    this.model = process.env.EXPO_PUBLIC_DEEP_INFRA_MODAL || "";
    if (!this.apiKey) {
      throw new Error("EXPO_PUBLIC_DEEP_INFRA_KEY is not set");
    }
  }

  async callOpenAIAPI(prompt, imageBase64) {
    // OpenAI's vision models require a different format; for text-only, just send the prompt.
    const messages = [
      {
        role: "system",
        content:
          "You are a professional mixologist and culinary expert specializing in beverage recipes and food pairing.",
      },
      {
        role: "user",
        content: prompt,
      },
    ];

    // If imageBase64 is provided, add it as a content part (for GPT-4o vision)
    if (imageBase64) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: {
              url: imageBase64,
            },
          },
        ],
      });
    }

    // Use deterministic, faster settings
    try {
      const networkStart = Date.now();
      const response = await axios.post(
        this.baseUrl,
        {
          model: this.model,
          messages,
          max_tokens: 1024,
          temperature: 0.0,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          timeout: 60000,
        }
      );
      const networkLatencyMs = Date.now() - networkStart;

      const text =
        response.data.choices?.[0]?.message?.content ||
        response.data.choices?.[0]?.text;

      // Check if text is a string
      // if (typeof text !== "string") {
      //   throw new Error(
      //     `AI response was not a string. Type: ${typeof text}, Value: ${JSON.stringify(
      //       text
      //     )}`
      //   );
      // }

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
          throw new Error(
            `Failed to parse JSON response. Raw response: ${text}`
          );
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
        throw new Error(
          `AI response was not valid JSON. Raw response: ${text}`
        );
      }
    } catch (error) {
      logger.warn("DeepInfra call failed", { error: error?.message || error });
      if (error.response) {
        if (error.response.status === 400) {
          throw new Error(
            "Invalid request to OpenAI API. Please check your request format."
          );
        } else if (error.response.status === 401) {
          throw new Error(
            "Invalid API key. Please check your EXPO_PUBLIC_OPENAI_API_KEY."
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
    // const prompt = INGREDIENTS_PROMPT;
    const prompt = INGREDIENTS_PROMPT({
      currentIngredients: input.ingredients,
    });

    try {
      const response = await this.callOpenAIAPI(prompt, input.photoDataUri);
      // response may be { data, timings } when debug; normalize
      const payload = response && response.data ? response.data : response;

      // The prompt historically returned `ingredients: []`, but newer prompts
      // return `{ newIngredients: [], duplicates: [], guesses: [], uncertain }`.
      // Normalize both shapes into { ingredients: [...], duplicates: [...], guesses: [...], uncertain: boolean }
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
        // Try a permissive heuristic: look for any array of strings inside payload
        const findStringArray = (obj) => {
          if (!obj || typeof obj !== "object") return null;
          for (const key of Object.keys(obj)) {
            const v = obj[key];
            if (Array.isArray(v) && v.every((x) => typeof x === "string"))
              return v;
            if (typeof v === "object") {
              const nested = findStringArray(v);
              if (nested) return nested;
            }
          }
          return null;
        };

        const found = findStringArray(payload);
        if (found) {
          const normalized = {
            ingredients: found,
            duplicates: payload.duplicates || [],
            guesses: payload.guesses || [],
            uncertain: !!payload.uncertain,
          };
          logger.warn(
            "Used heuristic to extract ingredients from unexpected payload",
            { preview: JSON.stringify(found).slice(0, 500) }
          );
          return response && response.timings
            ? { data: normalized, timings: response.timings }
            : normalized;
        }

        // Log the unexpected payload for debugging (safe-truncate)
        try {
          const preview = JSON.stringify(payload).slice(0, 2000);
          logger.warn("Unexpected identify payload shape", { preview });
        } catch (e) {
          logger.warn("Unexpected identify payload shape (unserializable)");
        }
        throw new Error("Invalid response format from AI service");
      }

      return response && response.timings
        ? { data: normalized, timings: response.timings }
        : normalized;
    } catch (error) {
      logger.warn("Error identifying ingredients", {
        error: error?.message || error,
      });
      throw new Error(`Failed to identify ingredients: ${error.message}`);
    }
  }

  async generateRecipes(input) {
    // Use the custom prompt if provided, otherwise use the default
    const prompt = GENERATE_RECIPE_PROMPT_SIMPLE({
      ingredients: input.ingredients,
      filters: input.filters,
    });

    try {
      const response = await this.callOpenAIAPI(prompt);
      const result = response && response.data ? response.data : response;

      if (!result || !Array.isArray(result.recipes)) {
        throw new Error("Invalid response format from AI service");
      }

      // Normalize provided ingredients into an array of strings
      const providedIngredients = Array.isArray(input.ingredients)
        ? input.ingredients
        : String(input.ingredients || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

      // Validate recipes using shared utility and enforce combineOnly if requested
      validateRecipesResponse(result, {
        providedIngredients,
        combineOnly: !!input?.filters?.combineOnly,
        existingRecipes: input?.recipes || [],
      });

      return response && response.timings
        ? { data: result, timings: response.timings }
        : result;
    } catch (error) {
      logger.error("Error generating recipes", {
        error: error?.message || error,
      });
      throw new Error(`Failed to generate recipes: ${error.message}`);
    }
  }
}

const aiService = new AIServiceOpenAI();
export default aiService;
