const express = require("express");
const router = express.Router();
const readingsController = require('../controllers/readingsController');
///api/readings
router.get('/', readingsController.getAllReadings);


router.get('/:id', readingsController.getReadingById);
router.post('/', readingsController.createReading);
router.delete('/:id', readingsController.deleteReading);
module.exports = router;
