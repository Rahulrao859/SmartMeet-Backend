const express = require('express');
const router = express.Router();
const meetingController = require('../controllers/meetingController');
const auth = require('../middlewares/auth');

router.get('/health', meetingController.healthCheck);
router.post('/schedule', auth, meetingController.scheduleMeeting);
router.get('/meetings', auth, meetingController.getMeetings);
router.get('/email-logs', auth, meetingController.getEmailLogs);
router.get('/stats', auth, meetingController.getStats);

module.exports = router;
