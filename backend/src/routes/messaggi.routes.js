const express = require('express');
const router = express.Router();
const messaggiController = require('../controllers/messaggi.controller');
const { authenticate, requireAdmin, auditLog } = require('../middleware/auth.middleware');
const { uploadMessaggi, uploadFotoGruppo } = require('../middleware/upload.middleware');
const { getChatAttiva } = require('../utils/impostazioni');

router.use(authenticate);

/**
 * Gli amministratori possono spegnere i messaggi interni dalle impostazioni.
 * Il blocco sta qui e non solo nell'interfaccia: chi ha ancora in memoria una
 * versione precedente dell'app, o chiama l'API direttamente, non deve poter
 * scrivere lo stesso.
 *
 * Fa eccezione /non-letti, che l'intestazione di ogni pagina interroga di
 * continuo: a chat spenta risponde zero invece di un errore, cosi' non
 * riempie di rossi le console dei soci per una sezione che e' solo chiusa.
 */
const richiedeChatAttiva = async (req, res, next) => {
  if (await getChatAttiva()) return next();
  return res.status(503).json({
    error: 'I messaggi interni sono temporaneamente disattivati',
    chat_attiva: false,
  });
};

router.get('/non-letti', async (req, res, next) => {
  if (!(await getChatAttiva())) return res.json({ count: 0 });
  return messaggiController.getMessaggiNonLetti(req, res, next);
});

router.use(richiedeChatAttiva);

router.get('/', messaggiController.getMessaggi);
router.get('/conversazioni', messaggiController.getConversazioni);
router.get('/conversazione/:conversazioneId', messaggiController.getConversazione);
router.get('/gruppi/:gruppoId/partecipanti', messaggiController.getPartecipantiGruppo);
router.post('/gruppi', requireAdmin, auditLog('creazione_gruppo', 'gruppo'), messaggiController.creaGruppo);
router.delete('/gruppi/:gruppoId', requireAdmin, auditLog('eliminazione_gruppo', 'gruppo'), messaggiController.eliminaGruppo);
router.post('/gruppi/:gruppoId/foto', uploadFotoGruppo, auditLog('cambio_foto_gruppo', 'gruppo'), messaggiController.cambiaFotoGruppo);
router.post('/gruppi/:gruppoId/partecipanti', auditLog('aggiunta_partecipante', 'gruppo'), messaggiController.aggiungiPartecipante);
router.delete('/gruppi/:gruppoId/partecipanti/:userId', auditLog('rimozione_partecipante', 'gruppo'), messaggiController.rimuoviPartecipante);
router.delete('/conversazione/:conversazioneId/reset', auditLog('reset_chat', 'conversazione'), messaggiController.resettaChat);
router.get('/:id', messaggiController.getMessaggioById);
router.post('/', uploadMessaggi, auditLog('invio_messaggio', 'messaggio'), messaggiController.inviaMessaggio);
router.put('/:id', auditLog('modifica_messaggio', 'messaggio'), messaggiController.modificaMessaggio);
router.delete('/:id', auditLog('eliminazione_messaggio', 'messaggio'), messaggiController.eliminaMessaggio);

module.exports = router;

