// ─────────────────────────────────────────────────────────────
// IMPLEMENTATION 2.2 — requireVerified Middleware
// File: backend/src/middlewares/requireVerified.js
//
// Use this on any route that should be gated by email verification.
// Place it AFTER the `auth` middleware (auth sets req.user first).
//
// Example usage in meetingRoutes.js:
//   const requireVerified = require('../middlewares/requireVerified');
//   router.post('/schedule', auth, requireVerified, ...);
// ─────────────────────────────────────────────────────────────

'use strict';

const { AppError } = require('./errorHandler');

/**
 * Blocks the request if the authenticated user has not verified their email.
 * Must be placed after the `auth` middleware.
 */
const requireVerified = (req, res, next) => {
    if (!req.user) {
        return next(new AppError('Authentication required', 401));
    }
    if (!req.user.isVerified) {
        return next(new AppError(
            'Please verify your email address before scheduling meetings. ' +
            'Check your inbox for the verification link.',
            403
        ));
    }
    next();
};

module.exports = requireVerified;
