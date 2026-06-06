'use strict';

const Meeting      = require('../models/Meeting');
const MeetingNotes = require('../models/MeetingNotes');
const geminiService = require('../services/geminiService');
const emailService  = require('../services/emailService');
const logger        = require('../config/logger');
const { AppError }  = require('../middlewares/errorHandler');

class NotesController {

    // ══════════════════════════════════════════════════════════
    // ADD / UPDATE NOTES
    // POST /api/v1/meetings/:meetingId/notes
    // Body: { rawNotes: "..." }
    // ══════════════════════════════════════════════════════════
    async addNotes(req, res, next) {
        try {
            const { meetingId } = req.params;
            const { rawNotes }  = req.body;

            if (!rawNotes || !rawNotes.trim()) {
                return next(new AppError('Notes content is required', 400));
            }

            // Verify meeting belongs to user
            const meeting = await Meeting.findOne({ _id: meetingId, userId: req.user._id });
            if (!meeting) return next(new AppError('Meeting not found', 404));

            // Upsert notes
            const notes = await MeetingNotes.findOneAndUpdate(
                { meetingId, userId: req.user._id },
                { rawNotes: rawNotes.trim() },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );

            logger.info('Meeting notes saved', { meetingId, userId: req.user._id });
            res.json({ message: 'Notes saved', notes });
        } catch (err) {
            next(err);
        }
    }

    // ══════════════════════════════════════════════════════════
    // GENERATE AI SUMMARY
    // POST /api/v1/meetings/:meetingId/notes/summarize
    // ══════════════════════════════════════════════════════════
    async generateSummary(req, res, next) {
        try {
            const { meetingId } = req.params;

            const meeting = await Meeting.findOne({ _id: meetingId, userId: req.user._id });
            if (!meeting) return next(new AppError('Meeting not found', 404));

            const notes = await MeetingNotes.findOne({ meetingId, userId: req.user._id });
            if (!notes || !notes.rawNotes) {
                return next(new AppError('No notes found for this meeting. Add notes first.', 400));
            }

            // Call Gemini AI for summarization
            const summaryResult = await geminiService.summarizeMeetingNotes(notes.rawNotes, meeting.title);

            // Update the notes with AI summary
            notes.aiSummary    = summaryResult.summary    || '';
            notes.actionItems  = summaryResult.actionItems || [];
            notes.keyDecisions = summaryResult.keyDecisions || [];
            await notes.save();

            logger.info('AI summary generated', { meetingId, userId: req.user._id, actionItems: notes.actionItems.length });

            res.json({
                message: 'AI summary generated successfully',
                notes,
            });
        } catch (err) {
            next(err);
        }
    }

    // ══════════════════════════════════════════════════════════
    // GET NOTES FOR A MEETING
    // GET /api/v1/meetings/:meetingId/notes
    // ══════════════════════════════════════════════════════════
    async getNotes(req, res, next) {
        try {
            const { meetingId } = req.params;

            const meeting = await Meeting.findOne({ _id: meetingId, userId: req.user._id }).lean();
            if (!meeting) return next(new AppError('Meeting not found', 404));

            const notes = await MeetingNotes.findOne({ meetingId, userId: req.user._id }).lean();

            res.json({
                meeting: { title: meeting.title, date: meeting.date, time: meeting.time, participants: meeting.participants },
                notes: notes || { rawNotes: '', aiSummary: '', actionItems: [], keyDecisions: [] },
            });
        } catch (err) {
            next(err);
        }
    }

    // ══════════════════════════════════════════════════════════
    // TOGGLE ACTION ITEM COMPLETION
    // PATCH /api/v1/meetings/:meetingId/notes/action-items/:itemId
    // Body: { completed: true }
    // ══════════════════════════════════════════════════════════
    async updateActionItem(req, res, next) {
        try {
            const { meetingId, itemId } = req.params;
            const { completed } = req.body;

            const notes = await MeetingNotes.findOne({ meetingId, userId: req.user._id });
            if (!notes) return next(new AppError('Notes not found', 404));

            const item = notes.actionItems.id(itemId);
            if (!item) return next(new AppError('Action item not found', 404));

            item.completed = !!completed;
            await notes.save();

            res.json({ message: 'Action item updated', actionItem: item });
        } catch (err) {
            next(err);
        }
    }

    // ══════════════════════════════════════════════════════════
    // EMAIL SUMMARY TO PARTICIPANTS
    // POST /api/v1/meetings/:meetingId/notes/email-summary
    // ══════════════════════════════════════════════════════════
    async emailSummary(req, res, next) {
        try {
            const { meetingId } = req.params;

            const meeting = await Meeting.findOne({ _id: meetingId, userId: req.user._id });
            if (!meeting) return next(new AppError('Meeting not found', 404));

            const notes = await MeetingNotes.findOne({ meetingId, userId: req.user._id });
            if (!notes || !notes.aiSummary) {
                return next(new AppError('Generate an AI summary first before emailing.', 400));
            }

            if (!meeting.participants || meeting.participants.length === 0) {
                return next(new AppError('No participants to email.', 400));
            }

            // Send summary emails
            const results = await Promise.allSettled(
                meeting.participants.map(email =>
                    emailService.sendMeetingSummaryEmail(email, {
                        meetingTitle:  meeting.title,
                        meetingDate:   meeting.date,
                        meetingTime:   meeting.time,
                        summary:       notes.aiSummary,
                        actionItems:   notes.actionItems,
                        keyDecisions:  notes.keyDecisions,
                    })
                )
            );

            const sent   = results.filter(r => r.status === 'fulfilled' && r.value?.success).length;
            const failed = results.length - sent;

            logger.info('Meeting summary emailed', { meetingId, sent, failed });

            res.json({
                message: `Summary emailed to ${sent}/${results.length} participants`,
                sent,
                failed,
            });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new NotesController();
