const geminiService = require('../services/geminiService');
const emailService = require('../services/emailService');
const zoomService = require('../services/zoomService');
const whatsappService = require('../services/whatsappService');

// In-memory storage
let meetings = [];
let emailLogs = [];

class MeetingController {
    async scheduleMeeting(req, res) {
        try {
            const { query, emails } = req.body;

            console.log(`📅 Scheduling meeting request: "${query}"`);
            console.log(`📧 Emails: ${emails}`);

            // 1. Parse meeting details using Gemini
            const meetingDetails = await geminiService.parseMeetingDetails(query);

            // 2. Validate essential fields
            if (!meetingDetails.date || !meetingDetails.time) {
                console.warn("⚠️ Missing essential meeting details (date or time)");
            }

            // Generate a simple ID and attach user
            meetingDetails.id = Date.now().toString();
            meetingDetails.status = 'confirmed';
            meetingDetails.userId = req.user?.id || 'anonymous';  // Add user ID for data isolation

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

            console.log(`✅ Meeting details prepared:`, {
                id: meetingDetails.id,
                title: meetingDetails.title,
                date: meetingDetails.date,
                time: meetingDetails.time,
                duration: meetingDetails.duration,
                platform: meetingDetails.platform,
                meetingLink: meetingDetails.meetingLink || 'Not generated'
            });

            // 2. Process emails and WhatsApp notifications together
            const emailList = emails.split(',').map(e => e.trim()).filter(e => e);
            const emailResults = [];
            let successfulEmails = 0;

            for (const email of emailList) {
                // Send email
                const result = await emailService.sendMeetingEmail(email, meetingDetails);
                emailResults.push(result);
                if (result.success) successfulEmails++;

                // Log email with all required fields for frontend
                const timestamp = new Date();
                emailLogs.push({
                    id: Date.now() + Math.random().toString(),
                    recipient: email,
                    subject: `Meeting Invitation: ${meetingDetails.title || 'Scheduled Meeting'}`,
                    status: result.status || 'Sent',
                    time: timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                    date: timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                    timestamp: timestamp,
                    meetingId: meetingDetails.id,
                    userId: req.user?.id || 'anonymous'  // Add user ID for data isolation
                });

                // Send WhatsApp notification along with email (non-blocking)
                try {
                    const waResult = await whatsappService.sendMeetingNotification(meetingDetails);
                    if (waResult.success) {
                        console.log(`📱 WhatsApp notification sent for ${email}: ${waResult.sid}`);
                    } else {
                        console.warn(`📱 WhatsApp notification skipped for ${email}:`, waResult.reason || waResult.error);
                    }
                } catch (waError) {
                    console.error(`📱 WhatsApp notification error for ${email} (non-critical):`, waError.message);
                }
            }

            // 3. Save meeting
            meetingDetails.participants = emailList;
            meetings.push(meetingDetails);

            console.log(`✅ Meeting saved successfully. Total meetings: ${meetings.length}`);

            // 5. Create Google Calendar event (if connected)
            try {
                const googleCalendarService = require('../services/googleCalendarService');
                if (googleCalendarService.isConnected()) {
                    console.log('📅 Creating Google Calendar event...');
                    const calendarEvent = await googleCalendarService.createCalendarEvent(meetingDetails);
                    if (calendarEvent) {
                        meetingDetails.calendarEventId = calendarEvent.eventId;
                        meetingDetails.calendarEventLink = calendarEvent.eventLink;
                        console.log(`✅ Calendar event created: ${calendarEvent.eventLink}`);
                    }
                } else {
                    console.log('ℹ️ Google Calendar not connected, skipping event creation');
                }
            } catch (calendarError) {
                console.error('⚠️ Failed to create calendar event (non-critical):', calendarError.message);
                // Don't fail the entire request if calendar creation fails
            }

            // 6. Return response
            res.json({
                meeting: meetingDetails,
                successful_emails: successfulEmails,
                total_emails: emailList.length,
                email_results: emailResults
            });

        } catch (error) {
            console.error('❌ Error scheduling meeting:', error);
            res.status(500).json({ error: 'Failed to schedule meeting', details: error.message });
        }
    }

    getMeetings(req, res) {
        // Filter meetings by user ID
        const userId = req.user?.id || 'anonymous';
        const userMeetings = meetings.filter(m => m.userId === userId);
        res.json({ meetings: userMeetings });
    }

    getEmailLogs(req, res) {
        // Filter email logs by user ID
        const userId = req.user?.id || 'anonymous';
        const userEmails = emailLogs.filter(l => l.userId === userId);
        res.json({ logs: userEmails });
    }

    getStats(req, res) {
        // Filter stats by user ID
        const userId = req.user?.id || 'anonymous';
        const userMeetings = meetings.filter(m => m.userId === userId);
        const userEmails = emailLogs.filter(l => l.userId === userId);

        const totalEmailsSent = userEmails.filter(l => l.status === 'Sent').length;
        const totalEmails = userEmails.length;
        const successRate = totalEmails > 0 ? Math.round((totalEmailsSent / totalEmails) * 100) : 0;
        const activeParticipants = new Set(userEmails.map(l => l.recipient)).size;

        res.json({
            stats: {
                meetings_scheduled: userMeetings.length,
                emails_sent: totalEmailsSent,
                success_rate: successRate,
                active_participants: activeParticipants
            }
        });
    }

    healthCheck(req, res) {
        res.json({ status: 'healthy', timestamp: new Date() });
    }
}

module.exports = new MeetingController();
