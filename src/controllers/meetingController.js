// ─────────────────────────────────────────────────────────────
// IMPLEMENTATION 3.2 + 3.3 + 3.4 + 3.5 — Meeting Controller
// File: backend/src/controllers/meetingController.js
//
// New vs original:
//   3.2  PATCH /:id   → reschedule (edit date/time/title/platform/notes)
//   3.3  DELETE /:id  → soft cancel or ?permanent=true hard delete
//   3.4  GET /:id     → single meeting with its email logs
//   3.5  GET /        → paginated + filterable + searchable list
//   3.5  GET /email-logs → paginated email log list
//   Existing schedule + stats preserved and updated to use logger
// ─────────────────────────────────────────────────────────────

'use strict';

const { validationResult } = require('express-validator');
const Meeting    = require('../models/Meeting');
const EmailLog   = require('../models/EmailLog');
const { AppError } = require('../middlewares/errorHandler');
const logger     = require('../config/logger');

// These services exist in the original codebase — keep same imports
const geminiService   = require('../services/geminiService');
const emailService    = require('../services/emailService');
const whatsappService = require('../services/whatsappService');
const calendarService = require('../services/googleCalendarService');

// ── Pagination helper ──────────────────────────────────────────
const parsePagination = (query) => {
    const page  = Math.max(1, parseInt(query.page)  || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit) || 20));
    const skip  = (page - 1) * limit;
    return { page, limit, skip };
};

class MeetingController {

    // ══════════════════════════════════════════════════════════
    // EXISTING — Schedule Meeting (AI-powered)
    // POST /api/schedule
    // Updated: uses logger instead of console.log
    // ══════════════════════════════════════════════════════════
    async scheduleMeeting(req, res, next) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(422).json({ error: 'Validation failed', details: errors.array() });
            }

            const { query, emails, timezone } = req.body;
            const emailList = emails.split(',').map(e => e.trim()).filter(e => e);

            logger.info('Scheduling meeting via AI', { userId: req.user._id, query: query.slice(0, 60) });

            // 1 — Parse meeting details from Gemini AI
            const meetingDetails = await geminiService.parseMeetingRequest(query, timezone);
            if (!meetingDetails || !meetingDetails.title) {
                return next(new AppError('Could not parse meeting details from your request. Please be more specific.', 422));
            }

            // 2 — Create calendar event
            let calendarData = {};
            try {
                calendarData = await calendarService.createEvent(meetingDetails) || {};
            } catch (calErr) {
                logger.warn('Calendar event creation failed (non-fatal)', { error: calErr.message });
            }

            // 3 — Save meeting to DB
            const meeting = await Meeting.create({
                userId:            req.user._id,
                title:             meetingDetails.title,
                date:              meetingDetails.date,
                time:              meetingDetails.time,
                duration:          meetingDetails.duration,
                platform:          meetingDetails.platform,
                meetingLink:       calendarData.meetingLink       || meetingDetails.meetingLink || '',
                meetingId:         calendarData.meetingId         || '',
                meetingPassword:   calendarData.meetingPassword   || '',
                hostLink:          calendarData.hostLink          || '',
                participants:      emailList,
                timezone:          timezone || 'UTC',
                calendarEventId:   calendarData.eventId           || '',
                calendarEventLink: calendarData.eventLink         || '',
            });

            // 4 — Send notification emails (non-blocking — errors logged, not thrown)
            const emailResults = await Promise.allSettled(
                emailList.map(email =>
                    emailService.sendMeetingEmail(email, {
                        title:           meeting.title,
                        date:            meeting.date,
                        time:            meeting.time,
                        duration:        meeting.duration,
                        platform:        meeting.platform,
                        meetingLink:     meeting.meetingLink,
                        meetingId:       meeting.meetingId,
                        meetingPassword: meeting.meetingPassword,
                    })
                )
            );

            // 5 — Log email results
            const emailLogs = await Promise.all(
                emailResults.map((result, i) => {
                    const status = result.status === 'fulfilled' && result.value?.success ? 'Sent' : 'Failed';
                    const errorMsg = result.reason?.message || result.value?.error || '';
                    return EmailLog.create({
                        userId:    req.user._id,
                        meetingId: meeting._id,
                        recipient: emailList[i],
                        subject:   `Meeting Scheduled: ${meeting.title}`,
                        status,
                        errorMessage: errorMsg,
                        emailType: 'meeting_invite',
                    });
                })
            );

            // Import socket utility to emit real-time events
            const { emitToUser } = require('../config/socket');

            // Emit real-time socket events
            emitToUser(req.user._id.toString(), 'meeting:created', { meeting });
            emailLogs.forEach(log => {
                emitToUser(req.user._id.toString(), 'email:log', { log });
            });

            // 6 — WhatsApp notification (best-effort)
            try {
                await whatsappService.sendMeetingNotification(req.user, meeting);
            } catch (waErr) {
                logger.warn('WhatsApp notification failed (non-fatal)', { error: waErr.message });
            }

            logger.info('Meeting scheduled successfully', {
                meetingId:  meeting._id,
                userId:     req.user._id,
                emailsSent: emailLogs.filter(l => l.status === 'Sent').length,
            });

            res.status(201).json({
                message:    'Meeting scheduled successfully!',
                meeting,
                calendarLink: calendarData.eventLink || null,
                emailResults: emailLogs.map(l => ({ recipient: l.recipient, status: l.status })),
            });
        } catch (err) {
            next(err);
        }
    }

    // ══════════════════════════════════════════════════════════
    // 3.5 — LIST MEETINGS (paginated + filtered + searchable)
    // GET /api/v1/meetings?page=1&limit=20&status=confirmed&search=standup&from=&to=
    // ══════════════════════════════════════════════════════════
    async getMeetings(req, res, next) {
        try {
            const { page, limit, skip } = parsePagination(req.query);

            // Build filter
            const filter = { userId: req.user._id };

            if (req.query.status && ['confirmed', 'cancelled', 'rescheduled', 'pending'].includes(req.query.status)) {
                filter.status = req.query.status;
            }
            if (req.query.search) {
                filter.title = { $regex: req.query.search.trim(), $options: 'i' };
            }
            if (req.query.from || req.query.to) {
                filter.date = {};
                if (req.query.from) filter.date.$gte = req.query.from;
                if (req.query.to)   filter.date.$lte = req.query.to;
            }

            const [meetings, total] = await Promise.all([
                Meeting.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
                Meeting.countDocuments(filter),
            ]);

            res.json({
                meetings,
                pagination: {
                    total,
                    page,
                    limit,
                    pages: Math.ceil(total / limit),
                    hasNext: page < Math.ceil(total / limit),
                    hasPrev: page > 1,
                },
            });
        } catch (err) {
            next(err);
        }
    }

    // ══════════════════════════════════════════════════════════
    // 3.4 — GET SINGLE MEETING
    // GET /api/v1/meetings/:id
    // ══════════════════════════════════════════════════════════
    async getMeetingById(req, res, next) {
        try {
            const meeting = await Meeting.findOne({
                _id:    req.params.id,
                userId: req.user._id,
            }).lean();

            if (!meeting) return next(new AppError('Meeting not found', 404));

            // Include email logs for this meeting
            const emailLogs = await EmailLog.find({ meetingId: meeting._id })
                .sort({ createdAt: -1 }).lean();

            res.json({ meeting, emailLogs });
        } catch (err) {
            next(err);
        }
    }

    // ══════════════════════════════════════════════════════════
    // 3.2 — RESCHEDULE / EDIT MEETING
    // PATCH /api/v1/meetings/:id
    // Body: { title?, date?, time?, duration?, platform?, notes? }
    // ══════════════════════════════════════════════════════════
    async updateMeeting(req, res, next) {
        try {
            const meeting = await Meeting.findOne({
                _id:    req.params.id,
                userId: req.user._id,
            });

            if (!meeting) return next(new AppError('Meeting not found', 404));
            if (meeting.status === 'cancelled') {
                return next(new AppError('Cannot edit a cancelled meeting', 400));
            }

            const allowed = ['title', 'date', 'time', 'duration', 'platform', 'notes'];
            const updates = {};
            allowed.forEach(field => {
                if (req.body[field] !== undefined) updates[field] = req.body[field];
            });

            if (Object.keys(updates).length === 0) {
                return next(new AppError('No valid fields provided to update', 400));
            }

            // If date or time changed → mark as rescheduled
            const isRescheduled = updates.date || updates.time;
            if (isRescheduled) updates.status = 'rescheduled';

            Object.assign(meeting, updates);
            await meeting.save();

            // Send rescheduling emails (non-blocking)
            if (isRescheduled && meeting.participants?.length > 0) {
                Promise.allSettled(
                    meeting.participants.map(email =>
                        emailService.sendMeetingEmail(email, {
                            title:    meeting.title,
                            date:     meeting.date,
                            time:     meeting.time,
                            duration: meeting.duration,
                            platform: meeting.platform,
                            meetingLink: meeting.meetingLink,
                        }).then(result => {
                            const status = result?.success ? 'Sent' : 'Failed';
                            return EmailLog.create({
                                userId:    req.user._id,
                                meetingId: meeting._id,
                                recipient: email,
                                subject:   `Meeting Rescheduled: ${meeting.title}`,
                                status,
                                emailType: 'reschedule',
                            }).then(log => {
                                const { emitToUser } = require('../config/socket');
                                emitToUser(req.user._id.toString(), 'email:log', { log });
                            });
                        })
                    )
                ).catch(e => logger.warn('Reschedule email error', { error: e.message }));
            }

            // Emit Socket event for real-time list update
            const { emitToUser: emitUpdate } = require('../config/socket');
            emitUpdate(req.user._id.toString(), 'meeting:updated', { meeting });

            logger.info('Meeting updated', {
                meetingId: meeting._id,
                userId:    req.user._id,
                fields:    Object.keys(updates),
                status:    meeting.status,
            });

            res.json({ message: 'Meeting updated successfully', meeting });
        } catch (err) {
            next(err);
        }
    }

    // ══════════════════════════════════════════════════════════
    // 3.3 — CANCEL / DELETE MEETING
    // DELETE /api/v1/meetings/:id
    // ?permanent=true → hard delete from DB
    // default         → soft delete (status = 'cancelled')
    // ══════════════════════════════════════════════════════════
    async deleteMeeting(req, res, next) {
        try {
            const meeting = await Meeting.findOne({
                _id:    req.params.id,
                userId: req.user._id,
            });

            if (!meeting) return next(new AppError('Meeting not found', 404));

            const permanent = req.query.permanent === 'true';
            const { emitToUser: emitDel } = require('../config/socket');

            if (permanent) {
                const meetingId = meeting._id;
                // Hard delete — remove from DB entirely
                await Meeting.findByIdAndDelete(meeting._id);
                await EmailLog.deleteMany({ meetingId: meeting._id });
                
                emitDel(req.user._id.toString(), 'meeting:deleted', { id: meetingId });

                logger.info('Meeting permanently deleted', { meetingId: meeting._id, userId: req.user._id });
                return res.json({ message: 'Meeting permanently deleted' });
            }

            // Soft delete — keep record, update status
            if (meeting.status === 'cancelled') {
                return next(new AppError('Meeting is already cancelled', 400));
            }

            meeting.status = 'cancelled';
            await meeting.save();

            // Send cancellation emails (non-blocking)
            if (meeting.participants?.length > 0) {
                Promise.allSettled(
                    meeting.participants.map(email =>
                        emailService.sendCancellationEmail(email, {
                            title:    meeting.title,
                            date:     meeting.date,
                            time:     meeting.time,
                            platform: meeting.platform,
                        }).then(result => {
                            const status = result?.success ? 'Sent' : 'Failed';
                            return EmailLog.create({
                                userId:    req.user._id,
                                meetingId: meeting._id,
                                recipient: email,
                                subject:   `Meeting Cancelled: ${meeting.title}`,
                                status,
                                emailType: 'cancellation',
                            }).then(log => {
                                emitDel(req.user._id.toString(), 'email:log', { log });
                            });
                        })
                    )
                ).catch(e => logger.warn('Cancellation email error', { error: e.message }));
            }

            emitDel(req.user._id.toString(), 'meeting:cancelled', { meeting });

            logger.info('Meeting cancelled', { meetingId: meeting._id, userId: req.user._id });
            res.json({ message: 'Meeting cancelled successfully', meeting });
        } catch (err) {
            next(err);
        }
    }

    // ══════════════════════════════════════════════════════════
    // 3.5 — LIST EMAIL LOGS (paginated)
    // GET /api/v1/email-logs?page=1&limit=20&status=Sent
    // ══════════════════════════════════════════════════════════
    async getEmailLogs(req, res, next) {
        try {
            const { page, limit, skip } = parsePagination(req.query);
            const filter = { userId: req.user._id };

            if (req.query.status && ['Sent', 'Failed'].includes(req.query.status)) {
                filter.status = req.query.status;
            }

            const [logs, total] = await Promise.all([
                EmailLog.find(filter)
                    .sort({ createdAt: -1 }).skip(skip).limit(limit)
                    .populate('meetingId', 'title date time').lean(),
                EmailLog.countDocuments(filter),
            ]);

            res.json({
                logs,
                pagination: {
                    total, page, limit,
                    pages:   Math.ceil(total / limit),
                    hasNext: page < Math.ceil(total / limit),
                    hasPrev: page > 1,
                },
            });
        } catch (err) {
            next(err);
        }
    }

    // ══════════════════════════════════════════════════════════
    // EXISTING — Stats
    // GET /api/stats
    // ══════════════════════════════════════════════════════════
    async getStats(req, res, next) {
        try {
            const userId = req.user._id;
            const [totalMeetings, totalEmails, emailsSent, emailsFailed, distinctParticipants] = await Promise.all([
                Meeting.countDocuments({ userId }),
                EmailLog.countDocuments({ userId }),
                EmailLog.countDocuments({ userId, status: 'Sent' }),
                EmailLog.countDocuments({ userId, status: 'Failed' }),
                Meeting.distinct('participants', { userId }),
            ]);

            const successRate = totalEmails > 0
                ? Math.round((emailsSent / totalEmails) * 100)
                : 0;

            res.json({
                totalMeetings,
                totalEmails,
                emailsSent,
                emailsFailed,
                successRate,
                activeParticipants: distinctParticipants.length
            });
        } catch (err) {
            next(err);
        }
    }

    // ══════════════════════════════════════════════════════════
    // Health Check
    // ══════════════════════════════════════════════════════════
    healthCheck(req, res) {
        res.json({ status: 'Meeting service operational' });
    }
}

module.exports = new MeetingController();
