const express = require('express');
const router = express.Router();
const caricheController = require('../controllers/cariche.controller');
const { authenticate, requireAdmin, auditLog } = require('../middleware/auth.middleware');

router.use(authenticate);

// GET - Composizione del Consiglio direttivo (tutti i soci; ?tutte=1 per lo storico)
router.get('/', caricheController.getCariche);

// POST - Nuova carica (solo admin)
router.post('/', requireAdmin, auditLog('creazione_carica', 'carica'), caricheController.createCarica);

// POST - Registra come consiglieri gli eletti di una votazione chiusa (solo admin)
router.post('/da-votazione/:votazioneId', requireAdmin, auditLog('registrazione_eletti', 'carica'), caricheController.registraEletti);

// PUT - Modifica o chiusura di un mandato (solo admin)
router.put('/:id', requireAdmin, auditLog('modifica_carica', 'carica'), caricheController.updateCarica);

// DELETE - Correzione di un inserimento errato (solo admin)
router.delete('/:id', requireAdmin, auditLog('eliminazione_carica', 'carica'), caricheController.deleteCarica);

module.exports = router;
