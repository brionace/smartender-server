import aiService from "../services/deepinfra.js";
import { getCached, setCached } from "../db/cache.js";
import { getPool, query } from "../db/client.js";
import fs from "fs/promises";
import path from "path";

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

export async function browseRecipes(req, res) {
  try {
    const limit = Math.min(parseInt(req.query.limit || "20", 10) || 20, 100);
    const sort = req.query.sort === "recent" ? "recent" : "popular";

    const pool = getPool();
    let entries = [];

    if (pool) {
      try {
        const order = sort === "recent" ? "created_at DESC" : "hits DESC";
        const q = `SELECT result, hits, created_at FROM ai_cache WHERE endpoint=$1 ORDER BY ${order} LIMIT $2`;
        const { rows } = await query(q, ["recipes", limit * 3]);
        entries = rows.map((r) => ({
          result: r.result,
          hits: r.hits,
          created_at: r.created_at,
        }));
      } catch (e) {
        console.warn(
          "browseRecipes DB query failed, falling back to file cache:",
          e?.message || e
        );
      }
    }

    // If no DB entries, fallback to file cache
    if (!entries || entries.length === 0) {
      try {
        const dir = path.join(process.cwd(), "data", "cache", "recipes");
        const files = await fs.readdir(dir).catch(() => []);
        const items = [];
        for (const f of files) {
          try {
            const raw = await fs.readFile(path.join(dir, f), "utf8");
            const parsed = JSON.parse(raw);
            const result = parsed?.data?.result ?? parsed?.result ?? null;
            if (result) items.push({ result, meta: parsed?.meta });
          } catch (e) {
            // ignore
          }
        }
        entries = items;
      } catch (e) {
        console.warn(
          "Failed to read file cache for browsing:",
          e?.message || e
        );
      }
    }

    // Aggregate recipes from cached entries, dedupe by name (case-insensitive)
    const seen = new Set();
    const aggregated = [];
    for (const e of entries) {
      const recipes = Array.isArray(e.result?.recipes) ? e.result.recipes : [];
      for (const r of recipes) {
        const name = (r?.name || r?.title || "")
          .toString()
          .trim()
          .toLowerCase();
        if (!name) continue;
        if (seen.has(name)) continue;
        seen.add(name);
        aggregated.push(r);
        if (aggregated.length >= limit) break;
      }
      if (aggregated.length >= limit) break;
    }

    res.json({
      source: pool ? "db-or-file" : "file-only",
      count: aggregated.length,
      recipes: aggregated,
    });
  } catch (error) {
    console.error("Error in browseRecipes:", error);
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
