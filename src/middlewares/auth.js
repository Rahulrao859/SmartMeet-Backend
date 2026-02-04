const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
    try {
        // Get token from header
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ error: 'No token provided, authorization denied' });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Find user by ID from token
        const user = await User.findById(decoded.userId);
        
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        // Attach user to request object
        req.user = user;
        next();
    } catch (error) {
        console.error('Auth middleware error:', error.message);
        res.status(401).json({ error: 'Invalid token, authorization denied' });
    }
};

module.exports = auth;