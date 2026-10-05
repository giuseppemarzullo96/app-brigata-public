const express = require('express');
const router = express.Router();
const assembleeController = require('../controllers/assemblee.controller');
const { authenticate, requireAdmin, auditLog } = require('../middleware/auth.middleware');
const { uploadSingle, uploadAllegatoVerbale } = require('../middleware/upload.middleware');

// Gli errori di multer (tipo o dimensione del file) diventano un 400 leggibile
// invece dell'errore generico del gestore globale.
const conUpload = (middleware) => (req, res, next) => middleware(req, res, (err) => {
  if (!err) return next();
  const messaggio = err.code === 'LIMIT_FILE_SIZE' ? 'File troppo grande (massimo 10 MB)' : err.message;
  return res.status(400).json({ error: messaggio });
});

router.use(authenticate);

// GET - Lista assemblee
router.get('/', assembleeController.getAssemblee);

// GET - Dettaglio assemblea
router.get('/:id', assembleeController.getAssembleaById);

// POST - Crea assemblea (solo admin)
router.post('/', requireAdmin, auditLog('creazione_assemblea', 'assemblea'), assembleeController.createAssemblea);

// PUT - Aggiorna assemblea (solo admin)
router.put('/:id', requireAdmin, auditLog('modifica_assemblea', 'assemblea'), assembleeController.updateAssemblea);

// DELETE - Elimina assemblea (solo admin)
router.delete('/:id', requireAdmin, auditLog('eliminazione_assemblea', 'assemblea'), assembleeController.deleteAssemblea);

// POST - Invia convocazioni (solo admin)
router.post('/:id/invia-convocazioni', requireAdmin, auditLog('invio_convocazioni', 'assemblea'), assembleeController.inviaConvocazioni);

// PUT - Registra presenza (soci)
router.put('/:id/presenza', auditLog('registrazione_presenza', 'assemblea'), assembleeController.registraPresenza);

// GET - Lista presenze
router.get('/:id/presenze', assembleeController.getPresenze);

// GET - Genera l'avviso di convocazione in PDF, da firmare (solo admin)
router.get('/:id/convocazione-pdf', requireAdmin, assembleeController.generaConvocazione);

// GET - Scarica verbale e convocazione caricati (chi puo' vedere l'assemblea)
router.get('/:id/verbale', assembleeController.scaricaVerbale);
router.get('/:id/convocazione', assembleeController.scaricaConvocazione);

// Verbale delle riunioni del Consiglio direttivo: dati (admin) e PDF (consiglieri e admin)
router.get('/:id/dati-verbale-consiglio', requireAdmin, assembleeController.getDatiVerbaleConsiglio);
router.put('/:id/dati-verbale-consiglio', requireAdmin, auditLog('dati_verbale_consiglio', 'assemblea'), assembleeController.salvaDatiVerbaleConsiglio);
router.get('/:id/verbale-consiglio', assembleeController.getVerbaleConsiglio);

// Allegati del verbale: carica ed elimina (admin), scarica (chi vede l'assemblea)
router.post('/:id/allegati', requireAdmin, conUpload(uploadAllegatoVerbale), auditLog('caricamento_allegato_verbale', 'assemblea'), assembleeController.caricaAllegato);
router.get('/:id/allegati/:allegatoId', assembleeController.scaricaAllegato);
router.delete('/:id/allegati/:allegatoId', requireAdmin, auditLog('eliminazione_allegato_verbale', 'assemblea'), assembleeController.eliminaAllegato);

// POST - Carica verbale (solo admin)
router.post('/:id/verbale', requireAdmin, uploadSingle('verbale'), auditLog('caricamento_verbale', 'assemblea'), assembleeController.caricaVerbale);

// POST - Carica convocazione (solo admin)
router.post('/:id/convocazione', requireAdmin, uploadSingle('convocazione'), auditLog('caricamento_convocazione', 'assemblea'), assembleeController.caricaConvocazione);

// GET - Export presenze CSV (solo admin)
router.get('/:id/presenze/export', requireAdmin, assembleeController.exportPresenze);

module.exports = router;

