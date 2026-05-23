// ─────────────────────────────────────────────────────────────
// IMPLEMENTATION 1.4 + 1.5 — Global Error Handler
// File: backend/src/middlewares/errorHandler.js
//
// Updates in this version (1.5):
//   - setupProcessHandlers() now uses logger (Winston) instead of console.*
//   - SIGTERM handler properly closes the HTTP server before exiting
//   - unhandledRejection and uncaughtException log full details via logger
// ─────────────────────────────────────────────────────────────

'use strict';

const logger = require('../config/logger');  // 1.7 — Winston logger

// ── AppError Class ───────────────────────────────────────────
/**
 * Wraps known/expected errors (bad input, not found, unauthorized, etc.)
 * Marked isOperational = true → message is safe to send to the client.
 * Un-marked errors (TypeError, ReferenceError) get "Internal server error" in prod.
 *
 * Usage inside any controller or service:
 *   const { AppError } = require('../middlewares/errorHandler');
 *   throw new AppError('Meeting not found', 404);
 *   return next(new AppError('Email already registered', 409));
 */
class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode    = statusCode;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

// ── 404 Handler ──────────────────────────────────────────────
/**
 * Placed AFTER all route definitions in app.js.
 * Any request reaching here matched no route → 404.
 */
const notFoundHandler = (req, res, next) => {
    next(new AppError(`Cannot ${req.method} ${req.originalUrl}`, 404));
};

// ── Global Error Handler ─────────────────────────────────────
/**
 * Express identifies this as an error handler via the 4-arg signature.
 * Placed as the VERY LAST middleware in app.js.
 */
const globalErrorHandler = (err, req, res, next) => {
    const isProduction = process.env.NODE_ENV === 'production';
    let statusCode = err.statusCode || 500;
    let message    = err.message    || 'Something went wrong';

    // ── Mongoose: field-level validation failed ──────────────
    if (err.name === 'ValidationError') {
        statusCode = 422;
        const details = Object.values(err.errors).map(e => e.message);
        return res.status(statusCode).json({ error: 'Validation failed', details });
    }

    // ── Mongoose: duplicate unique key (e.g. email already exists) ──
    if (err.code === 11000) {
        statusCode = 409;
        const field = Object.keys(err.keyValue || {})[0] || 'field';
        return res.status(statusCode).json({
            error: `${field} already in use. Please use a different value.`,
        });
    }

    // ── JWT: token is malformed or signature invalid ─────────
    if (err.name === 'JsonWebTokenError') {
        statusCode = 401;
        message    = 'Invalid authentication token. Please log in again.';
    }

    // ── JWT: token lifetime has expired ──────────────────────
    if (err.name === 'TokenExpiredError') {
        statusCode = 401;
        message    = 'Your session has expired. Please log in again.';
    }

    // ── Mongoose: invalid ObjectId in URL param ───────────────
    if (err.name === 'CastError') {
        statusCode = 400;
        message    = `Invalid value for field: ${err.path}`;
    }

    // ── Log all 5xx errors via Winston (1.7) ──────────────────
    if (statusCode >= 500) {
        logger.error('Server error', {
            message:    err.message,
            stack:      err.stack,
            url:        req.originalUrl,
            method:     req.method,
            userId:     req.user?._id || 'unauthenticated',
            statusCode,
        });
    }

    // ── Send HTTP response ────────────────────────────────────
    return res.status(statusCode).json({
        error: isProduction && statusCode >= 500 ? 'Internal server error' : message,
        ...(isProduction ? {} : { stack: err.stack }),
    });
};

// ── 1.5 — Process-Level Crash Guards ────────────────────────
/**
 * Call once at the top of app.js, before the server starts.
 * Keeps the process alive for operational errors;
 * kills it cleanly for programmer bugs so PM2/Docker can restart.
 *
 * @param {http.Server} server - Pass the HTTP server instance for graceful shutdown.
 *                               Optional — if not passed, SIGTERM just calls process.exit().
 */
const setupProcessHandlers = (server = null) => {

    // ── Unhandled Promise Rejection ──────────────────────────
    // Triggered when an async function throws and nobody called .catch()
    // Example: await Meeting.save() but no try/catch around it
    process.on('unhandledRejection', (reason) => {
        logger.error('Unhandled Promise Rejection — shutting down', {
            reason: reason instanceof Error
                ? { message: reason.message, stack: reason.stack }
                : reason,
        });
        // Give Winston time to flush the log before exiting
        setTimeout(() => process.exit(1), 500);
    });

    // ── Uncaught Exception ───────────────────────────────────
    // Triggered by synchronous throws not inside try/catch
    // Example: undefined.property → TypeError
    process.on('uncaughtException', (err) => {
        logger.error('Uncaught Exception — shutting down', {
            message: err.message,
            stack:   err.stack,
        });
        // Do NOT try to recover from uncaughtException — state is unknown
        setTimeout(() => process.exit(1), 500);
    });

    // ── SIGTERM — Graceful Shutdown ──────────────────────────
    // Sent by: Docker (docker stop), Kubernetes, Heroku, Railway
    // Goal: stop accepting new requests, finish in-flight ones, close DB
    process.on('SIGTERM', () => {
        logger.info('SIGTERM received — starting graceful shutdown');

        if (server) {
            // Stop accepting new connections
            server.close(() => {
                logger.info('HTTP server closed. Exiting.');
                process.exit(0);
            });

            // Force-kill if server doesn't close within 10 seconds
            setTimeout(() => {
                logger.warn('Graceful shutdown timed out — forcing exit');
                process.exit(1);
            }, 10_000);
        } else {
            process.exit(0);
        }
    });

    // ── SIGINT — Ctrl+C in development ──────────────────────
    process.on('SIGINT', () => {
        logger.info('SIGINT received (Ctrl+C) — shutting down');
        process.exit(0);
    });
};

module.exports = { AppError, notFoundHandler, globalErrorHandler, setupProcessHandlers };
