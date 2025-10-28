require("dotenv").config();
const express = require("express");
const cors = require("cors");
const logger = require("./utils/logger");
const app = express();
const PORT = process.env.PORT || 3000;

// Log all incoming requests for debugging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`, { method: req.method, url: req.url });
  next();
});

app.use(cors());
app.use(express.json({ limit: "10000mb" }));
app.use(express.urlencoded({ limit: "10000mb", extended: true }));

app.get("/", (req, res) => {
  res.send("Whatever Cocktail API is running");
});

// API routes
const apiRoutes = require("./routes/api");
app.use("/api", apiRoutes);

app.listen(PORT, () => {
  logger.info(`Server listening on port ${PORT}`, { port: PORT });
});

// Run DB migration in background: ensure ai_cache table exists but don't block startup.
(async () => {
  try {
    logger.info("Starting background DB migration: ensure ai_cache table");
    // Dynamically import the ES module cache helper to avoid require/import loader issues
    const cacheMod = await import("./db/cache.js");
    const ensure =
      cacheMod.ensureTable ||
      (cacheMod.default && cacheMod.default.ensureTable);
    if (typeof ensure === "function") {
      // Wait up to 3s for migration; if it doesn't complete, log and continue.
      await Promise.race([
        ensure(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("ensureTable timeout")), 3000)
        ),
      ]).catch((e) => {
        logger.warn("Background ensureTable did not complete", {
          error: e?.message || e,
        });
      });
      logger.info("Background DB migration finished (or timed out)");
    } else {
      logger.info(
        "No ensureTable export found on cache module; skipping background migration"
      );
    }
  } catch (e) {
    logger.warn("Background DB migration failed to start", {
      error: e?.message || e,
    });
  }
})();
