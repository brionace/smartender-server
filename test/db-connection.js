import { getPool } from "../src/db/client.js";

(async function () {
  try {
    const pool = getPool();
    if (!pool) {
      console.log("DATABASE_URL is not set or DB pool not configured.");
      process.exit(0);
    }

    // Try a simple query
    const res = await pool.query("SELECT 1 as ok");
    console.log(
      "DB connection successful:",
      res.rows && res.rows[0] ? res.rows[0] : res
    );
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.log({ err });
    console.error("DB connection failed:", err.message || err);
    process.exit(2);
  }
})();
