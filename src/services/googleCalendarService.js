const { google } = require('googleapis');
const path = require('path');

class GoogleCalendarService {
    constructor() {
        this.oauth2Client = null;
        this.calendar = null;
        this.tokens = null; // In memory storage (use database in production)

        this.initializeOAuth2Client();
    }

    initializeOAuth2Client() {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/calendar/callback';

        if (!clientId || !clientSecret) {
            console.warn('⚠️ Google Calendar credentials not configured');
            return;
        }

        this.oauth2Client = new google.auth.OAuth2(
            clientId,
            clientSecret,
            redirectUri
        );

        console.log('✅ Google OAuth2 client initialized');
    }

    // Generate OAuth URL for user to authenticate
    getAuthUrl() {
        if (!this.oauth2Client) {
            throw new Error('OAuth2 client not initialized. Check Google credentials.');
        }

        const scopes = [
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/calendar.events'
        ];

        const authUrl = this.oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
            prompt: 'consent' // Force consent screen to get refresh token
        });

        return authUrl;
    }

    // Handle OAuth callback and exchange code for tokens
    async handleCallback(code) {
        if (!this.oauth2Client) {
            throw new Error('OAuth2 client not initialized');
        }

        try {
            const { tokens } = await this.oauth2Client.getToken(code);
            this.oauth2Client.setCredentials(tokens);
            this.tokens = tokens;

            // Initialize calendar API
            this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

            console.log('✅ Google Calendar access granted');
            return tokens;
        } catch (error) {
            console.error('❌ Error getting OAuth tokens:', error);
            throw error;
        }
    }

    // Check if calendar is connected
    isConnected() {
        return this.tokens !== null && this.calendar !== null;
    }

    // Get connection status with user info
    async getConnectionStatus() {
        if (!this.isConnected()) {
            return {
                connected: false,
                email: null
            };
        }

        try {
            // Get user's primary calendar to verify connection and get email
            const response = await this.calendar.calendarList.get({
                calendarId: 'primary'
            });

            return {
                connected: true,
                email: response.data.id // This is the user's email
            };
        } catch (error) {
            console.error('Error checking calendar status:', error);
            return {
                connected: false,
                email: null
            };
        }
    }

    // Disconnect calendar
    disconnect() {
        this.tokens = null;
        this.calendar = null;
        if (this.oauth2Client) {
            this.oauth2Client.setCredentials({});
        }
        console.log('🔌 Google Calendar disconnected');
    }

    // Create calendar event from meeting details
    async createCalendarEvent(meetingDetails) {
        if (!this.isConnected()) {
            console.warn('⚠️ Calendar not connected, skipping event creation');
            return null;
        }

        try {
            // Parse date and time to create proper datetime
            const { date, time, duration, title, meetingLink, participants } = meetingDetails;

            // Convert date and time to ISO format
            const startDateTime = this.parseDateTime(date, time);
            const endDateTime = this.calculateEndTime(startDateTime, duration);

            // Prepare event
            const event = {
                summary: title || 'Scheduled Meeting',
                description: meetingLink ? `Join meeting: ${meetingLink}` : 'SmartMeet scheduled meeting',
                start: {
                    dateTime: startDateTime,
                    timeZone: 'America/New_York', // TODO: Make timezone dynamic
                },
                end: {
                    dateTime: endDateTime,
                    timeZone: 'America/New_York',
                },
                attendees: participants ? participants.map(email => ({ email })) : [],
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'email', minutes: 24 * 60 },
                        { method: 'popup', minutes: 30 },
                    ],
                },
            };

            console.log('📅 Creating calendar event:', event.summary);

            // Create the event
            const response = await this.calendar.events.insert({
                calendarId: 'primary',
                resource: event,
                sendUpdates: 'all' // Send email invitations to attendees
            });

            console.log('✅ Calendar event created:', response.data.htmlLink);

            return {
                eventId: response.data.id,
                eventLink: response.data.htmlLink,
                status: response.data.status
            };

        } catch (error) {
            console.error('❌ Error creating calendar event:', error);
            throw error;
        }
    }

    // Helper: Parse date and time to ISO format
    parseDateTime(date, time) {
        // Expected format: date = "2026-02-14", time = "10:00"
        const dateTimeString = `${date}T${time}:00`;
        return new Date(dateTimeString).toISOString();
    }

    // Helper: Calculate end time based on duration
    calculateEndTime(startDateTime, duration) {
        const start = new Date(startDateTime);

        // Parse duration (e.g., "30 minutes", "1 hour")
        let minutes = 30; // default

        if (duration) {
            const durationLower = duration.toLowerCase();
            if (durationLower.includes('hour')) {
                const hours = parseInt(durationLower) || 1;
                minutes = hours * 60;
            } else if (durationLower.includes('minute')) {
                minutes = parseInt(durationLower) || 30;
            }
        }

        const end = new Date(start.getTime() + minutes * 60000);
        return end.toISOString();
    }
}

module.exports = new GoogleCalendarService();
