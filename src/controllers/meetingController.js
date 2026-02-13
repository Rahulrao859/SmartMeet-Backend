const geminiService = require('../services/geminiService');
const emailService = require('../services/emailService');

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

            // Generate a simple ID
            meetingDetails.id = Date.now().toString();
            meetingDetails.status = 'confirmed';

            console.log(`✅ Meeting details prepared:`, {
                id: meetingDetails.id,
                title: meetingDetails.title,
                date: meetingDetails.date,
                time: meetingDetails.time,
                duration: meetingDetails.duration,
                platform: meetingDetails.platform
            });

            // 2. Process emails
            const emailList = emails.split(',').map(e => e.trim()).filter(e => e);
            const emailResults = [];
            let successfulEmails = 0;

            for (const email of emailList) {
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
                    meetingId: meetingDetails.id
                });
            }

            // 3. Save meeting
            meetingDetails.participants = emailList;
            meetings.push(meetingDetails);

            console.log(`✅ Meeting saved successfully. Total meetings: ${meetings.length}`);

            // 4. Return response
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
        res.json({ meetings });
    }

    getEmailLogs(req, res) {
        res.json({ logs: emailLogs });
    }

    getStats(req, res) {
        const totalEmailsSent = emailLogs.filter(l => l.status === 'Sent').length;
        const totalEmails = emailLogs.length;
        const successRate = totalEmails > 0 ? Math.round((totalEmailsSent / totalEmails) * 100) : 0;
        const activeParticipants = new Set(emailLogs.map(l => l.recipient)).size;

        res.json({
            stats: {
                meetings_scheduled: meetings.length,
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
