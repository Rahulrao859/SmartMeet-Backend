const mongoose = require('mongoose');

const emailLogSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    meetingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Meeting',
        default: null,
    },
    recipient: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
    },
    subject: {
        type: String,
        required: true,
    },
    status: {
        type: String,
        enum: ['Sent', 'Failed', 'Pending', 'Delivered', 'Bounced'],
        default: 'Sent',
    },
    errorMessage: { type: String, default: '' },
}, {
    timestamps: true,   // createdAt serves as the sent timestamp
});

module.exports = mongoose.model('EmailLog', emailLogSchema);
