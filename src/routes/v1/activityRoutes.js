// ─────────────────────────────────────────────────────────────
// IMPLEMENTATION 4.2 — Activity Routes (v1)
// File: backend/src/routes/v1/activityRoutes.js
// ─────────────────────────────────────────────────────────────

'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../../middlewares/auth');
const activityController = require('../../controllers/activityController');

// GET /api/v1/activity — Unified recent activities
router.get('/activity', auth, activityController.getRecentActivity.bind(activityController));

module.exports = router;
