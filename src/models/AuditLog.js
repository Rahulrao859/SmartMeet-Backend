'use strict';

const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
    userId: {
        type:     mongoose.Schema.Types.ObjectId,
        ref:      'User',
        required: true,
    },
    action: {
        type:     String,
        required: true,
        trim:     true,
        // Examples: 'user.login', 'user.signup', 'meeting.created', 'user.role_changed'
    },
    resource: {
        type:    String,
        default: '',   // 'user', 'meeting', 'template', etc.
    },
    resourceId: {
        type:    mongoose.Schema.Types.ObjectId,
        default: null,
    },
    details: {
        type:    mongoose.Schema.Types.Mixed,
        default: {},
        // Freeform JSON: { oldRole: 'member', newRole: 'admin' }
    },
    ipAddress: {
        type:    String,
        default: '',
    },
    userAgent: {
        type:    String,
        default: '',
    },
}, {
    timestamps: true,
});

// ── Indexes ───────────────────────────────────────────────────
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
