const express = require('express');
const router = express.Router();
const chiaviController = require('../controllers/chiavi.controller');
const { authenticate, requireAdmin, auditLog } = require('../middleware/auth.middleware');

// Tutte le route richiedono autenticazione
router.use(authenticate);

// Salva/aggiorna la propria chiave pubblica
router.post(
  '/pubblica',
  auditLog('salvataggio_chiave_pubblica', 'chiave'),
  chiaviController.salvaChiavePubblica
);

// Recupera la chiave pubblica di un utente
router.get('/pubblica/:userId', chiaviController.getChiavePubblica);

// Recupera le chiavi pubbliche di più utenti (per gruppi)
router.get('/pubbliche', chiaviController.getChiaviPubbliche);

// Recupera lista utenti senza chiave pubblica (solo admin)
router.get('/utenti-senza-chiave', requireAdmin, chiaviController.getUtentiSenzaChiave);

// Elimina la propria chiave pubblica
router.delete(
  '/pubblica',
  auditLog('eliminazione_chiave_pubblica', 'chiave'),
  chiaviController.eliminaChiavePubblica
);

// Elimina la chiave pubblica di un utente specifico (solo admin)
router.delete(
  '/pubblica/:userId',
  requireAdmin,
  auditLog('eliminazione_chiave_pubblica_utente', 'chiave'),
  chiaviController.eliminaChiavePubblicaUtente
);

module.exports = router;

