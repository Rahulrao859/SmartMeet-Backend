// ─────────────────────────────────────────────────────────────
// IMPLEMENTATION 2.1 + 2.2 + 2.3 + 2.4 — Auth Controller
// File: backend/src/controllers/authController.js
//
// Routes handled:
//   POST   /signup              → register + send verification email (2.2)
//   POST   /login               → login + issue access + refresh tokens (2.1)
//   POST   /logout              → revoke refresh token (2.1)
//   POST   /refresh             → issue new access token via refresh cookie (2.1)
//   GET    /me                  → get current user profile
//   GET    /verify-email/:token → verify email address (2.2)
//   POST   /forgot-password     → send password reset email (2.3)
//   POST   /reset-password/:token → apply new password (2.3)
//   PUT    /profile             → update name / timezone / notificationPrefs (2.4)
//   PATCH  /change-password     → change password with current-password check (2.4)
//   DELETE /account             → permanently delete account (GDPR) (2.4)
// ─────────────────────────────────────────────────────────────

'use strict';

const jwt           = require('jsonwebtoken');
const crypto        = require('crypto');
const { validationResult } = require('express-validator');
const User          = require('../models/User');
const RefreshToken  = require('../models/RefreshToken');
const Meeting       = require('../models/Meeting');
const EmailLog      = require('../models/EmailLog');
const AuditLog      = require('../models/AuditLog');
const authEmailService = require('../services/authEmailService');
const logger        = require('../config/logger');
const { AppError }  = require('../middlewares/errorHandler');

// ── Token helpers ─────────────────────────────────────────────
const ACCESS_TOKEN_EXPIRY  = '15m';   // short-lived — stateless JWT
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

function generateAccessToken(userId) {
    return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

function generateRawRefreshToken() {
    return crypto.randomBytes(40).toString('hex');  // 80-char hex string
}

function hashToken(raw) {
    return crypto.createHash('sha256').update(raw).digest('hex');
}

// httpOnly cookie settings for the refresh token
const COOKIE_OPTIONS = {
    httpOnly: true,                                          // JS cannot read it
    secure:   process.env.NODE_ENV === 'production',        // HTTPS only in prod
    sameSite: 'strict',                                     // CSRF protection
    maxAge:   REFRESH_TOKEN_EXPIRY,                         // 7 days
    path:     '/api/auth',                                  // only sent on auth routes
};

// ── Validation helper ─────────────────────────────────────────
function checkValidation(req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        res.status(422).json({ error: 'Validation failed', details: errors.array() });
        return false;
    }
    return true;
}

// ── Format user for response ──────────────────────────────────
function formatUser(user) {
    return {
        id:         user._id,
        name:       user.name,
        email:      user.email,
        role:       user.role || 'member',
        avatar:     user.avatar || '',
        timezone:   user.timezone || 'UTC',
        preferredLanguage: user.preferredLanguage || 'en',
        isVerified: user.isVerified,
        notificationPrefs: user.notificationPrefs,
        createdAt:  user.createdAt,
    };
}

class AuthController {

    // ══════════════════════════════════════════════════════════
    // 2.2 — SIGNUP (with email verification)
    // POST /api/auth/signup
    // ══════════════════════════════════════════════════════════
    async signup(req, res, next) {
        try {
            if (!checkValidation(req, res)) return;

            const { name, email, password } = req.body;

            const existingUser = await User.findOne({ email });
            if (existingUser) return next(new AppError('Email already registered', 409));

            // Create user (isVerified defaults to false)
            const user = new User({ name, email, password });

            // Generate verification token and save (before sending email)
            const rawVerifyToken = user.createEmailVerificationToken();
            await user.save();

            // Send verification email (non-blocking — don't fail signup if email fails)
            authEmailService.sendVerificationEmail(email, name, rawVerifyToken).catch(err => {
                logger.warn('Verification email failed on signup', { userId: user._id, error: err.message });
            });

            // Issue access token immediately (user can log in but scheduling is gated by isVerified)
            const accessToken = generateAccessToken(user._id);

            logger.info('User registered', { userId: user._id, email });

            // Audit log
            AuditLog.create({ userId: user._id, action: 'user.signup', resource: 'user', resourceId: user._id, details: { email }, ipAddress: req.ip || '', userAgent: req.get('User-Agent') || '' }).catch(() => {});

            res.status(201).json({
                message: 'Account created! Please check your email to verify your account.',
                token:   accessToken,
                user:    formatUser(user),
            });
        } catch (err) {
            next(err);
        }
    }

    // ══════════════════════════════════════════════════════════
    // 2.1 — LOGIN (issues access + refresh tokens)
    // POST /api/auth/login
    // ══════════════════════════════════════════════════════════
    async login(req, res, next) {
        try {
            if (!checkValidation(req, res)) return;

            const { email, password } = req.body;

            const user = await User.findOne({ email }).select('+password');
            if (!user || !(await user.comparePassword(password))) {
                // Single message — don't reveal whether email exists
                return next(new AppError('Invalid email or password', 401));
                
            }

            // Generate tokens
            const accessToken  = generateAccessToken(user._id);
            const rawRefresh   = generateRawRefreshToken();
            const hashedRefresh = hashToken(rawRefresh);

            // Store hashed refresh token in DB
            await RefreshToken.create({
                token:     hashedRefresh,
                userId:    user._id,
                expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY),
                userAgent: req.get('User-Agent') || '',
                ipAddress: req.ip || '',
            });

            // Send raw refresh token in httpOnly cookie
            res.cookie('refreshToken', rawRefresh, COOKIE_OPTIONS);

            logger.info('User logged in', { userId: user._id });

            // Audit log
            AuditLog.create({ userId: user._id, action: 'user.login', resource: 'user', resourceId: user._id, ipAddress: req.ip || '', userAgent: req.get('User-Agent') || '' }).catch(() => {});

            res.json({
                message: 'Login successful',
                token:   accessToken,
                user:    formatUser(user),
            });
        } catch (err) {
            next(err);
        }
    }

    // ══════════════════════════════════════════════════════════
    // 2.1 — REFRESH ACCESS TOKEN
    // POST /api/auth/refresh
    // ══════════════════════════════════════════════════════════
    async refreshToken(req, res, next) {
        try {
            const rawToken = req.cookies?.refreshToken;
            if (!rawToken) return next(new AppError('No refresh token provided', 401));

            const hashedToken = hashToken(rawToken);

            // Find the stored token and check it's not expired or revoked
            const storedToken = await RefreshToken.findOne({
                token:     hashedToken,
                isRevoked: false,
                expiresAt: { $gt: new Date() },
            });

            if (!storedToken) {
                res.clearCookie('refreshToken', { path: '/api/auth' });
                return next(new AppError('Invalid or expired refresh token. Please log in again.', 401));
            }

            // Issue a new short-lived access token
            const newAccessToken = generateAccessToken(storedToken.userId);

            res.json({ token: newAccessToken });
        } catch (err) {
            next(err);
        }
    }

    // ══════════════════════════════════════════════════════════
    // 2.1 — LOGOUT (revoke refresh token)
    // POST /api/auth/logout
    // ══════════════════════════════════════════════════════════
    async logout(req, res, next) {
        try {
            const rawToken = req.cookies?.refreshToken;

            if (rawToken) {
                // Mark token as revoked in DB
                await RefreshToken.updateOne(
                    { token: hashToken(rawToken) },
                    { isRevoked: true }
                );
            }

            // Clear the cookie
            res.clearCookie('refreshToken', { path: '/api/auth' });

            logger.info('User logged out', { userId: req.user?._id });
            res.json({ message: 'Logged out successfully' });
        } catch (err) {
            next(err);
        }
    }

    // ══════════════════════════════════════════════════════════
    // GET CURRENT USER
    // GET /api/auth/me
    // ══════════════════════════════════════════════════════════
    async getCurrentUser(req, res, next) {
        try {
            const user = await User.findById(req.user._id);
            if (!user) return next(new AppError('User not found', 404));
            res.json({ user: formatUser(user) });
        } catch (err) {
            next(err);
        }
    }

    // ══════════════════════════════════════════════════════════
    // 2.2 — VERIFY EMAIL
    // GET /api/auth/verify-email/:token
    // ══════════════════════════════════════════════════════════
    async verifyEmail(req, res, next) {
        try {
            const hashedToken = hashToken(req.params.token);

            const user = await User.findOne({
                emailVerificationToken:   hashedToken,
                emailVerificationExpires: { $gt: new Date() },
            }).select('+emailVerificationToken +emailVerificationExpires');

            if (!user) {
                return next(new AppError('Verification link is invalid or has expired.', 400));
            }

            // Mark as verified and clear the token fields
            user.isVerified                 = true;
            user.emailVerificationToken     = undefined;
            user.emailVerificationExpires   = undefined;
            await user.save({ validateBeforeSave: false });

            logger.info('Email verified', { userId: user._id });
            res.json({ message: 'Email verified successfully! You can now schedule meetings.' });
        } catch (err) {
            next(err);
        }
    }

    // ══════════════════════════════════════════════════════════
    // 2.3 — FORGOT PASSWORD (send reset email)
    // POST /api/auth/forgot-password
    // ══════════════════════════════════════════════════════════
    async forgotPassword(req, res, next) {
        try {
            if (!checkValidation(req, res)) return;

            const user = await User.findOne({ email: req.body.email });

            // Always return the same response — don't reveal if email exists
            const GENERIC_MSG = 'If an account with that email exists, a reset link has been sent.';

            if (!user) {
                return res.json({ message: GENERIC_MSG });
            }

            const rawToken = user.createPasswordResetToken();
            await user.save({ validateBeforeSave: false });

            const emailResult = await authEmailService.sendPasswordResetEmail(
                user.email, user.name, rawToken
            );

            if (!emailResult.success) {
                // Roll back the token — don't leave orphaned reset tokens if email fails
                user.clearPasswordReset();
                await user.save({ validateBeforeSave: false });
                return next(new AppError('Could not send reset email. Please try again later.', 500));
            }

            logger.info('Password reset email sent', { userId: user._id });
            res.json({ message: GENERIC_MSG });
        } catch (err) {
            next(err);
        }
    }

    // ══════════════════════════════════════════════════════════
    // 2.3 — RESET PASSWORD
    // POST /api/auth/reset-password/:token
    // ══════════════════════════════════════════════════════════
    async resetPassword(req, res, next) {
        try {
            if (!checkValidation(req, res)) return;

            const hashedToken = hashToken(req.params.token);

            const user = await User.findOne({
                passwordResetToken:   hashedToken,
                passwordResetExpires: { $gt: new Date() },
            }).select('+passwordResetToken +passwordResetExpires +password');

            if (!user) {
                return next(new AppError('Reset link is invalid or has expired.', 400));
            }

            // Set new password + clear token (single-use)
            user.password = req.body.password;
            user.clearPasswordReset();
            await user.save();

            // Revoke ALL existing refresh tokens for this user (security: force re-login)
            await RefreshToken.updateMany({ userId: user._id }, { isRevoked: true });
            res.clearCookie('refreshToken', { path: '/api/auth' });

            logger.info('Password reset successful', { userId: user._id });
            res.json({ message: 'Password reset successful. Please log in with your new password.' });
        } catch (err) {
            next(err);
        }
    }

    // ══════════════════════════════════════════════════════════
    // 2.4 — UPDATE PROFILE
    // PUT /api/auth/profile
    // ══════════════════════════════════════════════════════════
    async updateProfile(req, res, next) {
        try {
            if (!checkValidation(req, res)) return;

            const allowedFields = ['name', 'timezone', 'avatar', 'notificationPrefs', 'preferredLanguage'];
            const updates = {};
            allowedFields.forEach(field => {
                if (req.body[field] !== undefined) updates[field] = req.body[field];
            });

            const user = await User.findByIdAndUpdate(
                req.user._id,
                { $set: updates },
                { new: true, runValidators: true }
            );

            logger.info('Profile updated', { userId: user._id, fields: Object.keys(updates) });
            res.json({ message: 'Profile updated successfully', user: formatUser(user) });
        } catch (err) {
            next(err);
        }
    }

    // ══════════════════════════════════════════════════════════
    // 2.4 — CHANGE PASSWORD
    // PATCH /api/auth/change-password
    // ══════════════════════════════════════════════════════════
    async changePassword(req, res, next) {
        try {
            if (!checkValidation(req, res)) return;

            const { currentPassword, newPassword } = req.body;

            const user = await User.findById(req.user._id).select('+password');
            if (!(await user.comparePassword(currentPassword))) {
                return next(new AppError('Current password is incorrect', 401));
            }

            user.password = newPassword;
            await user.save();

            // Revoke all other refresh tokens (force re-login on other devices)
            await RefreshToken.updateMany({ userId: user._id }, { isRevoked: true });
            res.clearCookie('refreshToken', { path: '/api/auth' });

            logger.info('Password changed', { userId: user._id });
            res.json({ message: 'Password changed successfully. Please log in again.' });
        } catch (err) {
            next(err);
        }
    }

    // ══════════════════════════════════════════════════════════
    // 2.4 — DELETE ACCOUNT (GDPR)
    // DELETE /api/auth/account
    // ══════════════════════════════════════════════════════════
    async deleteAccount(req, res, next) {
        try {
            const userId = req.user._id;

            // Verify password before permanent deletion
            const user = await User.findById(userId).select('+password');
            if (!user) return next(new AppError('User not found', 404));

            const { password } = req.body;
            if (!password || !(await user.comparePassword(password))) {
                return next(new AppError('Password is incorrect. Account deletion requires password confirmation.', 401));
            }

            // Hard delete all user data (cascade)
            await Promise.all([
                Meeting.deleteMany({ userId }),
                EmailLog.deleteMany({ userId }),
                RefreshToken.deleteMany({ userId }),
                User.findByIdAndDelete(userId),
            ]);

            res.clearCookie('refreshToken', { path: '/api/auth' });
            logger.info('Account deleted', { userId });
            res.json({ message: 'Account and all data permanently deleted.' });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new AuthController();
