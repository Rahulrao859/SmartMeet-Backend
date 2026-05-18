const { validationResult } = require('express-validator');
const Meeting = require('../models/Meeting');
const EmailLog = require('../models/EmailLog');
const geminiService = require('../services/geminiService');
const emailService = require('../services/emailService');
const zoomService = require('../services/zoomService');
const whatsappService = require('../services/whatsappService');

class MeetingController {

    async scheduleMeeting(req, res) {
        // 1. Check validation errors from express-validator
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({ error: 'Validation failed', details: errors.array() });
        }

        try {
            const { query, emails } = req.body;
            const userId = req.user._id;

            console.log(`📅 Scheduling meeting: "${query}"`);
            console.log(`📧 Emails: ${emails}`);

            // 2. Parse meeting details using Gemini AI
            const meetingDetails = await geminiService.parseMeetingDetails(query);

            if (!meetingDetails.date || !meetingDetails.time) {
                console.warn('⚠️ Missing date or time from AI response');
            }

            // 3. Generate meeting link based on platform
            if (meetingDetails.platform) {
                const platform = meetingDetails.platform.toLowerCase();
                if (platform.includes('zoom')) {
                    const zoomLink = zoomService.createMeetingLink(meetingDetails);
                    meetingDetails.meetingLink = zoomLink.joinUrl;
                    meetingDetails.meetingId = zoomLink.formattedMeetingId;
                    meetingDetails.meetingPassword = zoomLink.password;
                    meetingDetails.hostLink = zoomLink.hostUrl;
                } else if (platform.includes('google') || platform.includes('meet')) {
                    const meetLink = zoomService.createGoogleMeetLink();
                    meetingDetails.meetingLink = meetLink.joinUrl;
                    meetingDetails.meetingId = meetLink.meetingId;
                    meetingDetails.platform = 'Google Meet';
                } else if (platform.includes('teams') || platform.includes('microsoft')) {
                    const teamsLink = zoomService.createTeamsLink();
                    meetingDetails.meetingLink = teamsLink.joinUrl;
                    meetingDetails.meetingId = teamsLink.meetingId;
                    meetingDetails.platform = 'Microsoft Teams';
                }
            }

            // 4. Process participants list
            const emailList = emails.split(',').map(e => e.trim()).filter(e => e);

            // 5. Save meeting to MongoDB
            const meeting = await Meeting.create({
                userId,
                title: meetingDetails.title || 'Scheduled Meeting',
                date: meetingDetails.date,
                time: meetingDetails.time,
                duration: meetingDetails.duration || '1 hour',
                platform: meetingDetails.platform || 'Google Meet',
                meetingLink: meetingDetails.meetingLink || '',
                meetingId: meetingDetails.meetingId || '',
                meetingPassword: meetingDetails.meetingPassword || '',
                hostLink: meetingDetails.hostLink || '',
                participants: emailList,
                timezone: meetingDetails.timezone || 'UTC',
                status: 'confirmed',
            });

            console.log(`✅ Meeting saved to MongoDB: ${meeting._id}`);

            // 6. Send emails and log results
            const emailResults = [];
            let successfulEmails = 0;

            for (const email of emailList) {
                // Attach MongoDB ID to meeting details for email template
                const detailsForEmail = { ...meetingDetails, id: meeting._id.toString() };
                const result = await emailService.sendMeetingEmail(email, detailsForEmail);
                emailResults.push(result);
                if (result.success) successfulEmails++;

                // Save email log to MongoDB
                await EmailLog.create({
                    userId,
                    meetingId: meeting._id,
                    recipient: email,
                    subject: `Meeting Invitation: ${meeting.title}`,
                    status: result.success ? 'Sent' : 'Failed',
                    errorMessage: result.success ? '' : (result.error || ''),
                });

                // Non-blocking WhatsApp notification
                try {
                    const waResult = await whatsappService.sendMeetingNotification(meetingDetails);
                    if (waResult.success) {
                        console.log(`📱 WhatsApp sent for ${email}`);
                    }
                } catch (waError) {
                    console.warn(`📱 WhatsApp skipped (non-critical): ${waError.message}`);
                }
            }

            // 7. Try creating Google Calendar event (non-blocking)
            try {
                const googleCalendarService = require('../services/googleCalendarService');
                if (googleCalendarService.isConnected()) {
                    const calendarEvent = await googleCalendarService.createCalendarEvent(meetingDetails);
                    if (calendarEvent) {
                        await Meeting.findByIdAndUpdate(meeting._id, {
                            calendarEventId: calendarEvent.eventId,
                            calendarEventLink: calendarEvent.eventLink,
                        });
                        console.log(`✅ Google Calendar event created: ${calendarEvent.eventLink}`);
                    }
                }
            } catch (calendarError) {
                console.warn('⚠️ Calendar event skipped (non-critical):', calendarError.message);
            }

            // 8. Return response (format matches existing frontend expectations)
            return res.status(201).json({
                meeting: {
                    id: meeting._id.toString(),
                    title: meeting.title,
                    date: meeting.date,
                    time: meeting.time,
                    duration: meeting.duration,
                    platform: meeting.platform,
                    meetingLink: meeting.meetingLink,
                    participants: meeting.participants,
                    timezone: meeting.timezone,
                    status: meeting.status,
                },
                successful_emails: successfulEmails,
                total_emails: emailList.length,
                email_results: emailResults,
            });

        } catch (error) {
            console.error('❌ Error scheduling meeting:', error);
            return res.status(500).json({ error: 'Failed to schedule meeting', details: error.message });
        }
    }

    async getMeetings(req, res) {
        try {
            const meetings = await Meeting.find({ userId: req.user._id })
                .sort({ createdAt: -1 })
                .lean();

            // Format for frontend compatibility
            const formatted = meetings.map(m => ({
                id: m._id.toString(),
                title: m.title,
                date: m.date,
                time: m.time,
                duration: m.duration,
                platform: m.platform,
                meetingLink: m.meetingLink,
                participants: m.participants,
                timezone: m.timezone,
                status: m.status,
                createdAt: m.createdAt,
            }));

            return res.json({ meetings: formatted });
        } catch (error) {
            console.error('❌ Error fetching meetings:', error);
            return res.status(500).json({ error: 'Failed to fetch meetings' });
        }
    }

    async getEmailLogs(req, res) {
        try {
            const logs = await EmailLog.find({ userId: req.user._id })
                .sort({ createdAt: -1 })
                .lean();

            // Format for frontend compatibility
            const formatted = logs.map(l => ({
                id: l._id.toString(),
                recipient: l.recipient,
                subject: l.subject,
                status: l.status,
                time: new Date(l.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                date: new Date(l.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                timestamp: l.createdAt,
                meetingId: l.meetingId?.toString() || '',
            }));

            return res.json({ logs: formatted });
        } catch (error) {
            console.error('❌ Error fetching email logs:', error);
            return res.status(500).json({ error: 'Failed to fetch email logs' });
        }
    }

    async getStats(req, res) {
        try {
            const userId = req.user._id;

            // Run both queries in parallel for efficiency
            const [totalMeetings, emailStats] = await Promise.all([
                Meeting.countDocuments({ userId }),
                EmailLog.aggregate([
                    { $match: { userId } },
                    {
                        $group: {
                            _id: null,
                            total: { $sum: 1 },
                            sent: { $sum: { $cond: [{ $eq: ['$status', 'Sent'] }, 1, 0] } },
                            uniqueRecipients: { $addToSet: '$recipient' },
                        },
                    },
                ]),
            ]);

            const stats = emailStats[0] || { total: 0, sent: 0, uniqueRecipients: [] };
            const successRate = stats.total > 0 ? Math.round((stats.sent / stats.total) * 100) : 0;

            return res.json({
                stats: {
                    meetings_scheduled: totalMeetings,
                    emails_sent: stats.sent,
                    success_rate: successRate,
                    active_participants: stats.uniqueRecipients.length,
                },
            });
        } catch (error) {
            console.error('❌ Error fetching stats:', error);
            return res.status(500).json({ error: 'Failed to fetch stats' });
        }
    }

    healthCheck(req, res) {
        res.json({ status: 'healthy', timestamp: new Date() });
    }
}

module.exports = new MeetingController();
