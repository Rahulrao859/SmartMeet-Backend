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
            const platformLink = meetingDetails.platform_link || '#';
            const linkHtml = meetingDetails.platform_link
                ? `<br><a href="${platformLink}" target="_blank" style="color: #1a73e8;">Join Meeting Link</a>`
                : '';

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: toEmail,
                subject: `Meeting Scheduled: ${meetingDetails.title}`,
                html: `
                    <html>
                      <body>
                        <p>Hello,</p>
                        <p>Your meeting "<strong>${meetingDetails.title}</strong>" has been scheduled.</p>
                        <p>
                          <strong>Date:</strong> ${meetingDetails.date}<br>
                          <strong>Time:</strong> ${meetingDetails.time}<br>
                          <strong>Duration:</strong> ${meetingDetails.duration}<br>
                          <strong>Platform:</strong> ${meetingDetails.platform} ${linkHtml}
                        </p>
                        <p>Regards,<br>Intelligent Meeting Scheduler</p>
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
                    ${meetingDetails.platform_link || ''}

                    Regards,
                    Intelligent Meeting Scheduler
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
