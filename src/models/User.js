// ─────────────────────────────────────────────────────────────
// UPDATED User.js — Phase 2 (2.1 → 2.4)
// File: backend/src/models/User.js
//
// Fields added vs original:
//   2.2  isVerified, emailVerificationToken, emailVerificationExpires
//   2.3  passwordResetToken, passwordResetExpires
//   2.4  avatar, timezone, notificationPrefs
// ─────────────────────────────────────────────────────────────

'use strict';

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');  // Node.js built-in — no install needed

const userSchema = new mongoose.Schema({
    // ── Core identity ────────────────────────────────────────
    name: {
        type:     String,
        required: [true, 'Name is required'],
        trim:     true,
        maxlength: [60, 'Name cannot exceed 60 characters'],
    },
    email: {
        type:      String,
        required:  [true, 'Email is required'],
        unique:    true,
        lowercase: true,
        trim:      true,
        match:     [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,})+$/, 'Please enter a valid email'],
    },
    password: {
        type:      String,
        required:  [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters'],
        select:    false,   // never returned in queries unless explicitly .select('+password')
    },

    // ── 2.4 — Profile fields ─────────────────────────────────
    avatar: {
        type:    String,
        default: '',        // URL to profile image (Cloudinary/S3 in Phase 6)
    },
    timezone: {
        type:    String,
        default: 'UTC',     // IANA timezone string e.g. "Asia/Kolkata"
    },
    notificationPrefs: {
        emailOnInvite:     { type: Boolean, default: true  },
        emailOnReminder:   { type: Boolean, default: true  },
        emailOnCancel:     { type: Boolean, default: true  },
        whatsappOnInvite:  { type: Boolean, default: false },
        reminderMinutes:   { type: Number,  default: 60    }, // remind X min before
    },

    // ── 2.2 — Email Verification ─────────────────────────────
    isVerified: {
        type:    Boolean,
        default: false,
    },
    emailVerificationToken: {
        type:   String,
        select: false,   // hidden from all queries — only fetched when needed
    },
    emailVerificationExpires: {
        type:   Date,
        select: false,
    },

    // ── 2.3 — Password Reset ──────────────────────────────────
    passwordResetToken: {
        type:   String,
        select: false,
    },
    passwordResetExpires: {
        type:   Date,
        select: false,
    },

}, { timestamps: true });

// ══════════════════════════════════════════════════════════════
// INSTANCE METHODS
// ══════════════════════════════════════════════════════════════

// ── Hash password before saving ──────────────────────────────
userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    this.password = await bcrypt.hash(this.password, 12);  // 12 rounds (was 10)
});

// ── Compare plain password with stored hash ───────────────────
userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

// ── 2.2 — Generate email verification token ──────────────────
/**
 * Creates a raw token for the email link and stores its SHA-256 hash in DB.
 * Returns the raw (unhashed) token to be sent in the email URL.
 *
 * Flow:
 *   const rawToken = user.createEmailVerificationToken();
 *   await user.save({ validateBeforeSave: false });
 *   sendEmail(`/verify-email/${rawToken}`);
 */
userSchema.methods.createEmailVerificationToken = function () {
    const rawToken = crypto.randomBytes(32).toString('hex');  // 64-char hex string
    // Store hashed version — raw token never touches DB
    this.emailVerificationToken   = crypto.createHash('sha256').update(rawToken).digest('hex');
    this.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    return rawToken;
};

// ── 2.3 — Generate password reset token ──────────────────────
/**
 * Same pattern as above but expires in 1 hour (shorter = more secure for resets).
 *
 * Flow:
 *   const rawToken = user.createPasswordResetToken();
 *   await user.save({ validateBeforeSave: false });
 *   sendEmail(`/reset-password/${rawToken}`);
 */
userSchema.methods.createPasswordResetToken = function () {
    const rawToken = crypto.randomBytes(32).toString('hex');
    this.passwordResetToken   = crypto.createHash('sha256').update(rawToken).digest('hex');
    this.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    return rawToken;
};

// ── Clear password reset fields after use ─────────────────────
userSchema.methods.clearPasswordReset = function () {
    this.passwordResetToken   = undefined;
    this.passwordResetExpires = undefined;
};

module.exports = mongoose.model('User', userSchema);
