const crypto = require("crypto");

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

module.exports = { stableStringify, hashKey };
