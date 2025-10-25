import aiService from "../services/deepinfra.js";
import { getCached, setCached } from "../db/cache.js";

export async function identifyImage(req, res) {
  try {
    const ttlMs = Number(process.env.CACHE_TTL_MS || 1000 * 60 * 60 * 24 * 7);
    const cached = await getCached("identify", req.body, ttlMs);
    if (cached) return res.json(cached);

    const result = await aiService.identifyIngredients(req.body);
    await setCached("identify", req.body, result);
    res.json(result);
  } catch (error) {
    console.error("Error in identifyImage:", error);
    res.status(500).json({
      status: "error",
      message: error.message || "Internal server error",
    });
  }
}

export async function getRecipes(req, res) {
  try {
    const ttlMs = Number(process.env.CACHE_TTL_MS || 1000 * 60 * 60 * 24 * 7);
    const cached = await getCached("recipes", req.body, ttlMs);
    if (cached) return res.json(cached);

    const result = await aiService.generateRecipes(req.body);
    await setCached("recipes", req.body, result);
    res.json(result);
  } catch (error) {
    console.error("Error in getRecipes:", error);
    res.status(500).json({
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
