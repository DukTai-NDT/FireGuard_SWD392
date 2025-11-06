const express = require("express");
const router = express.Router();
const ingestController = require("../controller/ingestController");

// /api/ingest/ingest
router.post("/ingest", ingestController.ingestHandler);
module.exports = router;
