const mongoose = require('mongoose');

// ── Serverless connection cache ────────────────────────────────
// Vercel freezes/thaws lambda processes between invocations (warm starts).
// Caching the promise on `global` lets warm invocations skip the TCP
// handshake entirely instead of opening a new connection every request.
let cached = global._mongooseCache;
if (!cached) {
    cached = global._mongooseCache = { conn: null, promise: null };
}

const connectDB = async () => {
    // Return immediately if already connected
    if (cached.conn) {
        return cached.conn;
    }

    // Start a new connection if one isn't already in-flight
    if (!cached.promise) {
        cached.promise = mongoose.connect(process.env.MONGODB_URI, {
            bufferCommands: false, // Fail fast rather than queueing commands
        });
    }

    try {
        cached.conn = await cached.promise;
        console.log('MongoDB connected successfully');
    } catch (error) {
        // Reset so the next invocation retries the connection
        cached.promise = null;
        console.error('MongoDB connection error:', error.message);
        // NEVER call process.exit() in a serverless function — it crashes
        // the entire function with FUNCTION_INVOCATION_FAILED.
        throw error;
    }

    return cached.conn;
};

module.exports = connectDB;
