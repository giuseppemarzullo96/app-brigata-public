const express = require('express');
const router = express.Router();
const votazioniController = require('../controllers/votazioni.controller');
const { authenticate, requireAdmin, auditLog } = require('../middleware/auth.middleware');

router.use(authenticate);

// GET - Lista votazioni
router.get('/', votazioniController.getVotazioni);

// GET - Dettaglio votazione (senza risultati parziali)
router.get('/:id', votazioniController.getVotazioneById);

// POST - Crea votazione (solo admin)
router.post('/', requireAdmin, auditLog('creazione_votazione', 'votazione'), votazioniController.createVotazione);

// PUT - Modifica votazione, solo in bozza (solo admin)
router.put('/:id', requireAdmin, auditLog('modifica_votazione', 'votazione'), votazioniController.updateVotazione);

// DELETE - Elimina votazione, solo in bozza (solo admin)
router.delete('/:id', requireAdmin, auditLog('eliminazione_votazione', 'votazione'), votazioniController.deleteVotazione);

// POST/DELETE - Gestione candidati, solo in bozza (solo admin)
router.post('/:id/candidati', requireAdmin, auditLog('aggiunta_candidato', 'votazione'), votazioniController.addCandidato);
router.delete('/:id/candidati/:candidatoId', requireAdmin, auditLog('rimozione_candidato', 'votazione'), votazioniController.deleteCandidato);

// POST - Apri le urne: congela l'elettorato (solo admin)
router.post('/:id/apri', requireAdmin, auditLog('apertura_votazione', 'votazione'), votazioniController.apriVotazione);

// POST - Esprimi il voto.
// ATTENZIONE: nessun auditLog su questa rotta. Il middleware serializza req.body
// e finirebbe per registrare, riga per riga, che cosa ha votato ogni socio.
// La tracciabilita' della partecipazione resta garantita da
// aventi_diritto_votazione.ha_votato, che non rivela il contenuto della scheda.
router.post('/:id/vota', votazioniController.vota);

// GET - Affluenza in tempo reale (solo admin): nessun conteggio per candidato
router.get('/:id/affluenza', requireAdmin, votazioniController.getAffluenza);

// POST - Chiudi le urne (solo admin)
router.post('/:id/chiudi', requireAdmin, auditLog('chiusura_votazione', 'votazione'), votazioniController.chiudiVotazione);

// GET - Risultati (solo a urne chiuse)
router.get('/:id/risultati', votazioniController.getRisultati);

// GET - Verbale PDF (solo a urne chiuse)
router.get('/:id/verbale', votazioniController.getVerbale);

// GET/PUT - Dati della seduta e registro presenze per il verbale (solo admin)
router.get('/:id/dati-verbale', requireAdmin, votazioniController.getDatiVerbale);
router.put('/:id/dati-verbale', requireAdmin, auditLog('dati_verbale_votazione', 'votazione'), votazioniController.salvaDatiVerbale);

// GET - Export CSV (solo admin, solo a urne chiuse)
router.get('/:id/export', requireAdmin, votazioniController.exportRisultati);

module.exports = router;
