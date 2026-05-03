const twilio = require('twilio');

// Initialize Twilio client
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_WHATSAPP_FROM;   // whatsapp:+14155238886
const toNumber = process.env.TWILIO_WHATSAPP_TO;       // whatsapp:+91xxxxxxxxxx

let client = null;

// Lazy init so missing env vars don't crash on startup
function getClient() {
    if (!client) {
        if (!accountSid || !authToken) {
            throw new Error('Twilio credentials not configured in .env');
        }
        client = twilio(accountSid, authToken);
    }
    return client;
}

/**
 * Send a WhatsApp notification when a meeting is scheduled
 * @param {Object} meetingDetails - meeting object from Gemini
 * @param {string} [customTo]     - optional override recipient number
 */
async function sendMeetingNotification(meetingDetails, customTo) {
    try {
        const to = customTo || toNumber;

        if (!to) {
            console.warn('⚠️ WhatsApp: No recipient number configured. Skipping notification.');
            return { success: false, reason: 'No recipient number' };
        }

        const {
            title = 'Scheduled Meeting',
            date = 'TBD',
            time = 'TBD',
            duration = '',
            platform = '',
            meetingLink = '',
            participants = []
        } = meetingDetails;

        // Build the message body
        const attendees = participants.length > 0
            ? participants.join(', ')
            : 'No attendees';

        const platformLine = platform
            ? `📍 *Platform:* ${platform}`
            : '';

        const linkLine = meetingLink
            ? `🔗 *Join:* ${meetingLink}`
            : '';

        const durationLine = duration
            ? `⏱ *Duration:* ${duration}`
            : '';

        const body = [
            `🗓 *SmartMeet — New Meeting Scheduled!*`,
            ``,
            `📌 *Title:* ${title}`,
            `📅 *Date:* ${date}`,
            `🕐 *Time:* ${time}`,
            durationLine,
            platformLine,
            linkLine,
            `👥 *Attendees:* ${attendees}`,
            ``,
            `_Scheduled via SmartMeet AI_ ✨`
        ].filter(Boolean).join('\n');

        const message = await getClient().messages.create({
            from: fromNumber,
            to: to,
            body: body
        });

        console.log(`✅ WhatsApp notification sent! SID: ${message.sid}`);
        return { success: true, sid: message.sid };

    } catch (error) {
        console.error('❌ WhatsApp notification failed:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Send a plain custom WhatsApp message
 * @param {string} to      - recipient in format whatsapp:+91xxxxxxxxxx
 * @param {string} message - message text
 */
async function sendWhatsAppMessage(to, message) {
    try {
        const result = await getClient().messages.create({
            from: fromNumber,
            to: to,
            body: message
        });
        console.log(`✅ WhatsApp message sent! SID: ${result.sid}`);
        return { success: true, sid: result.sid };
    } catch (error) {
        console.error('❌ WhatsApp message failed:', error.message);
        return { success: false, error: error.message };
    }
}

module.exports = {
    sendMeetingNotification,
    sendWhatsAppMessage
};
