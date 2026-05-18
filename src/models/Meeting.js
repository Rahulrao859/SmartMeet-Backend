const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    title: {
        type: String,
        required: true,
        trim: true,
    },
    date: { type: String, required: true },
    time: { type: String, required: true },
    duration: { type: String, default: '1 hour' },
    platform: { type: String, default: 'Google Meet' },
    meetingLink: { type: String, default: '' },
    meetingId: { type: String, default: '' },
    meetingPassword: { type: String, default: '' },
    hostLink: { type: String, default: '' },
    participants: { type: [String], default: [] },
    timezone: { type: String, default: 'UTC' },
    status: {
        type: String,
        enum: ['confirmed', 'cancelled', 'rescheduled'],
        default: 'confirmed',
    },
    calendarEventId: { type: String, default: '' },
    calendarEventLink: { type: String, default: '' },
    notes: { type: String, default: '' },
}, {
    timestamps: true,   // adds createdAt, updatedAt automatically
});

module.exports = mongoose.model('Meeting', meetingSchema);
