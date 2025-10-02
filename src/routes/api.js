const express = require("express");
// const multer = require("multer");
const router = express.Router();
// const upload = multer({ storage: multer.memoryStorage() });

// Controllers (to be implemented)
const { identifyImage, getRecipes } = require("../controllers/apiController");

// POST /identify: Accepts image upload
router.post("/identify", identifyImage);

// POST /get-recipes: Accepts ingredient list
router.post("/recipes", getRecipes);

module.exports = router;
