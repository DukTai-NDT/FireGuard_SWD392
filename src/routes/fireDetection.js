// routes/fireDetection.js
const express = require("express");
const { detectFire } = require("../controllers/fireDetection");
const router = express.Router();

router.post("/detect", detectFire);
module.exports = router;
