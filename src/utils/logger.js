const util = require("util");

function serializeMeta(meta) {
  if (!meta) return undefined;
  if (meta instanceof Error)
    return { message: meta.message, stack: meta.stack };
  try {
    // Try JSON-safe clone
    return JSON.parse(JSON.stringify(meta));
  } catch (e) {
    // Fallback to util.inspect for unserializable values
    return { inspected: util.inspect(meta, { depth: 4 }) };
  }
}

function log(level, message, meta) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message: message || undefined,
  };
  const s = serializeMeta(meta);
  if (s !== undefined) payload.meta = s;
  try {
    process.stdout.write(JSON.stringify(payload) + "\n");
  } catch (e) {
    // As a last resort, write a plain string
    process.stdout.write(`${payload.timestamp} ${level} ${message}\n`);
  }
}

module.exports = {
  info: (msg, meta) => log("info", msg, meta),
  warn: (msg, meta) => log("warn", msg, meta),
  error: (msg, meta) => log("error", msg, meta),
  debug: (msg, meta) => log("debug", msg, meta),
};
