'use strict';

const mongoose = require('mongoose');

const actionItemSchema = new mongoose.Schema({
    text:      { type: String, required: true, trim: true },
    assignee:  { type: String, default: '', trim: true },
    dueDate:   { type: String, default: '' },
    completed: { type: Boolean, default: false },
}, { _id: true });

const meetingNotesSchema = new mongoose.Schema({
    meetingId: {
        type:     mongoose.Schema.Types.ObjectId,
        ref:      'Meeting',
        required: true,
    },
    userId: {
        type:     mongoose.Schema.Types.ObjectId,
        ref:      'User',
        required: true,
    },
    rawNotes: {
        type:      String,
        default:   '',
        maxlength: [10000, 'Notes cannot exceed 10,000 characters'],
    },
    aiSummary: {
        type:    String,
        default: '',
    },
    actionItems: {
        type:    [actionItemSchema],
        default: [],
    },
    keyDecisions: {
        type:    [String],
        default: [],
    },
}, {
    timestamps: true,
});

// One notes document per meeting per user
meetingNotesSchema.index({ meetingId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('MeetingNotes', meetingNotesSchema);
