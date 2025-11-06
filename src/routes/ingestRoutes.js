const express = require("express");
const router = express.Router();

const ingestController = require("../controller/ingestController");

const { ingestSensorData } = require("../controllers/ingestController");

router.post("/data", ingestSensorData);

// /api/ingest/ingest
router.post("/ingest", ingestController.ingestHandler);
module.exports = router;
