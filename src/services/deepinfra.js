import axios from "axios";
import { INGREDIENTS_PROMPT, GENERATE_RECIPE_PROMPT } from "./types.js";

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

    try {
      const response = await axios.post(
        this.baseUrl,
        {
          model: this.model,
          messages,
          max_tokens: 2048,
          temperature: 0.7,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          timeout: 30000,
        }
      );

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
      if (jsonMatch) {
        try {
          const jsonStr = jsonMatch[1] || jsonMatch[0];
          return JSON.parse(jsonStr);
        } catch (parseError) {
          throw new Error(
            `Failed to parse JSON response. Raw response: ${text}`
          );
        }
      }

      // If no JSON found, try to parse the entire response
      try {
        return JSON.parse(text);
      } catch (parseError) {
        throw new Error(
          `AI response was not valid JSON. Raw response: ${text}`
        );
      }
    } catch (error) {
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
    const prompt = INGREDIENTS_PROMPT;

    try {
      const result = await this.callOpenAIAPI(prompt, input.photoDataUri);

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
      const result = await this.callOpenAIAPI(prompt);

      if (!result || !Array.isArray(result.recipes)) {
        throw new Error("Invalid response format from AI service");
      }

      for (const recipe of result.recipes) {
        if (
          !recipe.name ||
          !Array.isArray(recipe.ingredients) ||
          !Array.isArray(recipe.instructions) ||
          !recipe.suggestedGlass
        ) {
          throw new Error("Invalid recipe format in AI response");
        }
        for (const ing of recipe.ingredients) {
          if (
            typeof ing !== "object" ||
            typeof ing.name !== "string" ||
            typeof ing.measurement !== "string"
          ) {
            throw new Error("Invalid ingredient format in AI response");
          }
        }
        if (recipe.garnish && typeof recipe.garnish !== "string") {
          throw new Error("Invalid garnish format in AI response");
        }
        if (!("alcoholType" in recipe)) recipe.alcoholType = null;
        if (!("abv" in recipe)) recipe.abv = null;
      }

      return result;
    } catch (error) {
      console.error("Error generating recipes:", error);
      throw new Error(`Failed to generate recipes: ${error.message}`);
    }
  }
}

const aiService = new AIServiceOpenAI();
export default aiService;
