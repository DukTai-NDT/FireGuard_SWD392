// routes/dataProcessing.js
const express = require("express");
const { analyzeData } = require("../controllers/dataProcessing");
const router = express.Router();

router.post("/analyze", analyzeData);
module.exports = router;
