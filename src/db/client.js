import { Pool } from "pg";
import dotenv from "dotenv";

let pool = null;

// Ensure .env is loaded when running tests or local dev
if (!process.env.DATABASE_URL) {
  dotenv.config();
}

export function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;
  const sslFlag = String(process.env.PGSSL || "").toLowerCase() === "true";
  // Make connection attempts fail fast when the DB is unreachable so callers can
  // fall back to the file-cache instead of waiting for long OS-level timeouts.
  const connectionTimeoutMillis =
    Number(process.env.PG_CONNECT_TIMEOUT_MS) || 2000; // 2s
  const idleTimeoutMillis = Number(process.env.PG_IDLE_TIMEOUT_MS) || 30000; // 30s

  pool = new Pool({
    connectionString,
    ssl: sslFlag ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis,
    idleTimeoutMillis,
  });
  return pool;
}

export async function query(text, params) {
  const p = getPool();
  if (!p)
    throw new Error("DATABASE_URL is not set; database is not configured");
  return p.query(text, params);
}

/**
 * Run a query with an explicit timeout. If the query does not complete within
 * `timeoutMs`, the returned promise rejects. This prevents long OS-level TCP
 * timeouts from stalling request handlers when the DB is unreachable.
 */
export async function timedQuery(text, params, timeoutMs) {
  const p = getPool();
  if (!p)
    throw new Error("DATABASE_URL is not set; database is not configured");

  const effectiveTimeout =
    Number(timeoutMs ?? process.env.PG_QUERY_TIMEOUT_MS) || 2000;

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const err = new Error(
        `Postgres query timed out after ${effectiveTimeout}ms`
      );
      err.code = "PG_QUERY_TIMEOUT";
      reject(err);
    }, effectiveTimeout);

    p.query(text, params)
      .then((r) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(r);
      })
      .catch((e) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(e);
      });
  });
}

export default { getPool, query };
