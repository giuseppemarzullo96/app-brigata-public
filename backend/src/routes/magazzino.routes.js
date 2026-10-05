const express = require('express');
const router = express.Router();
const magazzinoController = require('../controllers/magazzino.controller');
const { authenticate, requireAdmin, auditLog } = require('../middleware/auth.middleware');

router.use(authenticate);

// GET - Lista categorie
router.get('/categorie', magazzinoController.getCategorie);

// GET - Lista beni
router.get('/beni', magazzinoController.getBeni);

// GET - Dettaglio bene
router.get('/beni/:id', magazzinoController.getBeneById);

// POST - Crea bene (solo admin)
router.post('/beni', requireAdmin, auditLog('creazione_bene', 'magazzino'), magazzinoController.createBene);

// PUT - Aggiorna bene (solo admin)
router.put('/beni/:id', requireAdmin, auditLog('modifica_bene', 'magazzino'), magazzinoController.updateBene);

// DELETE - Elimina bene (solo admin)
router.delete('/beni/:id', requireAdmin, auditLog('eliminazione_bene', 'magazzino'), magazzinoController.deleteBene);

// GET - Movimenti bene
router.get('/beni/:id/movimenti', magazzinoController.getMovimenti);

// POST - Registra movimento (solo admin)
router.post('/beni/:id/movimenti', requireAdmin, auditLog('movimento_magazzino', 'magazzino'), magazzinoController.registraMovimento);

// GET - Alert scorte basse
router.get('/alert', magazzinoController.getAlertScorte);

// GET - Lista donazioni
router.get('/donazioni', magazzinoController.getDonazioni);

// POST - Registra donazione (solo admin)
router.post('/donazioni', requireAdmin, auditLog('registrazione_donazione', 'donazione'), magazzinoController.registraDonazione);

module.exports = router;

