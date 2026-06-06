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

            const prompt = `You are a MULTILINGUAL meeting scheduling assistant. You can understand meeting requests in ANY language including English, Hindi (हिंदी), Spanish (Español), French (Français), German (Deutsch), and more. Extract meeting details and ALWAYS respond with ONLY valid JSON in English (no markdown, no explanations, no code blocks).

CURRENT DATE/TIME CONTEXT (for calculating relative dates/times):
- Current Date: ${currentDate} (${currentDay})
- Current Time: ${currentTime}
- Full Date/Time: ${currentFullDateTime}
- Time Zone: IST (UTC+5:30)

CRITICAL: Handle relative dates and times by calculating from current date/time:
Examples:
- "in 2 hours" / "2 ghante mein" / "en 2 horas" → Add 2 hours to current time (${currentTime})
- "in 30 minutes" / "30 minute mein" → Add 30 minutes to current time
- "tomorrow" / "kal" / "mañana" / "demain" → ${currentDate} + 1 day
- "day after tomorrow" / "parson" / "pasado mañana" → ${currentDate} + 2 days
- "next Monday" / "agle Monday" / "próximo lunes" → Calculate next occurrence
- "next week" / "agle hafte" / "la semana que viene" → ${currentDate} + 7 days
- "this Friday" / "is Friday" / "este viernes" → Calculate from current week
- "subah" / "morning" → 10:00, "dopahar" / "afternoon" → 14:00, "shaam" / "evening" → 18:00

MULTI-LANGUAGE SUPPORT:
- Hindi: "kal subah 10 baje meeting schedule karo" → tomorrow at 10:00
- Hindi: "agle hafte Monday ko team call" → next Monday team call
- Spanish: "reunión mañana a las 3 de la tarde" → tomorrow at 15:00
- French: "réunion demain à 14 heures" → tomorrow at 14:00
- German: "Besprechung morgen um 10 Uhr" → tomorrow at 10:00
- Mixed: "kal 3 PM pe Zoom call" → tomorrow at 15:00 on Zoom

User Request: "${query}"

Extract these fields:
1. "title": A concise meeting title IN ENGLISH (if not specified, create one based on the context)
2. "date": Format as YYYY-MM-DD. Calculate if relative
3. "time": Format as HH:MM in 24-hour format. Calculate if relative. Convert AM/PM to 24-hour.
4. "duration": Format as "X minutes" or "X hour(s)" (default: "30 minutes" if not specified)
5. "participants": Array of participant names mentioned (empty array [] if none)
6. "platform": Detect from keywords in any language:
   - "zoom", "on zoom", "via zoom", "Zoom pe" → "Zoom"
   - "google meet", "meet", "on meet", "Meet pe" → "Google Meet"
   - "teams", "microsoft teams", "ms teams" → "Microsoft Teams"
   - If none mentioned → "Online"
7. "platform_link": Leave empty string "", will be generated separately
8. "detectedLanguage": The language the user typed in (e.g., "en", "hi", "es", "fr", "de", "mixed")

Example 1 (English):
Input: "Team standup tomorrow at 10 AM on Zoom for 30 minutes"
Output: {"title":"Team standup","date":"<tomorrow's date>","time":"10:00","duration":"30 minutes","participants":[],"platform":"Zoom","platform_link":"","detectedLanguage":"en"}

Example 2 (Hindi):
Input: "Kal subah 10 baje team meeting schedule karo Zoom pe"
Output: {"title":"Team Meeting","date":"<tomorrow's date>","time":"10:00","duration":"30 minutes","participants":[],"platform":"Zoom","platform_link":"","detectedLanguage":"hi"}

Example 3 (Spanish):
Input: "Reunión con el equipo mañana a las 3 de la tarde en Google Meet"
Output: {"title":"Team Meeting","date":"<tomorrow's date>","time":"15:00","duration":"30 minutes","participants":[],"platform":"Google Meet","platform_link":"","detectedLanguage":"es"}

Example 4 (French):
Input: "Réunion d'équipe demain à 14 heures sur Teams pendant 1 heure"
Output: {"title":"Team Meeting","date":"<tomorrow's date>","time":"14:00","duration":"1 hour","participants":[],"platform":"Microsoft Teams","platform_link":"","detectedLanguage":"fr"}

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
    // ══════════════════════════════════════════════════════════
    // FEATURE 5 — Summarize Meeting Notes
    // Takes raw meeting notes and returns structured summary
    // ══════════════════════════════════════════════════════════
    async summarizeMeetingNotes(rawNotes, meetingTitle) {
        console.log(`📝 Summarizing notes for: "${meetingTitle}"`);

        try {
            const prompt = `You are a meeting notes summarizer. Analyze the following raw meeting notes and produce a structured summary. Respond with ONLY valid JSON (no markdown, no explanations, no code blocks).

Meeting Title: "${meetingTitle}"

Raw Notes:
"""${rawNotes}"""

Produce a JSON object with these fields:
1. "summary": A clear, concise paragraph summarizing the key discussion points (2-5 sentences)
2. "actionItems": An array of action items, each with:
   - "text": What needs to be done
   - "assignee": Who is responsible (extract from notes if mentioned, otherwise empty string)
   - "dueDate": When it's due (extract if mentioned, otherwise empty string)
3. "keyDecisions": An array of strings — important decisions that were made

Example:
{
  "summary": "The team discussed Q3 roadmap priorities and agreed to focus on mobile optimization. Budget was approved for hiring two more frontend developers.",
  "actionItems": [
    { "text": "Create wireframes for mobile redesign", "assignee": "Sarah", "dueDate": "2026-06-15" },
    { "text": "Draft job descriptions for frontend roles", "assignee": "HR Team", "dueDate": "" }
  ],
  "keyDecisions": [
    "Mobile optimization is the top priority for Q3",
    "Budget approved for 2 new frontend hires"
  ]
}

If no action items or decisions are found, return empty arrays.
Respond with valid JSON only:`;

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            let text = response.text().trim();

            console.log(`🤖 Gemini summary response: ${text.substring(0, 200)}...`);

            // Clean up markdown code blocks if present
            text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');

            const parsed = JSON.parse(text);

            return {
                summary:      parsed.summary      || 'No summary generated.',
                actionItems:  Array.isArray(parsed.actionItems)  ? parsed.actionItems.map(item => ({
                    text:     item.text     || '',
                    assignee: item.assignee || '',
                    dueDate:  item.dueDate  || '',
                })) : [],
                keyDecisions: Array.isArray(parsed.keyDecisions) ? parsed.keyDecisions : [],
            };
        } catch (error) {
            console.error('❌ Error summarizing meeting notes:', error.message);
            return {
                summary:      'Could not generate AI summary. Please try again.',
                actionItems:  [],
                keyDecisions: [],
            };
        }
    }
}

module.exports = new GeminiService();
