'use strict';
const express      = require('express');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const dotenv       = require('dotenv');
const path         = require('path');

// ── Load environment variables ────────────────────────────────
// Root .env takes priority; backend/.env fills in missing vars
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '../.env') });

// ── Startup validation (fail-fast on missing critical vars) ───
const REQUIRED_ENV = ['MONGODB_URI', 'JWT_SECRET', 'GEMINI_API_KEY'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length > 0) {
    console.error(`[STARTUP] Missing required environment variables: ${missing.join(', ')}`);
    console.error('[STARTUP] Check your .env file. Server cannot start safely.');
    process.exit(1);
}
console.log('[STARTUP] Environment OK — MONGODB_URI, JWT_SECRET, GEMINI_API_KEY loaded');

// ── Database ──────────────────────────────────────────────────
const connectDB = require('./config/database');
connectDB();

// ── Route imports ─────────────────────────────────────────────
// Legacy routes (v0 — kept for backward compatibility)
const apiRoutes      = require('./routes/apiRoutes');
const authRoutes     = require('./routes/authRoutes');
const calendarRoutes = require('./routes/calendarRoutes');
const whatsappRoutes = require('./routes/whatsappRoutes');

// v1 routes (Phase 2 + 3 — new canonical endpoints)
const v1AuthRoutes     = require('./routes/v1/authRoutes');
const v1MeetingRoutes  = require('./routes/v1/meetingRoutes');
const v1ActivityRoutes = require('./routes/v1/activityRoutes');

// ── App setup ─────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 5000;

// ── CORS ──────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',').map(o => o.trim());
app.use(cors({
    origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,   // required for httpOnly cookie (refresh token)
}));

// ── Core middleware ───────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());                   // needed to read refresh token cookie

// ── Legacy routes (v0) ────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/whatsapp', whatsappRoutes);

// ── v1 routes (Phase 2 + 3 + 4) ───────────────────────────────
app.use('/api/auth',  v1AuthRoutes);       // /api/auth/* (same prefix, new handlers)
app.use('/api/v1',    v1MeetingRoutes);    // /api/v1/meetings, /api/v1/schedule, etc.
app.use('/api/v1',    v1ActivityRoutes);   // /api/v1/activity

// ── Health check ──────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'SmartMeet Backend is running', version: 'v1' }));

// ── 404 handler ───────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: `Route ${req.method} ${req.path} not found` }));

// ── Global error handler ──────────────────────────────────────
app.use((err, req, res, next) => {
    const status  = err.statusCode || err.status || 500;
    const message = err.isOperational ? err.message : 'Internal server error';
    if (status >= 500) console.error('[ERROR]', err);
    res.status(status).json({ error: message });
});

// ── Create HTTP Server + Socket.io ────────────────────────────
const http = require('http');
const { initSocket } = require('./config/socket');
const server = http.createServer(app);
initSocket(server);

// ── Start server ──────────────────────────────────────────────
if (require.main === module) {
    server.listen(PORT, () => console.log(`[STARTUP] Server running on port ${PORT}`));
}

module.exports = server;
