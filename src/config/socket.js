'use strict';

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('./logger');

let io = null;

/**
 * Initialize Socket.io on the HTTP server
 * @param {import('http').Server} server 
 */
function initSocket(server) {
    io = new Server(server, {
        cors: {
            origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',').map(o => o.trim()),
            methods: ['GET', 'POST'],
            credentials: true
        }
    });

    // ── Authentication Middleware for Socket.io ──────────────────
    io.use(async (socket, next) => {
        try {
            // Get token from auth payload, handshake query, or authorization header
            const token = 
                socket.handshake.auth?.token || 
                socket.handshake.query?.token || 
                socket.handshake.headers?.authorization?.replace('Bearer ', '');

            if (!token) {
                return next(new Error('Authentication error: No token provided'));
            }

            // Verify JWT
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            
            // Find User
            const user = await User.findById(decoded.userId).select('-password');
            if (!user) {
                return next(new Error('Authentication error: User not found'));
            }

            // Attach user instance to socket
            socket.user = user;
            next();
        } catch (err) {
            logger.error(`[SOCKET] Authentication failed: ${err.message}`);
            return next(new Error('Authentication error: Invalid token'));
        }
    });

    // ── Connection handler ────────────────────────────────────────
    io.on('connection', (socket) => {
        const userId = socket.user._id.toString();
        const roomName = `user:${userId}`;

        logger.info(`[SOCKET] Client connected: ${socket.id} (User: ${userId})`);
        
        // Join their dedicated user-specific room for targeted messaging
        socket.join(roomName);

        socket.on('disconnect', () => {
            logger.info(`[SOCKET] Client disconnected: ${socket.id} (User: ${userId})`);
        });
    });

    return io;
}

/**
 * Send an event only to a specific user's connected sockets
 * @param {string} userId 
 * @param {string} event 
 * @param {any} payload 
 */
function emitToUser(userId, event, payload) {
    if (!io) {
        logger.warn('[SOCKET] Cannot emit: io is not initialized');
        return false;
    }
    const roomName = `user:${userId}`;
    io.to(roomName).emit(event, payload);
    logger.info(`[SOCKET] Emitted '${event}' to room '${roomName}'`);
    return true;
}

/**
 * Get the global Server instance
 */
function getIO() {
    return io;
}

module.exports = {
    initSocket,
    emitToUser,
    getIO
};
