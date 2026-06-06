'use strict';

const express     = require('express');
const router      = express.Router();
const auth        = require('../../middlewares/auth');
const authorize   = require('../../middlewares/authorize');
const adminController = require('../../controllers/adminController');

// ── Admin-only routes (/api/v1/admin/*) ──────────────────────
router.get('/admin/users',               auth, authorize('admin'), adminController.getAllUsers.bind(adminController));
router.patch('/admin/users/:id/role',    auth, authorize('admin'), adminController.updateUserRole.bind(adminController));
router.patch('/admin/users/:id/disable', auth, authorize('admin'), adminController.disableUser.bind(adminController));
router.get('/admin/audit-logs',          auth, authorize('admin'), adminController.getAuditLogs.bind(adminController));
router.get('/admin/stats',               auth, authorize('admin'), adminController.getSystemStats.bind(adminController));

// ── Manager + Admin routes (/api/v1/team/*) ──────────────────
router.get('/team/meetings', auth, authorize('admin', 'manager'), adminController.getTeamMeetings.bind(adminController));

module.exports = router;
