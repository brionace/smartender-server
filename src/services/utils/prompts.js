// export const INGREDIENTS_PROMPT = `You are an expert at identifying cocktail ingredients from images.

// A user has provided you with a photo. Your task is to identify all the potential cocktail ingredients in the image.
// Focus on identifying liquors, mixers, fruits, and other items commonly used in cocktails.
// If you see a bottle, identify the type of liquor or liqueur. If you see fruit, identify it.

// IMPORTANT: You must respond with ONLY valid JSON. Do not include any other text or formatting.

// Return a list of the identified ingredients in this exact JSON format:
// {
//   "ingredients": ["ingredient1", "ingredient2", "ingredient3"]
// }
// Example response (strict JSON):
// {
//   "ingredients": ["vodka", "lime", "mint", "simple syrup"],
//   "guesses": [],
//   "uncertain": false
// }`;
// ...existing code...
export const INGREDIENTS_PROMPT = (input) => {
  const existing = Array.isArray(input?.currentIngredients)
    ? input.currentIngredients
    : String(input?.currentIngredients || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

  return `You are an expert at identifying cocktail ingredients from images.

A user has provided you with a photo and the user's current ingredient list: ${JSON.stringify(
    existing
  )}

Task:
- Identify ingredients visible in the photo.
- Do NOT repeat any ingredient already present in the user's current ingredient list above.
- If an item in the photo matches an item in the current list, include it under "duplicates".
- If unsure about an item, include it under "guesses" and set "uncertain": true.

IMPORTANT: Respond with ONLY valid JSON and nothing else.

Return this exact JSON structure (use these exact property names):
{
  "ingredients": ["ingredientA", "ingredientB"],   // items detected (only those visible in the photo)
  "duplicates": ["ingredientX"],                    // items seen in the photo that are already in current list
  "guesses": ["possible1"],                         // optional when uncertain
  "uncertain": false                                  // or true when there are guesses
}

Notes:
- The top-level field MUST be named "ingredients" (an array of strings). Do not return "newIngredients".
- Only include ingredients you can see. Do not invent ingredients.
- If nothing is detected, return { "ingredients": [], "duplicates": [], "guesses": [], "uncertain": false }.

Example valid response:
{
  "ingredients": ["vodka", "mint"],
  "duplicates": ["lime"],
  "guesses": [],
  "uncertain": false
}`;
};

export const GENERATE_RECIPE_PROMPT = (input) => {
  const isAlcoholic = input?.filters?.isAlcoholic !== false;
  const measurementType =
    input?.filters?.measurementType === "metric" ? "metric" : "imperial";
  const ingredientsList = Array.isArray(input?.ingredients)
    ? input.ingredients
    : String(input?.ingredients || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
  const maxRecipes = ingredientsList.length <= 2 ? 1 : 5;

  return `You are a professional mixologist. Given these available ingredients: ${
    input.ingredients
  }

Return up to ${maxRecipes} ${
    isAlcoholic ? "cocktail" : "non-alcoholic"
  } recipes.

Rules (strict):
- Do NOT invent ingredients or amounts. Use only the provided ingredients unless you list missing items explicitly.
- Do NOT invent ingredients or amounts. Use only the provided ingredients unless you list missing items explicitly.
- For each recipe include a field "missingIngredients": an array of any ingredient names required but NOT in the provided list (empty array if none).
- Order recipes so those with empty "missingIngredients" come first.
- Exclude any recipes that appear on this list ${JSON.stringify(
    input?.recipes || []
  )}. Match by the recipe object's "ingredients" property.
- Use ${measurementType} units.
- Prefer concise recipes (max ${maxRecipes}).

For each recipe provide these exact fields:
- name
- ingredients: array of { name, amount (number), unit }
- instructions: array of short steps
- suggestedGlass
- garnish
- alcoholType
- drinkColour (hex)
- abv (number)
- missingIngredients: array of strings
- confidence: number between 0 and 1

If you cannot produce any recipes without inventing items, return an empty "recipes" array and include a top-level "explanation" string describing why.

IMPORTANT: Respond with ONLY valid JSON in this exact schema and nothing else. Example schema:
{
  "recipes": [
    {
      "name": "Recipe Name",
      "ingredients": [ { "name": "ingredient1", "amount": 1, "unit": "oz" } ],
      "instructions": ["Step 1"],
      "suggestedGlass": "Glass Type",
      "garnish": "Garnish",
      "alcoholType": "Alcohol Type",
      "drinkColour": "#A3C1AD",
      "abv": 12.5,
      "missingIngredients": [],
      "confidence": 0.9
    }
  ],
  "explanation": "optional when recipes is empty"
}
`;
};

export const GENERATE_RECIPE_PROMPT_SIMPLE = (input) => {
  const cocktail =
    input?.filters?.isAlcoholic === false ? "non-alcoholic" : "cocktail";
  const measurementType =
    input?.filters?.measurementType === "metric" ? "metric" : "imperial";
  const ingredientsList = Array.isArray(input?.ingredients)
    ? input.ingredients
    : String(input?.ingredients || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
  const maxRecipes = ingredientsList.length <= 2 ? 1 : 5;
  // remove accidental console logging in production

  return `You are a professional mixologist. Given these available ingredients: ${
    input.ingredients
  }

Return up to ${maxRecipes} ${cocktail} recipes.

Rules (strict):
- Do NOT invent ingredients or amounts. If a recipe requires items not in the provided list, list them in "missingIngredients".
- Order recipes so those with empty "missingIngredients" come first.
- Use ${measurementType} units.
- Exclude any recipes that appear on this list ${JSON.stringify(
    input?.recipes || []
  )}. Match by the recipe object's "ingredients" property.

For each recipe include these exact fields:
- name
- ingredients: array of { name, amount (number), unit }
- instructions: array of short steps
- suggestedGlass
- garnish
- alcoholType
- drinkColour (hex)
- abv (number)
- missingIngredients: array of strings
- confidence: number between 0 and 1

If no valid recipes can be produced without inventing items, return { "recipes": [], "explanation": "..." }.

IMPORTANT: Respond with ONLY valid JSON in this exact schema and nothing else.
`;
};
