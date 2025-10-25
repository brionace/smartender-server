import assert from "assert";
import { validateRecipesResponse } from "../src/services/utils/validateRecipe.js";

function makeRecipe(name, ingredients, missing = []) {
  return {
    name,
    ingredients: ingredients.map((i) => ({ name: i, amount: 1, unit: "oz" })),
    instructions: ["Mix"],
    suggestedGlass: "Glass",
    garnish: "None",
    alcoholType: "None",
    drinkColour: "#FFFFFF",
    abv: 0,
    confidence: 0.9,
  };
}

function run() {
  // Happy path: all provided
  const provided = ["vodka", "lime", "mint"];
  const r1 = makeRecipe("R1", ["vodka", "lime"]);
  const result1 = { recipes: [r1] };
  validateRecipesResponse(result1, {
    providedIngredients: provided,
    combineOnly: false,
  });
  assert(
    result1.recipes[0].missingIngredients.length === 0,
    "missingIngredients should be empty"
  );

  // Missing ingredient reported
  const r2 = makeRecipe("R2", ["vodka", "orange"]);
  const result2 = { recipes: [r2] };
  validateRecipesResponse(result2, {
    providedIngredients: provided,
    combineOnly: false,
  });
  assert(
    result2.recipes[0].missingIngredients.includes("orange"),
    "missingIngredients should include orange"
  );

  // combineOnly enforcement should throw
  const r3 = makeRecipe("R3", ["vodka", "orange"]);
  const result3 = { recipes: [r3] };
  let threw = false;
  try {
    validateRecipesResponse(result3, {
      providedIngredients: provided,
      combineOnly: true,
    });
  } catch (e) {
    threw = true;
  }
  assert(
    threw,
    "Should throw when combineOnly is true and missing ingredients exist"
  );

  // Deduplication: if input.recipes contains a recipe name, it should be removed (case-insensitive)
  const r4 = makeRecipe("Mojito", ["rum", "mint", "lime"]);
  const r5 = makeRecipe("Classic Mojito", ["rum", "mint", "lime"]);
  const result4 = { recipes: [r4, r5] };
  validateRecipesResponse(result4, {
    providedIngredients: ["rum", "mint", "lime"],
    combineOnly: false,
    existingRecipes: ["mojito"],
  });
  // result4.recipes should not include the 'Mojito' entry (case-insensitive match)
  const names = result4.recipes.map((r) => r.name.toLowerCase());
  assert(!names.includes("mojito"), "Deduplication should remove 'Mojito'");

  console.log("All tests passed");
}

run();
