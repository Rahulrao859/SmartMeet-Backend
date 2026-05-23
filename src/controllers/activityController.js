'use strict';

const Meeting = require('../models/Meeting');
const EmailLog = require('../models/EmailLog');
const logger = require('../config/logger');

class ActivityController {
    /**
     * GET /api/v1/activity
     * Fetches unified recent activities merging meetings and email logs
     */
    async getRecentActivity(req, res, next) {
        try {
            const userId = req.user._id;

            // Fetch the last 20 meetings and last 20 email logs
            const [meetings, emailLogs] = await Promise.all([
                Meeting.find({ userId }).sort({ createdAt: -1 }).limit(20).lean(),
                EmailLog.find({ userId }).populate('meetingId', 'title').sort({ createdAt: -1 }).limit(20).lean()
            ]);

            const activities = [];

            // Map meetings
            meetings.forEach(m => {
                let actionText = 'scheduled';
                let color = '#2563EB'; // primary blue
                let bgColor = 'rgba(37, 99, 235, 0.1)';

                if (m.status === 'cancelled') {
                    actionText = 'cancelled';
                    color = '#EF4444'; // red
                    bgColor = 'rgba(239, 68, 68, 0.1)';
                } else if (m.status === 'rescheduled') {
                    actionText = 'rescheduled';
                    color = '#F59E0B'; // amber/orange
                    bgColor = 'rgba(245, 158, 11, 0.1)';
                }

                activities.push({
                    _id: m._id,
                    type: 'meeting',
                    action: actionText,
                    title: `Meeting ${actionText}: "${m.title}"`,
                    createdAt: m.createdAt,
                    color,
                    bgColor,
                    meta: {
                        date: m.date,
                        time: m.time,
                        platform: m.platform
                    }
                });
            });

            // Map email logs
            emailLogs.forEach(log => {
                const meetingTitle = log.meetingId?.title || 'Unknown Meeting';
                const isSent = log.status === 'Sent';
                const actionText = isSent ? 'Sent' : 'Failed';
                const color = isSent ? '#10B981' : '#EF4444'; // emerald green or red
                const bgColor = isSent ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';

                activities.push({
                    _id: log._id,
                    type: 'email',
                    action: log.status,
                    title: `Email ${actionText.toLowerCase()} to ${log.recipient} for "${meetingTitle}"`,
                    createdAt: log.createdAt,
                    color,
                    bgColor,
                    meta: {
                        recipient: log.recipient,
                        subject: log.subject,
                        status: log.status,
                        errorMessage: log.errorMessage
                    }
                });
            });

            // Sort merged activities descending by createdAt
            activities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            // Slice to top 20
            const recent = activities.slice(0, 20);

            res.json({
                success: true,
                count: recent.length,
                activities: recent
            });
        } catch (err) {
            logger.error(`[ACTIVITY] Error getting recent activity: ${err.message}`);
            next(err);
        }
    }
}

module.exports = new ActivityController();
