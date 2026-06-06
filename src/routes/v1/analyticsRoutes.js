'use strict';

const express  = require('express');
const router   = express.Router();
const auth     = require('../../middlewares/auth');
const analyticsController = require('../../controllers/analyticsController');

router.get('/analytics/trends',           auth, analyticsController.getMeetingTrends.bind(analyticsController));
router.get('/analytics/busiest-hours',    auth, analyticsController.getBusiestHours.bind(analyticsController));
router.get('/analytics/email-stats',      auth, analyticsController.getEmailStats.bind(analyticsController));
router.get('/analytics/top-participants', auth, analyticsController.getTopParticipants.bind(analyticsController));
router.get('/analytics/platforms',        auth, analyticsController.getPlatformDistribution.bind(analyticsController));
router.get('/analytics/status',           auth, analyticsController.getStatusDistribution.bind(analyticsController));

module.exports = router;
