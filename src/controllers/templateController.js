'use strict';

const MeetingTemplate = require('../models/MeetingTemplate');
const { AppError }    = require('../middlewares/errorHandler');
const logger          = require('../config/logger');

class TemplateController {

    // ══════════════════════════════════════════════════════════
    // CREATE TEMPLATE
    // POST /api/v1/templates
    // ══════════════════════════════════════════════════════════
    async createTemplate(req, res, next) {
        try {
            const { name, defaultTitle, defaultDuration, defaultPlatform, defaultParticipants, defaultTimezone } = req.body;

            if (!name || !name.trim()) {
                return next(new AppError('Template name is required', 400));
            }

            // Limit templates per user
            const count = await MeetingTemplate.countDocuments({ userId: req.user._id });
            if (count >= 20) {
                return next(new AppError('Maximum 20 templates allowed. Please delete some first.', 400));
            }

            const template = await MeetingTemplate.create({
                userId: req.user._id,
                name: name.trim(),
                defaultTitle:        defaultTitle || '',
                defaultDuration:     defaultDuration || '30 minutes',
                defaultPlatform:     defaultPlatform || 'Google Meet',
                defaultParticipants: Array.isArray(defaultParticipants) ? defaultParticipants : [],
                defaultTimezone:     defaultTimezone || req.user.timezone || 'UTC',
            });

            logger.info('Template created', { userId: req.user._id, templateId: template._id });
            res.status(201).json({ message: 'Template created', template });
        } catch (err) {
            next(err);
        }
    }

    // ══════════════════════════════════════════════════════════
    // GET TEMPLATES (user's + global)
    // GET /api/v1/templates
    // ══════════════════════════════════════════════════════════
    async getTemplates(req, res, next) {
        try {
            const templates = await MeetingTemplate.find({
                $or: [
                    { userId: req.user._id },
                    { isGlobal: true },
                ],
            }).sort({ isGlobal: -1, createdAt: -1 }).lean();

            res.json({ templates });
        } catch (err) {
            next(err);
        }
    }

    // ══════════════════════════════════════════════════════════
    // UPDATE TEMPLATE
    // PATCH /api/v1/templates/:id
    // ══════════════════════════════════════════════════════════
    async updateTemplate(req, res, next) {
        try {
            const template = await MeetingTemplate.findOne({
                _id:    req.params.id,
                userId: req.user._id,
            });

            if (!template) return next(new AppError('Template not found', 404));
            if (template.isGlobal && req.user.role !== 'admin') {
                return next(new AppError('Only admins can edit global templates', 403));
            }

            const allowed = ['name', 'defaultTitle', 'defaultDuration', 'defaultPlatform', 'defaultParticipants', 'defaultTimezone'];
            allowed.forEach(field => {
                if (req.body[field] !== undefined) template[field] = req.body[field];
            });

            await template.save();
            logger.info('Template updated', { userId: req.user._id, templateId: template._id });
            res.json({ message: 'Template updated', template });
        } catch (err) {
            next(err);
        }
    }

    // ══════════════════════════════════════════════════════════
    // DELETE TEMPLATE
    // DELETE /api/v1/templates/:id
    // ══════════════════════════════════════════════════════════
    async deleteTemplate(req, res, next) {
        try {
            const template = await MeetingTemplate.findOne({
                _id:    req.params.id,
                userId: req.user._id,
            });

            if (!template) return next(new AppError('Template not found', 404));
            if (template.isGlobal && req.user.role !== 'admin') {
                return next(new AppError('Only admins can delete global templates', 403));
            }

            await MeetingTemplate.findByIdAndDelete(template._id);
            logger.info('Template deleted', { userId: req.user._id, templateId: template._id });
            res.json({ message: 'Template deleted' });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new TemplateController();
