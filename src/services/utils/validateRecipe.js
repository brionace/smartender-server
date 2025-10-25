// utils/validateRecipe.js

/**
 * Validates a single recipe object according to the new format.
 * Throws an error if invalid.
 */
export function validateRecipe(recipe, providedIngredients = []) {
  if (
    !recipe.name ||
    !Array.isArray(recipe.ingredients) ||
    !Array.isArray(recipe.instructions) ||
    !recipe.suggestedGlass
  ) {
    throw new Error("Invalid recipe format in AI response");
  }
  const providedSet = new Set(
    providedIngredients.map((p) => p.toLowerCase().trim())
  );
  const missing = [];
  for (const ing of recipe.ingredients) {
    if (
      typeof ing !== "object" ||
      typeof ing.name !== "string" ||
      typeof ing.amount !== "number" ||
      typeof ing.unit !== "string"
    ) {
      throw new Error("Invalid ingredient format in AI response");
    }
    const name = ing.name.toLowerCase().trim();
    if (!providedSet.has(name)) {
      missing.push(ing.name);
    }
  }
  recipe.missingIngredients = missing;
  if (recipe.garnish && typeof recipe.garnish !== "string") {
    throw new Error("Invalid garnish format in AI response");
  }
  if (!("alcoholType" in recipe)) recipe.alcoholType = null;
  if (!("abv" in recipe)) recipe.abv = null;
  if (!("drinkColour" in recipe)) recipe.drinkColour = null;
  if (!("confidence" in recipe)) recipe.confidence = 1;
}

/**
 * Validates an array of recipes (the top-level AI response)
 */
export function validateRecipesResponse(result, options = {}) {
  // options: { providedIngredients: string[], combineOnly: boolean }
  const provided = options.providedIngredients || [];
  const combineOnly = !!options.combineOnly;
  // existingRecipes can be an array of strings or recipe objects; normalize to a list of lowercased names
  const existingRecipes = Array.isArray(options.existingRecipes)
    ? options.existingRecipes
        .map((r) => {
          if (r && typeof r === "object") {
            // prefer .name, fall back to title or string coercion
            return String(r.name || r.title || "")
              .toLowerCase()
              .trim();
          }
          return String(r || "")
            .toLowerCase()
            .trim();
        })
        .filter(Boolean)
    : [];

  if (!result || !Array.isArray(result.recipes)) {
    throw new Error("Invalid response format from AI service");
  }

  for (const recipe of result.recipes) {
    validateRecipe(recipe, provided);
    if (
      combineOnly &&
      recipe.missingIngredients &&
      recipe.missingIngredients.length > 0
    ) {
      throw new Error(
        "Recipe requires missing ingredients but combineOnly is set"
      );
    }
  }
  // Optionally reorder recipes: those with no missingIngredients first
  // Filter out recipes that already exist (by name, case-insensitive)
  if (existingRecipes.length > 0) {
    result.recipes = result.recipes.filter((r) => {
      const name = (r.name || "").toLowerCase().trim();
      return !existingRecipes.includes(name);
    });
  }

  result.recipes.sort(
    (a, b) => a.missingIngredients.length - b.missingIngredients.length
  );
}
