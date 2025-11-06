const express = require("express");
const router = express.Router();
const { autoResetAlarms, getAllAlarms } = require("../controllers/alarmResetController");

router.post("/auto-reset", autoResetAlarms);
router.get("/list", getAllAlarms);

module.exports = router;
