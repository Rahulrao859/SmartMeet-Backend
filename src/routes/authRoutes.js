const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const authController = require('../controllers/authcontroller');
const auth = require('../middlewares/auth');

// Validation rules
const signupValidation = [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Please enter a valid email'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
];

const loginValidation = [
    body('email').isEmail().withMessage('Please enter a valid email'),
    body('password').notEmpty().withMessage('Password is required')
];

// Routes
router.post('/signup', signupValidation, authController.signup);
router.post('/login', loginValidation, authController.login);
router.get('/me', auth, authController.getCurrentUser);

module.exports = router;