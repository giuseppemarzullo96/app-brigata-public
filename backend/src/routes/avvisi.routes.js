const express = require('express');
const router = express.Router();
const avvisiController = require('../controllers/avvisi.controller');
const { authenticate, requireAdmin, auditLog } = require('../middleware/auth.middleware');

router.use(authenticate);

// GET - Lista avvisi (filtrati per destinatari)
router.get('/', avvisiController.getAvvisi);

// GET - Dettaglio avviso
router.get('/:id', avvisiController.getAvvisoById);

// POST - Crea avviso (solo admin)
router.post('/', requireAdmin, auditLog('creazione_avviso', 'avviso'), avvisiController.createAvviso);

// PUT - Aggiorna avviso (solo admin)
router.put('/:id', requireAdmin, auditLog('modifica_avviso', 'avviso'), avvisiController.updateAvviso);

// DELETE - Elimina avviso (solo admin)
router.delete('/:id', requireAdmin, auditLog('eliminazione_avviso', 'avviso'), avvisiController.deleteAvviso);

// POST - Pubblica avviso (solo admin)
router.post('/:id/pubblica', requireAdmin, auditLog('pubblicazione_avviso', 'avviso'), avvisiController.pubblicaAvviso);

// POST - Segna avviso come letto
router.post('/:id/segna-letto', auditLog('lettura_avviso', 'avviso'), avvisiController.segnaLetto);

// GET - Lista letture avviso (solo admin)
router.get('/:id/letture', requireAdmin, avvisiController.getLettureAvviso);

module.exports = router;

