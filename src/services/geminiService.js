const { GoogleGenerativeAI } = require("@google/generative-ai");

class GeminiService {
    constructor() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.warn("⚠️ GEMINI_API_KEY is not set in .env");
        }
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: "gemini-pro" });
    }

    // Helper function to get next business day
    getNextBusinessDay() {
        const date = new Date();
        date.setDate(date.getDate() + 1);
        // If it's Saturday, add 2 days, if Sunday, add 1 day
        if (date.getDay() === 6) date.setDate(date.getDate() + 2);
        if (date.getDay() === 0) date.setDate(date.getDate() + 1);
        return date.toISOString().split('T')[0];
    }

    // Helper function to extract basic info from query as fallback
    extractBasicInfo(query) {
        const lowerQuery = query.toLowerCase();

        // Extract platform
        let platform = "Online";
        let platformLink = "";

        if (lowerQuery.includes('zoom')) {
            platform = "Zoom";
            platformLink = "https://zoom.us/j/meeting-id"; // Placeholder
        } else if (lowerQuery.includes('google meet') || lowerQuery.includes('meet')) {
            platform = "Google Meet";
            platformLink = "https://meet.google.com/new"; // Placeholder
        }

        // Extract duration
        let duration = "30 minutes"; // Default
        const durationMatch = query.match(/(\d+)\s*(min|minutes|hour|hours|hr|hrs)/i);
        if (durationMatch) {
            const num = durationMatch[1];
            const unit = durationMatch[2].toLowerCase();
            if (unit.startsWith('h')) {
                duration = `${num} hour${num > 1 ? 's' : ''}`;
            } else {
                duration = `${num} minutes`;
            }
        }

        // Extract time
        let time = "10:00"; // Default
        const timeMatch = query.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
        if (timeMatch) {
            let hours = parseInt(timeMatch[1]);
            const minutes = timeMatch[2] || "00";
            const period = timeMatch[3];

            if (period && period.toLowerCase() === 'pm' && hours < 12) {
                hours += 12;
            } else if (period && period.toLowerCase() === 'am' && hours === 12) {
                hours = 0;
            }

            time = `${hours.toString().padStart(2, '0')}:${minutes}`;
        }

        // Extract date
        let date = this.getNextBusinessDay(); // Default to next business day
        if (lowerQuery.includes('today')) {
            date = new Date().toISOString().split('T')[0];
        } else if (lowerQuery.includes('tomorrow')) {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            date = tomorrow.toISOString().split('T')[0];
        }

        return { platform, platformLink, duration, time, date };
    }

    // Generate platform-specific meeting links
    generatePlatformLink(platform) {
        const randomId = Math.random().toString(36).substring(2, 15);

        if (platform.toLowerCase().includes('zoom')) {
            return `https://zoom.us/j/${Date.now().toString().substring(0, 10)}`;
        } else if (platform.toLowerCase().includes('google meet') || platform.toLowerCase().includes('meet')) {
            return `https://meet.google.com/${randomId}`;
        }

        return ""; // No link for generic "Online" platform
    }

    async parseMeetingDetails(query) {
        console.log(`📝 Parsing meeting request: "${query}"`);

        try {
            const currentDate = new Date().toISOString().split('T')[0];
            const currentTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
            const currentDay = new Date().toLocaleDateString('en-US', { weekday: 'long' });
            const currentFullDateTime = new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' });

            const prompt = `You are a meeting scheduling assistant. Extract meeting details from the following request and respond with ONLY valid JSON (no markdown, no explanations, no code blocks).

CURRENT DATE/TIME CONTEXT (for calculating relative dates/times):
- Current Date: ${currentDate} (${currentDay})
- Current Time: ${currentTime}
- Full Date/Time: ${currentFullDateTime}
- Time Zone: IST (UTC+5:30)

CRITICAL: Handle relative dates and times by calculating from current date/time:
Examples:
- "in 2 hours" → Add 2 hours to current time (${currentTime})
- "in 30 minutes" → Add 30 minutes to current time
- "tomorrow" → ${currentDate} + 1 day
- "day after tomorrow" → ${currentDate} + 2 days
- "in 2 days" or "2 days from now" → ${currentDate} + 2 days
- "next Monday/Tuesday/etc" → Calculate next occurrence from ${currentDate}
- "next week" → ${currentDate} + 7 days
- "this Friday" → Calculate from current week

User Request: "${query}"

Extract these fields:
1. "title": A concise meeting title (if not specified, create one based on the context)
2. "date": Format as YYYY-MM-DD. Calculate if relative (e.g., "tomorrow", "in 2 days")
3. "time": Format as HH:MM in 24-hour format. Calculate if relative (e.g., "in 2 hours"). Convert AM/PM to 24-hour.
4. "duration": Format as "X minutes" or "X hour(s)" (default: "30 minutes" if not specified)
5. "participants": Array of participant names mentioned (empty array [] if none)
6. "platform": Detect from keywords:
   - "zoom", "on zoom", "via zoom" → "Zoom"
   - "google meet", "meet", "on meet" → "Google Meet"
   - "teams", "microsoft teams", "ms teams" → "Microsoft Teams"
   - If none mentioned → "Online"
7. "platform_link": Leave empty string "", will be generated separately

Example 1:
Input: "Team standup tomorrow at 10 AM on Zoom for 30 minutes"
Output: {"title":"Team standup","date":"<tomorrow's date in YYYY-MM-DD>","time":"10:00","duration":"30 minutes","participants":[],"platform":"Zoom","platform_link":""}

Example 2:
Input: "Client call in 2 hours on Google Meet"
Output: {"title":"Client call","date":"${currentDate}","time":"<current time + 2 hours in HH:MM>","duration":"30 minutes","participants":[],"platform":"Google Meet","platform_link":""}

Example 3:
Input: "Project review 2 days from now at 3 PM on Teams for 1 hour"
Output: {"title":"Project review","date":"<current date + 2 days in YYYY-MM-DD>","time":"15:00","duration":"1 hour","participants":[],"platform":"Microsoft Teams","platform_link":""}

Now extract from: "${query}"

Respond with valid JSON only:`;

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            let text = response.text().trim();

            console.log(`🤖 Gemini raw response: ${text}`);

            // Clean up markdown code blocks if present
            text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');

            // Try to parse the JSON
            let parsedData = JSON.parse(text);

            // Get fallback data in case some fields are missing
            const fallbackData = this.extractBasicInfo(query);

            // Validate and fill in missing fields
            const meetingDetails = {
                title: parsedData.title || fallbackData.title || "Meeting",
                date: parsedData.date || fallbackData.date,
                time: parsedData.time || fallbackData.time,
                duration: parsedData.duration || fallbackData.duration,
                participants: Array.isArray(parsedData.participants) ? parsedData.participants : [],
                platform: parsedData.platform || fallbackData.platform,
                platform_link: parsedData.platform_link || ""
            };

            // Generate platform link if not provided
            if (!meetingDetails.platform_link && meetingDetails.platform) {
                meetingDetails.platform_link = this.generatePlatformLink(meetingDetails.platform);
            }

            console.log(`✅ Successfully parsed meeting details:`, meetingDetails);
            return meetingDetails;

        } catch (error) {
            console.error("❌ Error parsing meeting details with Gemini:", error.message);
            console.log("🔄 Using fallback extraction method...");

            // Use intelligent fallback instead of empty values
            const fallbackData = this.extractBasicInfo(query);

            const meetingDetails = {
                title: query.substring(0, 50) || "Meeting",
                date: fallbackData.date,
                time: fallbackData.time,
                duration: fallbackData.duration,
                participants: [],
                platform: fallbackData.platform,
                platform_link: fallbackData.platformLink || this.generatePlatformLink(fallbackData.platform)
            };

            console.log(`✅ Fallback parsing result:`, meetingDetails);
            return meetingDetails;
        }
    }
}

module.exports = new GeminiService();
