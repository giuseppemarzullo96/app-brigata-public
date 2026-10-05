const express = require('express');
const router = express.Router();
const usersController = require('../controllers/users.controller');
const { authenticate, requireAdmin, auditLog } = require('../middleware/auth.middleware');
const { uploadFotoProfilo } = require('../middleware/upload.middleware');

// Tutte le route richiedono autenticazione
router.use(authenticate);

// POST - Invita tutti i soci a pagare la quota dell'anno corrente (solo admin)
router.get('/invita-quote-anno-corrente/anteprima', requireAdmin, usersController.anteprimaQuoteAnnoCorrente);
router.post('/invita-quote-anno-corrente', requireAdmin, auditLog('invita_quote_anno', 'quota'), usersController.inviaQuoteAnnoCorrente);

// GET - Configurazione pubblica PayPal per il frontend (client id, ambiente)
// DEVE stare prima di /:id per non essere interpretata come un id utente
router.get('/paypal/config', usersController.getPayPalConfig);

// GET - Lista utenti/soci (con filtri)
router.get('/', usersController.getUsers);

// GET - Dettaglio utente
router.get('/:id', usersController.getUserById);

// PUT - Aggiorna utente (solo admin o proprio profilo)
router.put('/:id', auditLog('modifica_utente', 'user'), usersController.updateUser);

// DELETE - Archivia utente (solo admin)
router.delete('/:id', requireAdmin, auditLog('archiviazione_utente', 'user'), usersController.archiveUser);

// GET - Storico quote associative
router.get('/:id/quote', usersController.getQuote);

// POST - Aggiungi quota associativa (solo admin)
router.post('/:id/quote', requireAdmin, auditLog('aggiunta_quota', 'quota'), usersController.addQuota);

// POST - Crea quota annuale e prepara pagamento PayPal (utente può pagare la propria quota)
router.post('/:id/quote/crea-e-paga', authenticate, auditLog('crea_quota_pagamento', 'quota'), usersController.creaQuotaEPaga);

// POST - Crea ordine PayPal per quota
router.post('/:id/quote/:quotaId/paypal/create', authenticate, usersController.createPayPalOrder);

// POST - Conferma pagamento PayPal
router.post('/:id/quote/:quotaId/paypal/capture', authenticate, usersController.capturePayPalPayment);

// POST - Utente segnala pagamento effettuato
router.post('/:id/quote/:quotaId/segnala-pagamento', authenticate, auditLog('segnala_pagamento', 'quota'), usersController.segnalaPagamento);

// POST - Admin valida o rifiuta pagamento (solo admin)
router.post('/:id/quote/:quotaId/valida-pagamento', requireAdmin, auditLog('valida_pagamento', 'quota'), usersController.validaPagamento);

// GET - Storico partecipazioni attività
router.get('/:id/partecipazioni', usersController.getPartecipazioni);

// GET - Changelog utente
router.get('/:id/changelog', usersController.getChangelog);

// POST - Nuova password provvisoria al socio, per email e WhatsApp (solo admin)
router.post('/:id/rimanda-credenziali', requireAdmin, auditLog('rimanda_credenziali', 'user'), usersController.rimandaCredenziali);

// PUT - Sospendi/riattiva socio (solo admin)
router.put('/:id/sospendi', requireAdmin, auditLog('sospensione_socio', 'user'), usersController.toggleSospensione);

// POST - Carica foto profilo
router.post('/:id/foto-profilo', uploadFotoProfilo, auditLog('upload_foto_profilo', 'user'), usersController.uploadFotoProfilo);

module.exports = router;

