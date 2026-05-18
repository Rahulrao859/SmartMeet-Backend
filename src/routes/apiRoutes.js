const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const meetingController = require('../controllers/meetingController');
const auth = require('../middlewares/auth');

// ─── Rate Limiters ────────────────────────────────────────────
// Strict limiter for the AI scheduling endpoint (calls Gemini + sends emails)
const scheduleLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 10,                    // max 10 scheduling requests per 15 min per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Too many meeting scheduling requests. Please wait 15 minutes and try again.',
    },
});

// General API limiter for read endpoints
const generalLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,   // 5 minutes
    max: 60,                    // 60 requests per 5 min
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please slow down.' },
});

// ─── Validation Rules ─────────────────────────────────────────
const scheduleValidation = [
    body('query')
        .trim()
        .notEmpty().withMessage('Meeting request is required')
        .isLength({ min: 5, max: 500 }).withMessage('Request must be between 5 and 500 characters'),

    body('emails')
        .trim()
        .notEmpty().withMessage('At least one participant email is required')
        .custom((value) => {
            const emails = value.split(',').map(e => e.trim()).filter(e => e);
            if (emails.length === 0) throw new Error('No valid emails provided');
            if (emails.length > 20) throw new Error('Maximum 20 participants allowed');
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            const invalid = emails.filter(e => !emailRegex.test(e));
            if (invalid.length > 0) throw new Error(`Invalid email(s): ${invalid.join(', ')}`);
            return true;
        }),
];

// ─── Routes ───────────────────────────────────────────────────
router.get('/health', meetingController.healthCheck);

router.post(
    '/schedule',
    scheduleLimiter,        // rate limit first
    auth,                   // then authenticate
    scheduleValidation,     // then validate input
    meetingController.scheduleMeeting
);

router.get('/meetings',    generalLimiter, auth, meetingController.getMeetings);
router.get('/email-logs',  generalLimiter, auth, meetingController.getEmailLogs);
router.get('/stats',       generalLimiter, auth, meetingController.getStats);

module.exports = router;
