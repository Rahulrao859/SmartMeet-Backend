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

    // ── Meeting Summary Email (Feature 5) ────────────────────
    async sendMeetingSummaryEmail(toEmail, summaryData) {
        try {
            const { meetingTitle, meetingDate, meetingTime, summary, actionItems, keyDecisions } = summaryData;

            const actionItemsHtml = actionItems.length > 0
                ? actionItems.map((item, i) => `
                    <tr>
                        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px;">${i + 1}. ${item.text}</td>
                        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; color: #6366f1;">${item.assignee || '—'}</td>
                        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px;">${item.dueDate || '—'}</td>
                    </tr>
                `).join('')
                : '<tr><td colspan="3" style="padding: 12px; text-align: center; color: #94a3b8;">No action items</td></tr>';

            const decisionsHtml = keyDecisions.length > 0
                ? keyDecisions.map(d => `<li style="margin: 6px 0; font-size: 14px;">${d}</li>`).join('')
                : '<li style="color: #94a3b8;">No key decisions recorded</li>';

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: toEmail,
                subject: `Meeting Summary: ${meetingTitle}`,
                html: `
                    <html>
                      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background: linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%); padding: 30px; text-align: center;">
                            <h1 style="color: white; margin: 0;">📋 Meeting Summary</h1>
                            <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">${meetingTitle}</p>
                        </div>
                        <div style="padding: 30px; background-color: #f8fafc;">
                            <div style="background: white; padding: 16px 20px; border-radius: 8px; margin-bottom: 20px;">
                                <p style="margin: 4px 0;"><strong>📅 Date:</strong> ${meetingDate}</p>
                                <p style="margin: 4px 0;"><strong>🕐 Time:</strong> ${meetingTime}</p>
                            </div>

                            <h3 style="color: #1e293b; border-bottom: 2px solid #8b5cf6; padding-bottom: 8px;">📝 Summary</h3>
                            <p style="font-size: 14px; line-height: 1.6; color: #334155;">${summary}</p>

                            <h3 style="color: #1e293b; border-bottom: 2px solid #f59e0b; padding-bottom: 8px;">✅ Action Items</h3>
                            <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px;">
                                <thead>
                                    <tr style="background: #f1f5f9;">
                                        <th style="padding: 10px 12px; text-align: left; font-size: 12px; color: #64748b;">Task</th>
                                        <th style="padding: 10px 12px; text-align: left; font-size: 12px; color: #64748b;">Assignee</th>
                                        <th style="padding: 10px 12px; text-align: left; font-size: 12px; color: #64748b;">Due Date</th>
                                    </tr>
                                </thead>
                                <tbody>${actionItemsHtml}</tbody>
                            </table>

                            <h3 style="color: #1e293b; border-bottom: 2px solid #10b981; padding-bottom: 8px; margin-top: 24px;">🎯 Key Decisions</h3>
                            <ul style="padding-left: 20px; color: #334155;">${decisionsHtml}</ul>

                            <p style="margin-top: 30px; color: #64748b; font-size: 13px;">
                                Generated by SmartMeet AI ✨
                            </p>
                        </div>
                      </body>
                    </html>
                `,
            };

            await this.transporter.sendMail(mailOptions);
            console.log(`✅ Summary email sent to ${toEmail}`);
            return { success: true, email: toEmail };
        } catch (error) {
            console.error(`❌ Error sending summary email to ${toEmail}:`, error);
            return { success: false, email: toEmail, error: error.message };
        }
    }

    // ── Cancellation Email ───────────────────────────────────
    async sendCancellationEmail(toEmail, meetingDetails) {
        try {
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: toEmail,
                subject: `Meeting Cancelled: ${meetingDetails.title}`,
                html: `
                    <html>
                      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background: linear-gradient(135deg, #ef4444, #f87171); padding: 30px; text-align: center;">
                            <h1 style="color: white; margin: 0;">❌ Meeting Cancelled</h1>
                        </div>
                        <div style="padding: 30px; background-color: #f8fafc;">
                            <p>The following meeting has been cancelled:</p>
                            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                <p><strong>📌 Title:</strong> ${meetingDetails.title}</p>
                                <p><strong>📅 Date:</strong> ${meetingDetails.date}</p>
                                <p><strong>🕐 Time:</strong> ${meetingDetails.time}</p>
                                <p><strong>💻 Platform:</strong> ${meetingDetails.platform}</p>
                            </div>
                            <p style="color: #64748b; font-size: 14px;">Regards,<br>SmartMeet - AI-Powered Meeting Scheduler</p>
                        </div>
                      </body>
                    </html>
                `,
            };

            await this.transporter.sendMail(mailOptions);
            console.log(`✅ Cancellation email sent to ${toEmail}`);
            return { success: true, email: toEmail, status: 'Sent' };
        } catch (error) {
            console.error(`❌ Error sending cancellation email to ${toEmail}:`, error);
            return { success: false, email: toEmail, status: 'Failed', error: error.message };
        }
    }
}

module.exports = new EmailService();

