// ─────────────────────────────────────────────────────────────
// IMPLEMENTATION 1.7 — Structured Logging with Winston
// File: backend/src/config/logger.js
//
// Why this replaces console.log:
//   - console.log has no levels (can't filter warn vs error)
//   - console.log has no timestamps
//   - console.log cannot write to files (needed for production)
//   - console.log output can't be parsed by log aggregators (Datadog, etc.)
//
// Usage throughout the backend:
//   const logger = require('../config/logger');
//   logger.info('Meeting scheduled', { meetingId, userId });
//   logger.warn('Gemini slow response', { durationMs });
//   logger.error('DB write failed', { error: err.message, stack: err.stack });
//   logger.debug('Parsed timezone', { tz, offset });   // only shown in dev
// ─────────────────────────────────────────────────────────────

'use strict';

const winston = require('winston');
const path    = require('path');
const fs      = require('fs');

// ── Ensure logs/ directory exists ────────────────────────────
// Winston will fail silently if the directory doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// ── Log Levels (Winston default, most → least severe) ────────
//   error: 0 → fatal failures, crashes, unhandled rejections
//   warn:  1 → degraded behaviour, skipped optional steps
//   info:  2 → normal significant events (server start, meeting saved)
//   debug: 3 → verbose tracing for development only

const { combine, timestamp, errors, json, colorize, printf, splat } = winston.format;

// ── Development format: human-readable colored output ────────
const devFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
    // Flatten any extra metadata fields onto one line
    const metaStr = Object.keys(meta).length
        ? ' ' + JSON.stringify(meta)
        : '';
    return `${timestamp} [${level}]  ${stack || message}${metaStr}`;
});

// ── Production format: JSON per line (machine-parseable) ─────
// Each log line is a valid JSON object — works with Datadog, Splunk, CloudWatch
const prodFormat = combine(
    timestamp(),
    errors({ stack: true }),   // ensures err.stack is included as a field
    splat(),                   // supports printf-style % interpolation
    json()                     // final output: single-line JSON
);

// ── Transport: rotating log files ───────────────────────────
// maxsize:  rotate after 5MB (error) / 10MB (combined)
// maxFiles: keep last 5 / 10 files before deleting oldest
const fileTransports = [
    new winston.transports.File({
        filename: path.join(logsDir, 'error.log'),
        level:    'error',
        maxsize:  5 * 1024 * 1024,   // 5 MB
        maxFiles: 5,
        format:   prodFormat,
    }),
    new winston.transports.File({
        filename: path.join(logsDir, 'combined.log'),
        maxsize:  10 * 1024 * 1024,  // 10 MB
        maxFiles: 10,
        format:   prodFormat,
    }),
];

// ── Transport: console (development only) ───────────────────
const consoleTransport = new winston.transports.Console({
    format: combine(
        colorize({ all: true }),
        timestamp({ format: 'HH:mm:ss' }),
        errors({ stack: true }),
        devFormat
    ),
});

// ── Create Logger ────────────────────────────────────────────
const logger = winston.createLogger({
    // In production: only warn + error. In dev/test: all levels including debug.
    level: process.env.LOG_LEVEL
        || (process.env.NODE_ENV === 'production' ? 'warn' : 'debug'),

    defaultMeta: {
        service:     'smartmeet-backend',
        environment: process.env.NODE_ENV || 'development',
    },

    transports: [
        ...fileTransports,
        // Console only in non-production (keeps prod logs clean JSON in files)
        ...(process.env.NODE_ENV !== 'production' ? [consoleTransport] : []),
    ],

    // Don't crash on logger errors themselves
    exitOnError: false,
});

// ── In production: also print to stdout as JSON ──────────────
// This lets platforms like Railway / Heroku capture logs via stdout
if (process.env.NODE_ENV === 'production') {
    logger.add(new winston.transports.Console({
        format: prodFormat,
    }));
}

module.exports = logger;
