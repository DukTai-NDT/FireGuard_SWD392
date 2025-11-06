const express = require('express');
const router = express.Router();
const logsController = require('../controllers/logsController');
///api/logs
router.get('/', logsController.getAllLogs);



router.get('/:id', logsController.getLogById);
router.post('/', logsController.createLog);
router.delete('/:id', logsController.deleteLog);

module.exports = router;
