const express = require("express");
const router = express.Router();
const {
  autoResetAlarms,
  getAllAlarms,
} = require("../controllers/alarmResetController");
const alarmController = require("../controller/alarmController");
///api/alarms/:id/activate-alarm
router.post("/:id/activate-alarm", alarmController.buildAlarmController);
///api/alarms/:id/confirm
router.post("/:id/confirm", alarmController.confirmEvent);

router.post("/auto-reset", autoResetAlarms);
router.get("/list", getAllAlarms);

module.exports = router;
