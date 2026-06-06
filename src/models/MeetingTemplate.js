'use strict';

const mongoose = require('mongoose');

const meetingTemplateSchema = new mongoose.Schema({
    userId: {
        type:     mongoose.Schema.Types.ObjectId,
        ref:      'User',
        required: true,
    },
    name: {
        type:      String,
        required:  [true, 'Template name is required'],
        trim:      true,
        maxlength: [100, 'Template name cannot exceed 100 characters'],
    },
    defaultTitle: {
        type:    String,
        default: '',
        trim:    true,
        maxlength: 200,
    },
    defaultDuration: {
        type:    String,
        default: '30 minutes',
    },
    defaultPlatform: {
        type:    String,
        default: 'Google Meet',
    },
    defaultParticipants: {
        type:    [String],   // array of email addresses
        default: [],
    },
    defaultTimezone: {
        type:    String,
        default: 'UTC',
    },
    isGlobal: {
        type:    Boolean,
        default: false,      // admin-created system templates
    },
}, {
    timestamps: true,
});

// User's templates + global ones
meetingTemplateSchema.index({ userId: 1, createdAt: -1 });
meetingTemplateSchema.index({ isGlobal: 1 });

module.exports = mongoose.model('MeetingTemplate', meetingTemplateSchema);
