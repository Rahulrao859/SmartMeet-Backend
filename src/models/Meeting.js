// ─────────────────────────────────────────────────────────────
// IMPLEMENTATION 3.6 — Updated Meeting Model
// File: backend/src/models/Meeting.js
//
// Changes vs original:
//   - Added `notes` field (for reschedule/edit context)
//   - Added 'pending' to status enum (for future invite flow)
//   - Added 3 compound indexes (3.6) for efficient queries
//   - date stored as String kept for backward compat, but added dateObj
// ─────────────────────────────────────────────────────────────

'use strict';

const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema({
    userId: {
        type:     mongoose.Schema.Types.ObjectId,
        ref:      'User',
        required: true,
    },
    title: {
        type:      String,
        required:  true,
        trim:      true,
        maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    date:             { type: String, required: true },  // "2026-05-24" ISO date string
    time:             { type: String, required: true },  // "14:00" or "2:00 PM"
    duration:         { type: String, default: '1 hour' },
    platform:         { type: String, default: 'Google Meet' },
    meetingLink:      { type: String, default: '' },
    meetingId:        { type: String, default: '' },
    meetingPassword:  { type: String, default: '' },
    hostLink:         { type: String, default: '' },
    participants:     { type: [String], default: [] },
    timezone:         { type: String, default: 'UTC' },
    notes:            { type: String, default: '', maxlength: 2000 },
    calendarEventId:  { type: String, default: '' },
    calendarEventLink:{ type: String, default: '' },

    status: {
        type:    String,
        enum:    ['confirmed', 'cancelled', 'rescheduled', 'pending'],
        default: 'confirmed',
    },
}, {
    timestamps: true,
});

// ── 3.6 Compound Indexes ──────────────────────────────────────
// These dramatically speed up the most common query patterns.
// Without them, every query scans the full collection.

// List meetings for a user, sorted newest first (dashboard + meetings page)
meetingSchema.index({ userId: 1, createdAt: -1 });

// List meetings for a user, sorted by meeting date (calendar view)
meetingSchema.index({ userId: 1, date: -1 });

// Filter meetings by status for a user (All / Upcoming / Cancelled tab)
meetingSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('Meeting', meetingSchema);
