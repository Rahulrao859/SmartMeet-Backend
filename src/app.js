const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Load from root .env first (so real keys there take precedence over placeholders in backend/.env)
dotenv.config({ path: path.join(__dirname, '../../.env') });
// Load from backend .env (fills in any missing vars)
dotenv.config({ path: path.join(__dirname, '../.env') });

console.log("Current working directory:", process.cwd());
console.log("GEMINI_API_KEY loaded:", process.env.GEMINI_API_KEY ? "YES (Length: " + process.env.GEMINI_API_KEY.length + ")" : "NO");
console.log("MONGODB_URI loaded:", process.env.MONGODB_URI ? "YES" : "NO");
console.log("JWT_SECRET loaded:", process.env.JWT_SECRET ? "YES" : "NO");

// Database connection
const connectDB = require('./config/database');
connectDB();

const apiRoutes = require('./routes/apiRoutes');
const authRoutes = require('./routes/authRoutes');
const calendarRoutes = require('./routes/calendarRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);
app.use('/api/calendar', calendarRoutes);

// Health Check
app.get('/health', (req, res) => {
    res.send('SmartMeet Backend is running');
    console.log("server is runing");
});

// Start Server
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

module.exports = app;
