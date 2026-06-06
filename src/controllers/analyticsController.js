'use strict';

const Meeting  = require('../models/Meeting');
const EmailLog = require('../models/EmailLog');
const logger   = require('../config/logger');

class AnalyticsController {

    // ══════════════════════════════════════════════════════════
    // MEETING TRENDS — meetings per day/week over a period
    // GET /api/v1/analytics/trends?period=30
    // ══════════════════════════════════════════════════════════
    async getMeetingTrends(req, res, next) {
        try {
            const userId = req.user._id;
            const days   = Math.min(365, Math.max(7, parseInt(req.query.period) || 30));
            const since  = new Date();
            since.setDate(since.getDate() - days);

            const trends = await Meeting.aggregate([
                { $match: { userId, createdAt: { $gte: since } } },
                {
                    $group: {
                        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                        count: { $sum: 1 },
                    },
                },
                { $sort: { _id: 1 } },
                { $project: { date: '$_id', count: 1, _id: 0 } },
            ]);

            res.json({ period: days, trends });
        } catch (err) {
            next(err);
        }
    }

    // ══════════════════════════════════════════════════════════
    // BUSIEST HOURS — meetings grouped by hour of day
    // GET /api/v1/analytics/busiest-hours
    // ══════════════════════════════════════════════════════════
    async getBusiestHours(req, res, next) {
        try {
            const userId = req.user._id;

            const hours = await Meeting.aggregate([
                { $match: { userId } },
                {
                    $addFields: {
                        hourNum: {
                            $cond: {
                                if: { $regexMatch: { input: '$time', regex: /^\d{1,2}:\d{2}$/ } },
                                then: { $toInt: { $arrayElemAt: [{ $split: ['$time', ':'] }, 0] } },
                                else: 10,  // default fallback
                            },
                        },
                    },
                },
                {
                    $group: {
                        _id:   '$hourNum',
                        count: { $sum: 1 },
                    },
                },
                { $sort: { _id: 1 } },
                { $project: { hour: '$_id', count: 1, _id: 0 } },
            ]);

            res.json({ hours });
        } catch (err) {
            next(err);
        }
    }

    // ══════════════════════════════════════════════════════════
    // EMAIL STATS — success/failure rates over time
    // GET /api/v1/analytics/email-stats?period=30
    // ══════════════════════════════════════════════════════════
    async getEmailStats(req, res, next) {
        try {
            const userId = req.user._id;
            const days   = Math.min(365, Math.max(7, parseInt(req.query.period) || 30));
            const since  = new Date();
            since.setDate(since.getDate() - days);

            const stats = await EmailLog.aggregate([
                { $match: { userId, createdAt: { $gte: since } } },
                {
                    $group: {
                        _id: {
                            date:   { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                            status: '$status',
                        },
                        count: { $sum: 1 },
                    },
                },
                { $sort: { '_id.date': 1 } },
            ]);

            // Reshape into { date, sent, failed }
            const map = {};
            stats.forEach(s => {
                if (!map[s._id.date]) map[s._id.date] = { date: s._id.date, sent: 0, failed: 0 };
                if (s._id.status === 'Sent')   map[s._id.date].sent   = s.count;
                if (s._id.status === 'Failed') map[s._id.date].failed = s.count;
            });

            res.json({ period: days, emailStats: Object.values(map).sort((a, b) => a.date.localeCompare(b.date)) });
        } catch (err) {
            next(err);
        }
    }

    // ══════════════════════════════════════════════════════════
    // TOP PARTICIPANTS — most frequent meeting participants
    // GET /api/v1/analytics/top-participants?limit=10
    // ══════════════════════════════════════════════════════════
    async getTopParticipants(req, res, next) {
        try {
            const userId = req.user._id;
            const limit  = Math.min(20, Math.max(5, parseInt(req.query.limit) || 10));

            const participants = await Meeting.aggregate([
                { $match: { userId } },
                { $unwind: '$participants' },
                {
                    $group: {
                        _id:   '$participants',
                        count: { $sum: 1 },
                    },
                },
                { $sort: { count: -1 } },
                { $limit: limit },
                { $project: { email: '$_id', count: 1, _id: 0 } },
            ]);

            res.json({ participants });
        } catch (err) {
            next(err);
        }
    }

    // ══════════════════════════════════════════════════════════
    // PLATFORM DISTRIBUTION — meetings grouped by platform
    // GET /api/v1/analytics/platforms
    // ══════════════════════════════════════════════════════════
    async getPlatformDistribution(req, res, next) {
        try {
            const userId = req.user._id;

            const platforms = await Meeting.aggregate([
                { $match: { userId } },
                {
                    $group: {
                        _id:   '$platform',
                        count: { $sum: 1 },
                    },
                },
                { $sort: { count: -1 } },
                { $project: { platform: '$_id', count: 1, _id: 0 } },
            ]);

            res.json({ platforms });
        } catch (err) {
            next(err);
        }
    }

    // ══════════════════════════════════════════════════════════
    // STATUS DISTRIBUTION — meetings by status
    // GET /api/v1/analytics/status
    // ══════════════════════════════════════════════════════════
    async getStatusDistribution(req, res, next) {
        try {
            const userId = req.user._id;

            const statuses = await Meeting.aggregate([
                { $match: { userId } },
                {
                    $group: {
                        _id:   '$status',
                        count: { $sum: 1 },
                    },
                },
                { $sort: { count: -1 } },
                { $project: { status: '$_id', count: 1, _id: 0 } },
            ]);

            res.json({ statuses });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new AnalyticsController();
