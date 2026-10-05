const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const { authenticate, requireAdmin } = require('../middleware/auth.middleware');

router.use(authenticate);

// GET - Dashboard principale (statistiche)
router.get('/', dashboardController.getDashboard);

// GET - Statistiche avanzate (solo admin)
router.get('/statistiche', requireAdmin, dashboardController.getStatistiche);

module.exports = router;

