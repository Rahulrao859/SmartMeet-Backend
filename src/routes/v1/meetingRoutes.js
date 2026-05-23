// ─────────────────────────────────────────────────────────────
// IMPLEMENTATION 3.1 + 3.2 + 3.3 + 3.4 + 3.5 — Meeting Routes (v1)
// File: backend/src/routes/v1/meetingRoutes.js
//
// Mounted at /api/v1 in the hardened app.js
// All routes require JWT authentication via `auth` middleware.
// ─────────────────────────────────────────────────────────────

'use strict';

const express      = require('express');
const rateLimit    = require('express-rate-limit');
const { body }     = require('express-validator');
const router       = express.Router();
const auth         = require('../../middlewares/auth');
const requireVerified = require('../../middlewares/requireVerified'); // 2.2
const meetingController = require('../../controllers/meetingController');

// ── Rate limiters ──────────────────────────────────────────────
const scheduleLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 10,
    standardHeaders: true, legacyHeaders: false,
    message: { error: 'Too many scheduling requests. Please wait 15 minutes.' },
});

const generalLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, max: 60,
    standardHeaders: true, legacyHeaders: false,
    message: { error: 'Too many requests. Please slow down.' },
});

// ── Validation rules ───────────────────────────────────────────
const scheduleValidation = [
    body('query')
        .trim().notEmpty().withMessage('Meeting request is required')
        .isLength({ min: 5, max: 500 }).withMessage('Must be 5–500 characters'),
    body('emails')
        .trim().notEmpty().withMessage('At least one participant email is required')
        .custom(value => {
            const emails = value.split(',').map(e => e.trim()).filter(e => e);
            if (emails.length === 0)  throw new Error('No valid emails provided');
            if (emails.length > 20)   throw new Error('Maximum 20 participants allowed');
            const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            const invalid = emails.filter(e => !emailRx.test(e));
            if (invalid.length > 0)   throw new Error(`Invalid email(s): ${invalid.join(', ')}`);
            return true;
        }),
];

const updateValidation = [
    body('title').optional().trim().notEmpty().isLength({ max: 200 }),
    body('date').optional().trim().notEmpty(),
    body('time').optional().trim().notEmpty(),
    body('duration').optional().trim().notEmpty(),
    body('platform').optional().trim().notEmpty(),
    body('notes').optional().isLength({ max: 2000 }),
];

// ── Routes ─────────────────────────────────────────────────────

// Health
router.get('/health', meetingController.healthCheck.bind(meetingController));

// Schedule — requires auth + email verification (2.2)
router.post(
    '/schedule',
    scheduleLimiter,
    auth,
    requireVerified,
    scheduleValidation,
    meetingController.scheduleMeeting.bind(meetingController)
);

// 3.5 — List meetings (paginated + filtered)
router.get('/meetings',    generalLimiter, auth, meetingController.getMeetings.bind(meetingController));

// 3.4 — Single meeting with email logs
router.get('/meetings/:id', generalLimiter, auth, meetingController.getMeetingById.bind(meetingController));

// 3.2 — Reschedule / edit meeting
router.patch(
    '/meetings/:id',
    auth,
    updateValidation,
    meetingController.updateMeeting.bind(meetingController)
);

// 3.3 — Cancel (soft) or permanently delete meeting
router.delete('/meetings/:id', auth, meetingController.deleteMeeting.bind(meetingController));

// 3.5 — Email logs (paginated)
router.get('/email-logs', generalLimiter, auth, meetingController.getEmailLogs.bind(meetingController));

// Stats
router.get('/stats', generalLimiter, auth, meetingController.getStats.bind(meetingController));

module.exports = router;
