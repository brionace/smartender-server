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
  pool = new Pool({
    connectionString,
    ssl: sslFlag ? { rejectUnauthorized: false } : false,
  });
  return pool;
}

export async function query(text, params) {
  const p = getPool();
  if (!p)
    throw new Error("DATABASE_URL is not set; database is not configured");
  return p.query(text, params);
}

export default { getPool, query };
