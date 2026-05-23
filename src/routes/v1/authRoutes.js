// ─────────────────────────────────────────────────────────────
// IMPLEMENTATION 2.1–2.4 — Auth Routes (v1)
// File: backend/src/routes/v1/authRoutes.js
//
// All routes prefixed with /api/v1/auth via app.js
// ─────────────────────────────────────────────────────────────

'use strict';

const express   = require('express');
const { body }  = require('express-validator');
const router    = express.Router();
const auth      = require('../../middlewares/auth');
const authController = require('../../controllers/authController');

// ── Validation rule sets ──────────────────────────────────────
const signupRules = [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 60 }),
    body('email').isEmail().normalizeEmail().withMessage('Please enter a valid email'),
    body('password')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
        .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
        .matches(/[0-9]/).withMessage('Password must contain at least one number'),
];

const loginRules = [
    body('email').isEmail().normalizeEmail().withMessage('Please enter a valid email'),
    body('password').notEmpty().withMessage('Password is required'),
];

const forgotPasswordRules = [
    body('email').isEmail().normalizeEmail().withMessage('Please enter a valid email'),
];

const resetPasswordRules = [
    body('password')
        .isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
        .matches(/[A-Z]/).withMessage('Must contain at least one uppercase letter')
        .matches(/[0-9]/).withMessage('Must contain at least one number'),
];

const changePasswordRules = [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword')
        .isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
        .matches(/[A-Z]/).withMessage('Must contain at least one uppercase letter')
        .matches(/[0-9]/).withMessage('Must contain at least one number'),
];

const updateProfileRules = [
    body('name').optional().trim().notEmpty().isLength({ max: 60 }),
    body('timezone').optional().trim().notEmpty(),
    body('avatar').optional().trim().isURL().withMessage('Avatar must be a valid URL'),
];

// ── Public routes (no auth required) ─────────────────────────
router.post('/signup',               signupRules,         authController.signup.bind(authController));
router.post('/login',                loginRules,          authController.login.bind(authController));
router.post('/logout',                                    authController.logout.bind(authController));
router.post('/refresh',                                   authController.refreshToken.bind(authController));
router.get('/verify-email/:token',                        authController.verifyEmail.bind(authController));
router.post('/forgot-password',      forgotPasswordRules, authController.forgotPassword.bind(authController));
router.post('/reset-password/:token', resetPasswordRules, authController.resetPassword.bind(authController));

// ── Protected routes (JWT required) ──────────────────────────
router.get('/me',                auth, authController.getCurrentUser.bind(authController));
router.put('/profile',           auth, updateProfileRules, authController.updateProfile.bind(authController));
router.patch('/change-password', auth, changePasswordRules, authController.changePassword.bind(authController));
router.delete('/account',        auth, authController.deleteAccount.bind(authController));

module.exports = router;
