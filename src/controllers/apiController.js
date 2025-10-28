import aiService from "../services/deepinfra.js";
import { getCached, setCached } from "../db/cache.js";
import { getPool, query } from "../db/client.js";
import fs from "fs/promises";
import path from "path";
import { title } from "process";
import logger from "../utils/logger.js";

export async function identifyImage(req, res) {
  try {
    const ttlMs = Number(process.env.CACHE_TTL_MS || 1000 * 60 * 60 * 24 * 7);
    const debug =
      req.query.debug === "1" ||
      req.headers["x-debug"] === "1" ||
      req.headers["x-debug"] === "true";

    const cached = await getCached("identify", req.body, ttlMs, { debug });
    if (debug && cached) {
      // cached is { data, timings }
      const payload = cached.data ?? null;
      const dbg = { cache: cached.timings };
      res.setHeader("x-debug-info", JSON.stringify(dbg));
      return res.json({ ...payload, _debug: dbg });
    }
    if (!debug && cached) return res.json(cached);

    const aiResp = await aiService.identifyIngredients(req.body, { debug });
    const result = aiResp && aiResp.data ? aiResp.data : aiResp;
    const aiLatencyMs =
      aiResp && aiResp.timings ? aiResp.timings.totalMs : undefined;

    const writeResult = await setCached("identify", req.body, result, {
      debug,
    });

    if (debug) {
      const dbg = { cache: writeResult?.timings ?? null, aiLatencyMs };
      res.setHeader("x-debug-info", JSON.stringify(dbg));
      return res.json({ ...result, _debug: dbg });
    }

    res.json(result);
  } catch (error) {
    logger.error("Error in identifyImage", { error: error?.message || error });
    res.status(500).json({
      status: "error",
      message: error.message || "Internal server error",
    });
  }
}

export async function getRecipes(req, res) {
  try {
    const ttlMs = Number(process.env.CACHE_TTL_MS || 1000 * 60 * 60 * 24 * 7);
    const debug =
      req.query.debug === "1" ||
      req.headers["x-debug"] === "1" ||
      req.headers["x-debug"] === "true";

    const cached = await getCached("recipes", req.body, ttlMs, { debug });
    if (debug && cached) {
      const payload = cached.data ?? null;
      const dbg = { cache: cached.timings };
      res.setHeader("x-debug-info", JSON.stringify(dbg));
      return res.json({ ...payload, _debug: dbg });
    }
    if (!debug && cached) return res.json(cached);

    const aiResp = await aiService.generateRecipes(req.body, { debug });
    const result = aiResp && aiResp.data ? aiResp.data : aiResp;
    const aiLatencyMs =
      aiResp && aiResp.timings ? aiResp.timings.totalMs : undefined;

    const writeResult = await setCached("recipes", req.body, result, { debug });

    if (debug) {
      const dbg = { cache: writeResult?.timings ?? null, aiLatencyMs };
      res.setHeader("x-debug-info", JSON.stringify(dbg));
      return res.json({ ...result, _debug: dbg });
    }

    res.json(result);
  } catch (error) {
    logger.error("Error in getRecipes", { error: error?.message || error });
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
        logger.warn(
          "browseRecipes DB query failed, falling back to file cache",
          { error: e?.message || e }
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
            logger.warn("Failed to parse file cache entry during browse", {
              file: f,
              error: e?.message || e,
            });
          }
        }
        entries = items;
      } catch (e) {
        logger.warn("Failed to read file cache for browsing", {
          error: e?.message || e,
        });
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
      title:
        sort === "recent" ? "Recently Generated Recipes" : "Popular Recipes",
    });
  } catch (error) {
    logger.error("Error in browseRecipes", { error: error?.message || error });
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
