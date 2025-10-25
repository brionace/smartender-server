import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { getPool, query } from "./client.js";

let ensurePromise = null;

function stableStringify(value) {
  const seen = new WeakSet();
  const s = (v) => {
    if (v && typeof v === "object") {
      if (seen.has(v)) return '"[Circular]"';
      seen.add(v);
      if (Array.isArray(v)) return `[${v.map(s).join(",")}]`;
      const keys = Object.keys(v).sort();
      return `{${keys.map((k) => `"${k}":${s(v[k])}`).join(",")}}`;
    }
    return JSON.stringify(v);
  };
  return s(value);
}

function hashKey(endpoint, body) {
  const str = stableStringify({ endpoint, body });
  return crypto.createHash("sha256").update(str).digest("hex");
}

async function ensureTable() {
  if (ensurePromise) return ensurePromise;
  const pool = getPool();
  if (!pool) {
    // DB not configured; skip creating table
    ensurePromise = Promise.resolve();
    return ensurePromise;
  }
  ensurePromise = query(`
    CREATE TABLE IF NOT EXISTS ai_cache (
      id BIGSERIAL PRIMARY KEY,
      endpoint TEXT NOT NULL,
      body_hash TEXT NOT NULL,
      body JSONB NOT NULL,
      result JSONB NOT NULL,
      hits INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_accessed TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      meta JSONB
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_cache_endpoint_hash ON ai_cache (endpoint, body_hash);
    CREATE INDEX IF NOT EXISTS idx_ai_cache_created_at ON ai_cache (created_at);
  `)
    .then(() => undefined)
    .catch((e) => {
      console.warn("ai_cache table creation failed:", e?.message || e);
    });
  return ensurePromise;
}

// File-system fallback cache directory
const ROOT = path.resolve(process.cwd());
const FILE_CACHE_DIR = path.join(ROOT, "data", "cache");

async function ensureFileDir(namespace) {
  const dir = path.join(FILE_CACHE_DIR, namespace);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function filePathFor(namespace, key) {
  return path.join(FILE_CACHE_DIR, namespace, `${key}.json`);
}

async function readFileCache(namespace, key, ttlMs) {
  try {
    const file = filePathFor(namespace, key);
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    if (ttlMs && parsed?.meta?.createdAt) {
      const age = Date.now() - new Date(parsed.meta.createdAt).getTime();
      if (age > ttlMs) return null;
    }
    return parsed.data ?? null;
  } catch (e) {
    return null;
  }
}

async function writeFileCache(namespace, key, body, result) {
  try {
    const dir = await ensureFileDir(namespace);
    const file = path.join(dir, `${key}.json`);
    const payload = {
      meta: { createdAt: new Date().toISOString(), version: 1 },
      data: { body, result },
    };
    await fs.writeFile(file, JSON.stringify(payload, null, 2), "utf8");
  } catch (e) {
    console.warn("File cache write failed:", e?.message || e);
  }
}

export async function getCached(endpoint, body, ttlMs) {
  const pool = getPool();
  if (!pool) return null;
  try {
    await ensureTable();
    const bodyHash = hashKey(endpoint, body);
    const { rows } = await query(
      "SELECT result, created_at FROM ai_cache WHERE endpoint=$1 AND body_hash=$2 LIMIT 1",
      [endpoint, bodyHash]
    );
    if (!rows || rows.length === 0) return null;
    if (ttlMs) {
      const age = Date.now() - new Date(rows[0].created_at).getTime();
      if (age > ttlMs) return null;
    }
    // update access stats but ignore errors
    try {
      await query(
        "UPDATE ai_cache SET hits=hits+1, last_accessed=NOW() WHERE endpoint=$1 AND body_hash=$2",
        [endpoint, bodyHash]
      );
    } catch (e) {
      console.warn("Failed to update cache stats:", e?.message || e);
    }
    return rows[0].result;
  } catch (err) {
    // Non-fatal: log and continue without cache
    console.warn(
      "Cache read failed (falling back to live AI):",
      err?.code || err?.message || err
    );
    // Try file fallback
    try {
      const bodyHash = hashKey(endpoint, body);
      const fileResult = await readFileCache(endpoint, bodyHash, ttlMs);
      if (fileResult) return fileResult.result ?? fileResult;
    } catch (e) {
      // ignore
    }
    return null;
  }
}

export async function setCached(endpoint, body, result) {
  const pool = getPool();
  if (!pool) return;
  try {
    await ensureTable();
    const bodyHash = hashKey(endpoint, body);
    await query(
      `INSERT INTO ai_cache (endpoint, body_hash, body, result, hits)
       VALUES ($1,$2,$3,$4,1)
       ON CONFLICT (endpoint, body_hash)
       DO UPDATE SET result=EXCLUDED.result, body=EXCLUDED.body, hits=ai_cache.hits+1, last_accessed=NOW()`,
      [endpoint, bodyHash, body, result]
    );
    // also ensure file fallback is updated
    try {
      await writeFileCache(endpoint, bodyHash, body, result);
    } catch (e) {
      // ignore
    }
  } catch (err) {
    // Non-fatal: log and continue
    console.warn(
      "Cache write failed (ignored):",
      err?.code || err?.message || err
    );
    // fallback: write to file cache so we still persist locally
    try {
      const bodyHash = hashKey(endpoint, body);
      await writeFileCache(endpoint, bodyHash, body, result);
    } catch (e) {
      // ignore
    }
  }
}

export default { getCached, setCached };
