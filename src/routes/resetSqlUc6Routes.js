const express = require("express");
const { resetSqlUc6 } = require("../controllers/resetSqlUc6Controller");
const router = express.Router();

// 🧰 Endpoint dev: reset dữ liệu UC-06 (Fire Event + Readings)
router.post("/reset-sql-uc6", resetSqlUc6);

module.exports = router;
