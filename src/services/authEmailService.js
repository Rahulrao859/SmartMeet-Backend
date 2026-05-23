// ─────────────────────────────────────────────────────────────
// IMPLEMENTATION 2.2 + 2.3 — Auth Email Service
// File: backend/src/services/authEmailService.js
//
// Separate from emailService.js (which handles meeting invitations).
// This service handles account-level transactional emails:
//   - Email verification link (2.2)
//   - Password reset link (2.3)
//
// Uses the same nodemailer transporter pattern as existing emailService.
// ─────────────────────────────────────────────────────────────

'use strict';

const nodemailer = require('nodemailer');
const logger     = require('../config/logger');

class AuthEmailService {
    constructor() {
        this.transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        // Verify transporter config in non-test environments
        if (process.env.NODE_ENV !== 'test') {
            this.transporter.verify().catch(err => {
                logger.warn('Email transporter verification failed — emails may not send', {
                    error: err.message,
                });
            });
        }
    }

    // ── Shared HTML wrapper ───────────────────────────────────
    _wrapHtml(title, bodyHtml) {
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
        <body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f4f6fb;">
          <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
            <div style="background:linear-gradient(135deg,#6366f1,#3b82f6);padding:32px;text-align:center;">
              <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;">📅 SmartMeet</h1>
            </div>
            <div style="padding:36px 32px;">
              <h2 style="color:#1e293b;margin:0 0 16px;font-size:20px;">${title}</h2>
              ${bodyHtml}
              <p style="margin-top:32px;font-size:13px;color:#94a3b8;">
                If you did not request this, please ignore this email.<br>
                This link expires automatically.
              </p>
            </div>
            <div style="background:#f8fafc;padding:16px;text-align:center;font-size:12px;color:#94a3b8;">
              © ${new Date().getFullYear()} SmartMeet. All rights reserved.
            </div>
          </div>
        </body>
        </html>`;
    }

    // ── 2.2 — Send verification email ────────────────────────
    /**
     * @param {string} toEmail  - Recipient email address
     * @param {string} name     - User's name (for personalization)
     * @param {string} rawToken - The unhashed verification token
     */
    async sendVerificationEmail(toEmail, name, rawToken) {
        const frontendUrl  = process.env.FRONTEND_URL || 'http://localhost:5173';
        const verifyLink   = `${frontendUrl}/verify-email/${rawToken}`;

        const bodyHtml = `
          <p style="color:#475569;line-height:1.7;">
            Hi <strong>${name}</strong>,<br><br>
            Welcome to SmartMeet! Please verify your email address to activate your account
            and start scheduling meetings with AI.
          </p>
          <div style="text-align:center;margin:28px 0;">
            <a href="${verifyLink}"
               style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);
                      color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;
                      font-weight:600;font-size:15px;">
              ✅ Verify My Email
            </a>
          </div>
          <p style="color:#94a3b8;font-size:13px;">
            Or copy this link into your browser:<br>
            <a href="${verifyLink}" style="color:#6366f1;word-break:break-all;">${verifyLink}</a>
          </p>
          <p style="color:#94a3b8;font-size:13px;margin-top:16px;">
            This link expires in <strong>24 hours</strong>.
          </p>`;

        try {
            await this.transporter.sendMail({
                from:    `"SmartMeet" <${process.env.EMAIL_USER}>`,
                to:      toEmail,
                subject: 'Verify your SmartMeet account',
                html:    this._wrapHtml('Verify Your Email Address', bodyHtml),
                text:    `Hi ${name},\n\nVerify your email:\n${verifyLink}\n\nExpires in 24 hours.`,
            });
            logger.info('Verification email sent', { to: toEmail });
            return { success: true };
        } catch (err) {
            logger.error('Failed to send verification email', { to: toEmail, error: err.message });
            return { success: false, error: err.message };
        }
    }

    // ── 2.3 — Send password reset email ──────────────────────
    /**
     * @param {string} toEmail  - Recipient email address
     * @param {string} name     - User's name
     * @param {string} rawToken - The unhashed reset token
     */
    async sendPasswordResetEmail(toEmail, name, rawToken) {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const resetLink   = `${frontendUrl}/reset-password/${rawToken}`;

        const bodyHtml = `
          <p style="color:#475569;line-height:1.7;">
            Hi <strong>${name}</strong>,<br><br>
            We received a request to reset your SmartMeet password.
            Click the button below to choose a new password.
          </p>
          <div style="text-align:center;margin:28px 0;">
            <a href="${resetLink}"
               style="display:inline-block;background:linear-gradient(135deg,#ef4444,#f97316);
                      color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;
                      font-weight:600;font-size:15px;">
              🔑 Reset My Password
            </a>
          </div>
          <p style="color:#94a3b8;font-size:13px;">
            Or copy this link into your browser:<br>
            <a href="${resetLink}" style="color:#6366f1;word-break:break-all;">${resetLink}</a>
          </p>
          <p style="color:#94a3b8;font-size:13px;margin-top:16px;">
            This link expires in <strong>1 hour</strong> and can only be used once.
          </p>`;

        try {
            await this.transporter.sendMail({
                from:    `"SmartMeet" <${process.env.EMAIL_USER}>`,
                to:      toEmail,
                subject: 'Reset your SmartMeet password',
                html:    this._wrapHtml('Reset Your Password', bodyHtml),
                text:    `Hi ${name},\n\nReset your password:\n${resetLink}\n\nExpires in 1 hour.`,
            });
            logger.info('Password reset email sent', { to: toEmail });
            return { success: true };
        } catch (err) {
            logger.error('Failed to send password reset email', { to: toEmail, error: err.message });
            return { success: false, error: err.message };
        }
    }
}

module.exports = new AuthEmailService();
