class ZoomService {
    /**
     * Generate a random 11-digit Zoom meeting ID
     */
    generateMeetingId() {
        // Zoom meeting IDs are typically 9-11 digits
        return Math.floor(Math.random() * 90000000000) + 10000000000;
    }

    /**
     * Generate a random 6-character meeting password
     */
    generatePassword() {
        // Use alphanumeric characters (excluding confusing ones like 0, O, I, l)
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
        let password = '';
        for (let i = 0; i < 6; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return password;
    }

    /**
     * Create Zoom meeting link with all necessary details
     * @param {Object} meetingDetails - Meeting information
     * @returns {Object} Zoom meeting link object
     */
    createMeetingLink(meetingDetails) {
        const meetingId = this.generateMeetingId();
        const password = this.generatePassword();

        // Format meeting ID with spaces for readability (XXX XXXX XXXX)
        const formattedId = meetingId.toString().replace(/(\d{3})(\d{4})(\d{4})/, '$1 $2 $3');

        // Create base Zoom URL
        const baseUrl = `https://zoom.us/j/${meetingId}`;

        // Add password as query parameter
        const joinUrl = `${baseUrl}?pwd=${password}`;

        // Host URL includes role=1 to designate as host
        const hostUrl = `${baseUrl}?pwd=${password}&role=1`;

        console.log(`✅ Generated Zoom meeting link for: ${meetingDetails.title || 'Meeting'}`);
        console.log(`   Meeting ID: ${formattedId}`);
        console.log(`   Password: ${password}`);

        return {
            platform: 'Zoom',
            meetingId: meetingId.toString(),
            formattedMeetingId: formattedId,
            password: password,
            joinUrl: joinUrl,
            hostUrl: hostUrl,
            instructions: `Join Zoom Meeting: ${joinUrl}\n\nMeeting ID: ${formattedId}\nPassword: ${password}`
        };
    }

    /**
     * Generate Google Meet link (simple random code)
     */
    createGoogleMeetLink() {
        // Google Meet uses 3 sets of 4 characters (e.g., abc-defg-hij)
        const generateCode = (length) => {
            const chars = 'abcdefghijklmnopqrstuvwxyz';
            return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        };

        const code = `${generateCode(3)}-${generateCode(4)}-${generateCode(3)}`;
        const meetUrl = `https://meet.google.com/${code}`;

        console.log(`✅ Generated Google Meet link: ${meetUrl}`);

        return {
            platform: 'Google Meet',
            meetingId: code,
            joinUrl: meetUrl,
            instructions: `Join Google Meet: ${meetUrl}`
        };
    }

    /**
     * Generate Microsoft Teams link
     */
    createTeamsLink() {
        // Teams uses a long URL with thread ID
        const threadId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        const teamsUrl = `https://teams.microsoft.com/l/meetup-join/19:meeting_${threadId}`;

        console.log(`✅ Generated Microsoft Teams link: ${teamsUrl}`);

        return {
            platform: 'Microsoft Teams',
            meetingId: threadId,
            joinUrl: teamsUrl,
            instructions: `Join Microsoft Teams Meeting: ${teamsUrl}`
        };
    }
}

module.exports = new ZoomService();
