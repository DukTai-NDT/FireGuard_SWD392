// src/routes/timeline.js
const express = require('express');
const router = express.Router();
// Tên file controller của bạn là 'timelineController'
const timelineController = require('../controllers/timelineController');

// GET /api/timeline/incident/:eventId
router.get('/incident/:eventId', timelineController.getIncidentTimeline);
router.put('/incident/:eventId/clear', timelineController.clearEvent);
module.exports = router;