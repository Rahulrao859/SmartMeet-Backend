const express = require('express');
const router = express.Router();
const meetingController = require('../controllers/meetingController');

router.get('/health', meetingController.healthCheck);
router.post('/schedule', meetingController.scheduleMeeting);
router.get('/meetings', meetingController.getMeetings);
router.get('/email-logs', meetingController.getEmailLogs);
router.get('/stats', meetingController.getStats);

module.exports = router;
