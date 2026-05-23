// ─────────────────────────────────────────────────────────────
// IMPLEMENTATION 1.3 — XSS Sanitization Helper
// File: backend/src/middlewares/xssHelper.js
//
// The `xss` package is a function, not Express middleware.
// This wrapper provides a clean, re-usable sanitization utility
// that controllers import and apply to user-supplied string fields.
//
// Usage in any controller:
//   const { xssClean } = require('../middlewares/xssHelper');
//   const title = xssClean(req.body.title);
// ─────────────────────────────────────────────────────────────

'use strict';

const xss = require('xss');

// XSS options: strip ALL HTML — no tags are whitelisted
const XSS_OPTIONS = {
    whiteList:          {},             // zero allowed tags
    stripIgnoreTag:     true,           // remove unrecognised tags instead of escaping
    stripIgnoreTagBody: ['script'],     // remove <script>...</script> content entirely
};

/**
 * Sanitizes a string value, stripping all HTML tags.
 * Safe to call on undefined/null — returns the value unchanged.
 *
 * @param {*} value - Any value (only strings are sanitized)
 * @returns {*} Sanitized string, or original value if not a string
 */
const xssClean = (value) => {
    if (typeof value !== 'string') return value;
    return xss(value, XSS_OPTIONS);
};

/**
 * Recursively sanitizes all string values in an object.
 * Useful for sanitizing an entire req.body in one call.
 *
 * @param {Object} obj - The object to sanitize (e.g. req.body)
 * @returns {Object} New object with all strings sanitized
 *
 * Usage:
 *   req.body = xssCleanObject(req.body);
 */
const xssCleanObject = (obj) => {
    if (typeof obj !== 'object' || obj === null) return xssClean(obj);
    if (Array.isArray(obj)) return obj.map(xssCleanObject);

    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
        cleaned[key] = xssCleanObject(value);
    }
    return cleaned;
};

module.exports = { xssClean, xssCleanObject };
