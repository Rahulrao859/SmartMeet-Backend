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

// ── Startup validation ────────────────────────────────────────
// NOTE: Never call process.exit() in a Vercel serverless function — it crashes
// the function with FUNCTION_INVOCATION_FAILED. Log and continue instead.
const REQUIRED_ENV = ['MONGODB_URI', 'JWT_SECRET', 'GEMINI_API_KEY'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length > 0) {
    console.error(`[STARTUP] Missing required environment variables: ${missing.join(', ')}`);
    console.error('[STARTUP] Set these in your Vercel project → Settings → Environment Variables.');
}
console.log('[STARTUP] Environment OK — MONGODB_URI, JWT_SECRET, GEMINI_API_KEY loaded');

// ── Database ──────────────────────────────────────────────────
// connectDB is called here so the connection is attempted on cold start.
// The cached-connection pattern in database.js reuses it on warm starts.
const connectDB = require('./config/database');
connectDB().catch(err => console.error('[DB] Initial connection failed:', err.message));

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
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({
    origin: (origin, cb) => {
        // Allow requests with no origin (mobile apps, curl, Postman)
        if (!origin) return cb(null, true);
        // If no whitelist configured, allow all origins (safe for public API)
        if (allowedOrigins.length === 0) return cb(null, true);
        if (allowedOrigins.includes(origin)) return cb(null, true);
        const corsError = new Error(`CORS: origin ${origin} not allowed`);
        corsError.statusCode = 403;
        corsError.isOperational = true;
        cb(corsError);
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

// ── Root & Health check ───────────────────────────────────────
app.get('/', (req, res) => res.json({ status: 'SmartMeet API is running', version: 'v1', env: process.env.NODE_ENV }));
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

// ── Local dev only: HTTP Server ──────────────────────────────
// Vercel is serverless — it cannot run a persistent HTTP server or WebSockets.
if (require.main === module) {
    const http = require('http');
    const server = http.createServer(app);
    server.listen(PORT, () => console.log(`[STARTUP] Server running on port ${PORT}`));
}


// ── Export the Express app (Vercel serverless requires this) ──
module.exports = app;
