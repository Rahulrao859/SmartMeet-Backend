// ─────────────────────────────────────────────────────────────
// IMPLEMENTATION 3.6 — Updated EmailLog Model
// File: backend/src/models/EmailLog.js
//
// Changes vs original:
//   - Added compound index { userId: 1, createdAt: -1 }
//   - Added `status` filter index for "Sent|Failed" query
// ─────────────────────────────────────────────────────────────

'use strict';

const mongoose = require('mongoose');

const emailLogSchema = new mongoose.Schema({
    userId: {
        type:     mongoose.Schema.Types.ObjectId,
        ref:      'User',
        required: true,
    },
    meetingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref:  'Meeting',
    },
    recipient:    { type: String, required: true },
    subject:      { type: String, required: true },
    status:       { type: String, enum: ['Sent', 'Failed'], required: true },
    errorMessage: { type: String, default: '' },
    emailType: {
        type:    String,
        enum:    ['meeting_invite', 'cancellation', 'reschedule', 'reminder'],
        default: 'meeting_invite',
    },
}, {
    timestamps: true,
});

// ── 3.6 Compound Indexes ──────────────────────────────────────
// Covers: GET /api/email-logs?page=1&status=Sent for a user
emailLogSchema.index({ userId: 1, createdAt: -1 });
emailLogSchema.index({ userId: 1, status: 1 });
emailLogSchema.index({ meetingId: 1 }); // for GET /meetings/:id (fetch its email logs)

module.exports = mongoose.model('EmailLog', emailLogSchema);
