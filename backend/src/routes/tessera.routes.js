const express = require('express');
const router = express.Router();
const tesseraController = require('../controllers/tessera.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);

// GET - La propria tessera dell'anno in corso e i wallet disponibili
router.get('/', tesseraController.getMia);

// GET - Link per aggiungere la tessera ad Apple Wallet / Google Wallet
router.get('/apple', tesseraController.linkApple);
router.get('/google', tesseraController.linkGoogle);

module.exports = router;
