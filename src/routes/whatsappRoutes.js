const express = require('express');
const router = express.Router();
const { sendWhatsAppMessage, sendMeetingNotification } = require('../services/whatsappService');

/**
 * POST /api/whatsapp/test
 * Sends a test WhatsApp message to verify the integration is working
 */
router.post('/test', async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(400).json({ success: false, error: 'Phone number is required' });
        }

        // Ensure the number is in whatsapp: format
        const to = phone.startsWith('whatsapp:') ? phone : `whatsapp:${phone}`;

        const result = await sendWhatsAppMessage(
            to,
            `🎉 *SmartMeet WhatsApp Test*\n\nYour WhatsApp notifications are working correctly!\n\nYou'll receive meeting details here whenever you schedule a meeting via AI Scheduler. ✨`
        );

        if (result.success) {
            return res.json({ success: true, sid: result.sid });
        } else {
            return res.status(500).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('WhatsApp test error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
