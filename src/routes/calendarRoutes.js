const express = require('express');
const router = express.Router();
const googleCalendarService = require('../services/googleCalendarService');

// Initiate OAuth flow
router.get('/auth', (req, res) => {
    try {
        const authUrl = googleCalendarService.getAuthUrl();
        res.json({ authUrl });
    } catch (error) {
        console.error('Error generating auth URL:', error);
        res.status(500).json({ error: 'Failed to generate authorization URL', details: error.message });
    }
});

// OAuth callback handler
router.get('/callback', async (req, res) => {
    const { code } = req.query;

    if (!code) {
        return res.status(400).send('Authorization code missing');
    }

    try {
        await googleCalendarService.handleCallback(code);

        // Redirect to frontend settings page with success message
        res.redirect('http://localhost:5173/settings?calendar=connected');
    } catch (error) {
        console.error('Error handling OAuth callback:', error);
        res.redirect('http://localhost:5173/settings?calendar=error');
    }
});

// Get connection status
router.get('/status', async (req, res) => {
    try {
        const status = await googleCalendarService.getConnectionStatus();
        res.json(status);
    } catch (error) {
        console.error('Error checking calendar status:', error);
        res.status(500).json({ connected: false, error: error.message });
    }
});

// Disconnect calendar
router.post('/disconnect', (req, res) => {
    try {
        googleCalendarService.disconnect();
        res.json({ success: true, message: 'Calendar disconnected' });
    } catch (error) {
        console.error('Error disconnecting calendar:', error);
        res.status(500).json({ error: 'Failed to disconnect calendar' });
    }
});

module.exports = router;
