// src/routes/fireDetection.js
const express = require("express");
const { confirmFireEvent } = require("../controllers/fireDetection");

const router = express.Router();

/**
 * UC-06: Confirm Fire Event
 * Xác nhận sự kiện cháy suspected → confirmed.
 * Endpoint: POST /api/fire-events/:id/confirm
 * Params:
 *   :id - FireEvent ID cần xác nhận
 * Response:
 *   { ok: true, id, state: "confirmed", confirmed_at }
 */
router.post("/fire-events/:id/confirm", confirmFireEvent);

module.exports = router;
