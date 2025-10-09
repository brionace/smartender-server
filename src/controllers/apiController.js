import aiService from "../services/deepinfra.js";

export async function identifyImage(req, res) {
  try {
    const result = await aiService.identifyIngredients(req.body);
    res.json(result);
  } catch (error) {
    console.error("Error in identifyImage:", error);
    res
      .status(500)
      .json({
        status: "error",
        message: error.message || "Internal server error",
      });
  }
}

export async function getRecipes(req, res) {
  try {
    const result = await aiService.generateRecipes(req.body);
    res.json(result);
  } catch (error) {
    console.error("Error in getRecipes:", error);
    res
      .status(500)
      .json({
        status: "error",
        message: error.message || "Internal server error",
      });
  }
}

export function convertMeasurement(req, res) {
  // TODO: Implement measurement conversion logic
  const { value, unit, to } = req.query;
  res.json({
    message: "Measurement conversion not implemented yet.",
    value,
    unit,
    to,
  });
}
