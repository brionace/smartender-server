// utils/validateRecipe.js

/**
 * Validates a single recipe object according to the new format.
 * Throws an error if invalid.
 */
export function validateRecipe(recipe) {
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
      typeof ing.amount !== "number" ||
      typeof ing.unit !== "string"
    ) {
      throw new Error("Invalid ingredient format in AI response");
    }
  }
  if (recipe.garnish && typeof recipe.garnish !== "string") {
    throw new Error("Invalid garnish format in AI response");
  }
  if (!("alcoholType" in recipe)) recipe.alcoholType = null;
  if (!("abv" in recipe)) recipe.abv = null;
  if (!("drinkColour" in recipe)) recipe.drinkColour = null;
}

/**
 * Validates an array of recipes (the top-level AI response)
 */
export function validateRecipesResponse(result) {
  if (!result || !Array.isArray(result.recipes)) {
    throw new Error("Invalid response format from AI service");
  }
  for (const recipe of result.recipes) {
    validateRecipe(recipe);
  }
}
