const express = require('express');
const router = express.Router();
const sondaggiController = require('../controllers/sondaggi.controller');
const { authenticate, requireAdmin, auditLog } = require('../middleware/auth.middleware');

router.use(authenticate);

// GET - Lista sondaggi
router.get('/', sondaggiController.getSondaggi);

// GET - Dettaglio sondaggio
router.get('/:id', sondaggiController.getSondaggioById);

// POST - Crea sondaggio (solo admin)
router.post('/', requireAdmin, auditLog('creazione_sondaggio', 'sondaggio'), sondaggiController.createSondaggio);

// PUT - Aggiorna sondaggio (solo admin)
router.put('/:id', requireAdmin, auditLog('modifica_sondaggio', 'sondaggio'), sondaggiController.updateSondaggio);

// DELETE - Elimina sondaggio (solo admin)
router.delete('/:id', requireAdmin, auditLog('eliminazione_sondaggio', 'sondaggio'), sondaggiController.deleteSondaggio);

// POST - Pubblica sondaggio (solo admin)
router.post('/:id/pubblica', requireAdmin, auditLog('pubblicazione_sondaggio', 'sondaggio'), sondaggiController.pubblicaSondaggio);

// POST - Chiudi sondaggio (solo admin)
router.post('/:id/chiudi', requireAdmin, auditLog('chiusura_sondaggio', 'sondaggio'), sondaggiController.chiudiSondaggio);

// POST - Rispondi a sondaggio
router.post('/:id/rispondi', auditLog('risposta_sondaggio', 'sondaggio'), sondaggiController.rispondiSondaggio);

// GET - Risultati sondaggio
router.get('/:id/risultati', sondaggiController.getRisultati);

// GET - Esporta risultati (CSV/PDF) (solo admin)
router.get('/:id/export', requireAdmin, sondaggiController.exportRisultati);

module.exports = router;

