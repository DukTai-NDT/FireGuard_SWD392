const express = require("express");
const router = express.Router();
const { autoResetAlarms } = require("../controllers/alarmResetController");

router.post("/auto-reset", autoResetAlarms);

module.exports = router;
