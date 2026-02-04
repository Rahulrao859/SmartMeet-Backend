const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const User = require('../models/User');

class AuthController {
    constructor() {
        // Bind methods to preserve 'this' context
        this.signup = this.signup.bind(this);
        this.login = this.login.bind(this);
        this.getCurrentUser = this.getCurrentUser.bind(this);
    }

    // Generate JWT Token
    generateToken(userId) {
        return jwt.sign(
            { userId },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );
    }

    // Register new user
    async signup(req, res) {
        try {
            console.log('Signup request received:', { name: req.body.name, email: req.body.email });

            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                console.log('Validation errors:', errors.array());
                return res.status(400).json({ errors: errors.array() });
            }

            const { name, email, password } = req.body;

            // Check if user already exists
            console.log('Checking if user exists...');
            const existingUser = await User.findOne({ email });
            if (existingUser) {
                console.log('User already exists:', email);
                return res.status(400).json({ error: 'Email already registered' });
            }

            // Create new user
            console.log('Creating new user...');
            const user = new User({ name, email, password });
            await user.save();
            console.log('User saved successfully:', user._id);

            // Generate token
            const token = this.generateToken(user._id);
            console.log('Token generated successfully');

            res.status(201).json({
                message: 'User registered successfully',
                token,
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email
                }
            });
        } catch (error) {
            console.error('Signup error:', error);
            console.error('Error stack:', error.stack);
            console.error('Error message:', error.message);
            res.status(500).json({ error: 'Server error during registration', details: error.message });
        }
    }

    // Login user
    async login(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { email, password } = req.body;

            // Find user and include password field
            const user = await User.findOne({ email }).select('+password');
            if (!user) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            // Check password
            const isMatch = await user.comparePassword(password);
            if (!isMatch) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            // Generate token
            const token = this.generateToken(user._id);

            res.json({
                message: 'Login successful',
                token,
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email
                }
            });
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({ error: 'Server error during login' });
        }
    }

    // Get current user
    async getCurrentUser(req, res) {
        try {
            const user = await User.findById(req.user._id);
            res.json({
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email
                }
            });
        } catch (error) {
            console.error('Get user error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    }
}

module.exports = new AuthController();