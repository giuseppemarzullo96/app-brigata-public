const express = require('express');
const router = express.Router();
const turniController = require('../controllers/turni.controller');
const sondaggiWhatsappController = require('../controllers/sondaggiWhatsapp.controller');
const { authenticate, canManageTurni, canGestireCucine, auditLog } = require('../middleware/auth.middleware');

// Tutte le route richiedono autenticazione
router.use(authenticate);

// GET - Lista turni (con filtri data)
router.get('/', turniController.getTurni);

// GET - Slot liberi nei prossimi turni (per storie Instagram / promozione) - PRIMA di /:id
router.get('/slot-liberi', turniController.getSlotLiberi);

// POST - Crea nuovo turno (solo admin)
router.post('/', canGestireCucine, auditLog('creazione_turno', 'turno'), turniController.createTurno);

// Route specifiche devono essere PRIMA delle route generiche /:id
// IMPORTANTE: Le route con path più specifici (es. /slot) devono venire PRIMA di quelle generiche (es. /:id/ricettario)

// Sondaggi WhatsApp sugli slot scoperti (solo admin e gestore cucine)
router.get('/:turnoId/sondaggi-whatsapp', canGestireCucine, sondaggiWhatsappController.getSondaggiTurno);
router.post('/:turnoId/sondaggi-whatsapp', canGestireCucine, auditLog('pubblicazione_sondaggi_whatsapp', 'turno'), sondaggiWhatsappController.pubblicaSondaggi);

// POST - Crea slot (solo admin) - DEVE essere prima di /:id/ricettario
router.post('/:turnoId/slot', canGestireCucine, auditLog('creazione_slot', 'slot'), turniController.createSlot);

// POST - Prenota slot (volontari)
router.post('/:turnoId/slot/:slotId/prenota', canManageTurni, auditLog('prenotazione_slot', 'slot'), turniController.prenotaSlot);

// DELETE - Libera slot (volontari o admin)
router.delete('/:turnoId/slot/:slotId/libera', canManageTurni, auditLog('liberazione_slot', 'slot'), turniController.liberaSlot);

// DELETE - Elimina slot (solo admin e gestore cucine, solo se libero)
router.delete('/:turnoId/slot/:slotId', canGestireCucine, auditLog('eliminazione_slot', 'slot'), turniController.deleteSlot);

// POST - Assegna slot manualmente (solo admin)
router.post('/:turnoId/slot/:slotId/assegna', canGestireCucine, auditLog('assegnazione_slot', 'slot'), turniController.assegnaSlot);

// POST - Associa/rimuovi ricetta a slot (solo admin)
router.post('/:turnoId/slot/:slotId/ricetta', canGestireCucine, auditLog('associazione_ricetta', 'slot'), turniController.associaRicettaSlot);

// POST - Duplica slot (solo admin)
router.post('/:turnoId/slot/:slotId/duplica', canGestireCucine, auditLog('duplicazione_slot', 'slot'), turniController.duplicaSlot);

// GET - Ricettario turno
// Middleware per verificare che il path sia effettivamente /ricettario e non /slot
router.get('/:id/ricettario', (req, res, next) => {
  if (req.path.includes('/slot')) {
    return res.status(404).json({ error: 'Route non trovata' });
  }
  next();
}, turniController.getRicettario);

// POST - Crea/aggiorna ricettario (solo admin)
// Middleware per verificare che il path sia effettivamente /ricettario e non /slot
router.post('/:id/ricettario', (req, res, next) => {
  if (req.path.includes('/slot')) {
    return res.status(404).json({ error: 'Route non trovata' });
  }
  next();
}, canGestireCucine, auditLog('modifica_ricettario', 'ricettario'), turniController.saveRicettario);

// GET - Dettaglio turno con slot
router.get('/:id', turniController.getTurnoById);

// PUT - Aggiorna turno (solo admin)
router.put('/:id', canGestireCucine, auditLog('modifica_turno', 'turno'), turniController.updateTurno);

// DELETE - Elimina turno (solo admin)
router.delete('/:id', canGestireCucine, auditLog('eliminazione_turno', 'turno'), turniController.deleteTurno);

module.exports = router;
