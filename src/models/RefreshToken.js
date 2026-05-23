// ─────────────────────────────────────────────────────────────
// IMPLEMENTATION 2.1 — Refresh Token Model
// File: backend/src/models/RefreshToken.js
//
// Why refresh tokens:
//   - Access tokens (JWT) are stateless — once issued they can't be revoked
//   - Short-lived access tokens (15 min) + long-lived refresh tokens (7 days)
//     gives the best security vs UX tradeoff
//   - Refresh tokens are stored in DB → can be revoked instantly on logout/breach
//   - Stored in httpOnly cookie → JavaScript cannot read them (XSS protection)
//
// Token security model:
//   - Raw token is sent to client (stored in cookie)
//   - HASHED token is stored in DB (bcrypt-like — SHA256 here for speed)
//   - Even if DB is dumped, attacker cannot use the stored hashes
// ─────────────────────────────────────────────────────────────

'use strict';

const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema({
    // Hashed token value — raw token is in client's httpOnly cookie
    token: {
        type:     String,
        required: true,
        index:    true,
    },

    // Who owns this token
    userId: {
        type:     mongoose.Schema.Types.ObjectId,
        ref:      'User',
        required: true,
        index:    true,
    },

    // When this token expires (7 days from creation)
    expiresAt: {
        type:     Date,
        required: true,
        // TTL index: MongoDB automatically deletes expired documents
        // This keeps the collection lean — no manual cleanup needed
    },

    // Whether this token has been explicitly revoked (e.g. user logged out)
    isRevoked: {
        type:    Boolean,
        default: false,
        index:   true,
    },

    // Device/client info for security audit ("Sessions" page in settings)
    userAgent: {
        type:    String,
        default: '',
    },
    ipAddress: {
        type:    String,
        default: '',
    },
}, {
    timestamps: true,
});

// ── TTL Index ─────────────────────────────────────────────────
// MongoDB will auto-delete documents where expiresAt is in the past.
// This runs a background check every 60 seconds.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ── Compound index for the most common query ──────────────────
// "Find non-revoked token for this user" pattern
refreshTokenSchema.index({ userId: 1, isRevoked: 1 });

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
