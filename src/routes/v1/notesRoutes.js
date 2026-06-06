'use strict';

const express  = require('express');
const router   = express.Router();
const auth     = require('../../middlewares/auth');
const notesController = require('../../controllers/notesController');

// All routes under /api/v1/meetings/:meetingId/notes
router.post('/meetings/:meetingId/notes',                         auth, notesController.addNotes.bind(notesController));
router.get('/meetings/:meetingId/notes',                          auth, notesController.getNotes.bind(notesController));
router.post('/meetings/:meetingId/notes/summarize',               auth, notesController.generateSummary.bind(notesController));
router.patch('/meetings/:meetingId/notes/action-items/:itemId',   auth, notesController.updateActionItem.bind(notesController));
router.post('/meetings/:meetingId/notes/email-summary',           auth, notesController.emailSummary.bind(notesController));

module.exports = router;
