const express = require("express");
const router = express.Router();
const { ingestSensorData } = require("../controllers/ingestController");

router.post("/data", ingestSensorData);

module.exports = router;
