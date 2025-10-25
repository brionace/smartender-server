import crypto from "crypto";
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

export async function getCached(endpoint, body, ttlMs) {
  const pool = getPool();
  if (!pool) return null;
  await ensureTable();
  const bodyHash = hashKey(endpoint, body);
  const { rows } = await query(
    "SELECT result, created_at FROM ai_cache WHERE endpoint=$1 AND body_hash=$2 LIMIT 1",
    [endpoint, bodyHash]
  );
  if (!rows.length) return null;
  if (ttlMs) {
    const age = Date.now() - new Date(rows[0].created_at).getTime();
    if (age > ttlMs) return null;
  }
  await query(
    "UPDATE ai_cache SET hits=hits+1, last_accessed=NOW() WHERE endpoint=$1 AND body_hash=$2",
    [endpoint, bodyHash]
  );
  return rows[0].result;
}

export async function setCached(endpoint, body, result) {
  const pool = getPool();
  if (!pool) return;
  await ensureTable();
  const bodyHash = hashKey(endpoint, body);
  await query(
    `INSERT INTO ai_cache (endpoint, body_hash, body, result, hits)
     VALUES ($1,$2,$3,$4,1)
     ON CONFLICT (endpoint, body_hash)
     DO UPDATE SET result=EXCLUDED.result, body=EXCLUDED.body, hits=ai_cache.hits+1, last_accessed=NOW()`,
    [endpoint, bodyHash, body, result]
  );
}

export default { getCached, setCached };
