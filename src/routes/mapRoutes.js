// src/routes/mapRoutes.js
const express = require("express");
const ctrl = require("../controllers/mapController");
const router = express.Router();

// Heatmap & sensors cho Map View (UC-13)
router.get("/sensors", ctrl.getSensorsOnMap); // list sensors (có latest + weight)
router.get("/sensor/:id", ctrl.getSensorDetail); // sensor detail + history
router.get("/events", ctrl.listEvents); // recent events cho list ở panel
router.get("/floor/:zoneId/meta", ctrl.getFloorMeta); // meta ảnh floor theo zone
router.get("/stream", ctrl.streamMapSSE); // SSE realtime cho map

module.exports = router;
