'use strict';

const express  = require('express');
const router   = express.Router();
const auth     = require('../../middlewares/auth');
const templateController = require('../../controllers/templateController');

router.post('/templates',      auth, templateController.createTemplate.bind(templateController));
router.get('/templates',       auth, templateController.getTemplates.bind(templateController));
router.patch('/templates/:id', auth, templateController.updateTemplate.bind(templateController));
router.delete('/templates/:id', auth, templateController.deleteTemplate.bind(templateController));

module.exports = router;
