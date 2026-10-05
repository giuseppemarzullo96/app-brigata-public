const express = require('express');
const router = express.Router();
const ricettarioController = require('../controllers/ricettario.controller');
const { authenticate, canGestireCucine, auditLog } = require('../middleware/auth.middleware');

// Tutte le route richiedono autenticazione
router.use(authenticate);

// GET - Lista ricette globali
router.get('/', ricettarioController.getRicettarioGlobale);

// GET - Dettaglio ricetta
router.get('/:id', ricettarioController.getRicettaById);

// POST - Crea nuova ricetta globale (solo admin)
router.post('/', canGestireCucine, auditLog('creazione_ricetta', 'ricettario'), ricettarioController.createRicetta);

// PUT - Aggiorna ricetta (solo admin)
router.put('/:id', canGestireCucine, auditLog('modifica_ricetta', 'ricettario'), ricettarioController.updateRicetta);

// DELETE - Elimina ricetta (solo admin)
router.delete('/:id', canGestireCucine, auditLog('eliminazione_ricetta', 'ricettario'), ricettarioController.deleteRicetta);

// POST - Archivia/disarchivia ricetta (solo admin)
router.post('/:id/archivia', canGestireCucine, auditLog('archiviazione_ricetta', 'ricettario'), ricettarioController.archiviaRicetta);

module.exports = router;

