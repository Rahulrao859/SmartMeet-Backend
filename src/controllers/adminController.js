'use strict';

const User     = require('../models/User');
const Meeting  = require('../models/Meeting');
const EmailLog = require('../models/EmailLog');
const AuditLog = require('../models/AuditLog');
const logger   = require('../config/logger');
const { AppError } = require('../middlewares/errorHandler');

// ── Pagination helper ──────────────────────────────────────────
const parsePagination = (query) => {
    const page  = Math.max(1, parseInt(query.page)  || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit) || 20));
    const skip  = (page - 1) * limit;
    return { page, limit, skip };
};

class AdminController {

    // ══════════════════════════════════════════════════════════
    // GET ALL USERS (admin only)
    // GET /api/v1/admin/users?page=1&limit=20&search=john
    // ══════════════════════════════════════════════════════════
    async getAllUsers(req, res, next) {
        try {
            const { page, limit, skip } = parsePagination(req.query);
            const filter = {};

            if (req.query.search) {
                const q = req.query.search.trim();
                filter.$or = [
                    { name:  { $regex: q, $options: 'i' } },
                    { email: { $regex: q, $options: 'i' } },
                ];
            }
            if (req.query.role && ['admin', 'manager', 'member'].includes(req.query.role)) {
                filter.role = req.query.role;
            }

            const [users, total] = await Promise.all([
                User.find(filter)
                    .select('name email role isVerified avatar timezone createdAt')
                    .sort({ createdAt: -1 })
                    .skip(skip).limit(limit).lean(),
                User.countDocuments(filter),
            ]);

            res.json({
                users,
                pagination: {
                    total, page, limit,
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
    // UPDATE USER ROLE (admin only)
    // PATCH /api/v1/admin/users/:id/role
    // Body: { role: 'manager' }
    // ══════════════════════════════════════════════════════════
    async updateUserRole(req, res, next) {
        try {
            const { role } = req.body;
            if (!role || !['admin', 'manager', 'member'].includes(role)) {
                return next(new AppError('Invalid role. Must be admin, manager, or member.', 400));
            }

            const user = await User.findById(req.params.id);
            if (!user) return next(new AppError('User not found', 404));

            // Prevent self-demotion
            if (user._id.toString() === req.user._id.toString() && role !== 'admin') {
                return next(new AppError('You cannot demote your own account.', 400));
            }

            const oldRole = user.role;
            user.role = role;
            await user.save({ validateBeforeSave: false });

            // Audit log
            await AuditLog.create({
                userId:     req.user._id,
                action:     'user.role_changed',
                resource:   'user',
                resourceId: user._id,
                details:    { targetUser: user.email, oldRole, newRole: role },
                ipAddress:  req.ip || '',
                userAgent:  req.get('User-Agent') || '',
            });

            logger.info('User role updated', { adminId: req.user._id, targetUserId: user._id, oldRole, newRole: role });

            res.json({ message: `User role updated to ${role}`, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
        } catch (err) {
            next(err);
        }
    }

    // ══════════════════════════════════════════════════════════
    // DISABLE USER (admin only)
    // PATCH /api/v1/admin/users/:id/disable
    // ══════════════════════════════════════════════════════════
    async disableUser(req, res, next) {
        try {
            const user = await User.findById(req.params.id);
            if (!user) return next(new AppError('User not found', 404));

            if (user._id.toString() === req.user._id.toString()) {
                return next(new AppError('You cannot disable your own account.', 400));
            }

            user.isVerified = false; // Disabling by un-verifying
            await user.save({ validateBeforeSave: false });

            await AuditLog.create({
                userId:     req.user._id,
                action:     'user.disabled',
                resource:   'user',
                resourceId: user._id,
                details:    { targetUser: user.email },
                ipAddress:  req.ip || '',
                userAgent:  req.get('User-Agent') || '',
            });

            logger.info('User disabled', { adminId: req.user._id, targetUserId: user._id });
            res.json({ message: 'User account disabled' });
        } catch (err) {
            next(err);
        }
    }

    // ══════════════════════════════════════════════════════════
    // GET AUDIT LOGS (admin only)
    // GET /api/v1/admin/audit-logs?page=1&limit=20&action=user.login
    // ══════════════════════════════════════════════════════════
    async getAuditLogs(req, res, next) {
        try {
            const { page, limit, skip } = parsePagination(req.query);
            const filter = {};

            if (req.query.action) filter.action = req.query.action;
            if (req.query.userId) filter.userId = req.query.userId;

            const [logs, total] = await Promise.all([
                AuditLog.find(filter)
                    .populate('userId', 'name email')
                    .sort({ createdAt: -1 })
                    .skip(skip).limit(limit).lean(),
                AuditLog.countDocuments(filter),
            ]);

            res.json({
                logs,
                pagination: {
                    total, page, limit,
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
    // SYSTEM STATS (admin only)
    // GET /api/v1/admin/stats
    // ══════════════════════════════════════════════════════════
    async getSystemStats(req, res, next) {
        try {
            const [totalUsers, totalMeetings, totalEmails, emailsSent, emailsFailed, roleDistribution] = await Promise.all([
                User.countDocuments(),
                Meeting.countDocuments(),
                EmailLog.countDocuments(),
                EmailLog.countDocuments({ status: 'Sent' }),
                EmailLog.countDocuments({ status: 'Failed' }),
                User.aggregate([
                    { $group: { _id: '$role', count: { $sum: 1 } } },
                ]),
            ]);

            const roles = {};
            roleDistribution.forEach(r => { roles[r._id || 'member'] = r.count; });

            res.json({
                totalUsers,
                totalMeetings,
                totalEmails,
                emailsSent,
                emailsFailed,
                emailSuccessRate: totalEmails > 0 ? Math.round((emailsSent / totalEmails) * 100) : 0,
                roleDistribution: roles,
            });
        } catch (err) {
            next(err);
        }
    }

    // ══════════════════════════════════════════════════════════
    // TEAM MEETINGS (manager + admin)
    // GET /api/v1/team/meetings?page=1&limit=20
    // ══════════════════════════════════════════════════════════
    async getTeamMeetings(req, res, next) {
        try {
            const { page, limit, skip } = parsePagination(req.query);

            // Managers see all member meetings; admins see everything
            const [meetings, total] = await Promise.all([
                Meeting.find()
                    .populate('userId', 'name email role')
                    .sort({ createdAt: -1 })
                    .skip(skip).limit(limit).lean(),
                Meeting.countDocuments(),
            ]);

            res.json({
                meetings,
                pagination: {
                    total, page, limit,
                    pages: Math.ceil(total / limit),
                    hasNext: page < Math.ceil(total / limit),
                    hasPrev: page > 1,
                },
            });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new AdminController();
