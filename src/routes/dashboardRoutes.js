const express = require("express");
const { getOverview, stream } = require("../controllers/dashboardController");

const router = express.Router();
router.get("/overview", getOverview);
router.get("/stream", stream);

module.exports = router;
