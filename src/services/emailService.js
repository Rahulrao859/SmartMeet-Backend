const nodemailer = require('nodemailer');

class EmailService {
    constructor() {
        this.transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });
    }

    async sendMeetingEmail(toEmail, meetingDetails) {
        try {
            // Build meeting link section if available
            let meetingLinkHtml = '';
            if (meetingDetails.meetingLink) {
                meetingLinkHtml = `
                    <div style="background-color: #f0f4ff; border-left: 4px solid #8b5cf6; padding: 15px; margin: 15px 0; border-radius: 4px;">
                        <h3 style="color: #8b5cf6; margin: 0 0 10px 0;">🔗 Join Meeting</h3>
                        <p style="margin: 5px 0;"><strong>Platform:</strong> ${meetingDetails.platform}</p>
                        <p style="margin: 5px 0;"><a href="${meetingDetails.meetingLink}" style="color: #3b82f6; text-decoration: none; font-weight: bold;">${meetingDetails.meetingLink}</a></p>
                        ${meetingDetails.meetingId ? `<p style="margin: 5px 0;"><strong>Meeting ID:</strong> ${meetingDetails.meetingId}</p>` : ''}
                        ${meetingDetails.meetingPassword ? `<p style="margin: 5px 0;"><strong>Password:</strong> ${meetingDetails.meetingPassword}</p>` : ''}
                    </div>
                `;
            }

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: toEmail,
                subject: `Meeting Scheduled: ${meetingDetails.title}`,
                html: `
                    <html>
                      <body style="font-family: Arial sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background: linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%); padding: 30px; text-align: center;">
                            <h1 style="color: white; margin: 0;">📅 Meeting Invitation</h1>
                        </div>
                        <div style="padding: 30px; background-color: #f8fafc;">
                            <p>Hello,</p>
                            <p>Your meeting "<strong>${meetingDetails.title}</strong>" has been scheduled.</p>
                            
                            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                <p><strong>📅 Date:</strong> ${meetingDetails.date}</p>
                                <p><strong>🕐 Time:</strong> ${meetingDetails.time}</p>
                                <p><strong>⏱️ Duration:</strong> ${meetingDetails.duration}</p>
                                ${!meetingDetails.meetingLink ? `<p><strong>💻 Platform:</strong> ${meetingDetails.platform}</p>` : ''}
                            </div>
                            
                            ${meetingLinkHtml}
                            
                            <p style="margin-top: 30px; color: #64748b; font-size: 14px;">
                                Regards,<br>SmartMeet - AI-Powered Meeting Scheduler
                            </p>
                        </div>
                      </body>
                    </html>
                `,
                text: `
                    Hello,

                    Your meeting "${meetingDetails.title}" has been scheduled.

                    Date: ${meetingDetails.date}
                    Time: ${meetingDetails.time}
                    Duration: ${meetingDetails.duration}
                    Platform: ${meetingDetails.platform}
                    ${meetingDetails.meetingLink ? `\nJoin Link: ${meetingDetails.meetingLink}` : ''}
                    ${meetingDetails.meetingId ? `Meeting ID: ${meetingDetails.meetingId}` : ''}
                    ${meetingDetails.meetingPassword ? `Password: ${meetingDetails.meetingPassword}` : ''}

                    Regards,
                    SmartMeet - AI-Powered Meeting Scheduler
                `
            };

            await this.transporter.sendMail(mailOptions);
            console.log(`✅ Email sent successfully to ${toEmail}`);
            return { success: true, email: toEmail, status: 'Sent' };
        } catch (error) {
            console.error(`❌ Error sending email to ${toEmail}:`, error);
            return { success: false, email: toEmail, status: 'Failed', error: error.message };
        }
    }
}

module.exports = new EmailService();
