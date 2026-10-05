const express = require('express');
const router = express.Router();
const richiesteController = require('../controllers/richieste.controller');
const { authenticate, auditLog } = require('../middleware/auth.middleware');

// POST pubblico (dal sito web)
router.post('/', richiesteController.createRichiesta);

// Tutte le altre route richiedono autenticazione
router.use(authenticate);

router.get('/', richiesteController.getRichieste);
router.get('/:id', richiesteController.getRichiestaById);
router.put('/:id', auditLog('modifica_richiesta', 'richiesta'), richiesteController.updateRichiesta);

module.exports = router;

