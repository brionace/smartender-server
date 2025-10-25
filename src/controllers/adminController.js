const { query } = require("../db/client");
const { hashKey } = require("../db/cacheHelpers");

// Simple admin auth check (expects ADMIN_API_KEY env var)
function isAdmin(req) {
  const key = process.env.ADMIN_API_KEY || "";
  const header = req.get("x-admin-key") || req.query.adminKey || "";
  return key && header && header === key;
}

exports.getCacheEntries = async function (req, res) {
  if (!isAdmin(req)) return res.status(403).json({ error: "forbidden" });
  try {
    const endpoint = req.query.endpoint || "recipes";
    const limit = Math.min(100, Number(req.query.limit) || 50);
    const offset = Number(req.query.offset) || 0;
    const { rows } = await query(
      "SELECT id, endpoint, body, result, hits, created_at, last_accessed FROM ai_cache WHERE endpoint=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
      [endpoint, limit, offset]
    );
    res.json({ data: rows });
  } catch (err) {
    console.error("admin getCacheEntries error", err);
    res.status(500).json({ error: "internal" });
  }
};

exports.lookupCache = async function (req, res) {
  if (!isAdmin(req)) return res.status(403).json({ error: "forbidden" });
  try {
    const endpoint = req.body.endpoint || "recipes";
    const body = req.body.body || {};
    const hash = hashKey(endpoint, body);
    const { rows } = await query(
      "SELECT result FROM ai_cache WHERE endpoint=$1 AND body_hash=$2 LIMIT 1",
      [endpoint, hash]
    );
    if (!rows || rows.length === 0)
      return res.status(404).json({ found: false });
    return res.json({ found: true, result: rows[0].result });
  } catch (err) {
    console.error("admin lookupCache error", err);
    res.status(500).json({ error: "internal" });
  }
};
