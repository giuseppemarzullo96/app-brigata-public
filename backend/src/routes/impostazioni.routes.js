const express = require('express');
const router = express.Router();
const impostazioniController = require('../controllers/impostazioni.controller');
const { authenticate, requireAdmin, auditLog } = require('../middleware/auth.middleware');

router.use(authenticate);

// GET - Impostazioni correnti (ogni socio autenticato: serve a mostrare la quota)
router.get('/', impostazioniController.getImpostazioni);

// Link pubblico del calendario: solo admin, e il codice non passa mai da GET /.
const calendarioPubblico = require('../controllers/calendarioPubblico.controller');
router.get('/calendario-pubblico', requireAdmin, calendarioPubblico.getLink);
router.post('/calendario-pubblico', requireAdmin, auditLog('link_calendario_pubblico', 'impostazione'), calendarioPubblico.rigeneraLink);
router.delete('/calendario-pubblico', requireAdmin, auditLog('link_calendario_pubblico_disattivato', 'impostazione'), calendarioPubblico.disattivaLink);

// Carta intestata di verbali e convocazioni: logo e anteprima
const cartaIntestata = require('../controllers/cartaIntestata.controller');
const { uploadLogoCarta } = require('../middleware/upload.middleware');
router.get('/carta-intestata/logo', cartaIntestata.scaricaLogo);
router.post('/carta-intestata/logo', requireAdmin, (req, res, next) => uploadLogoCarta(req, res, (err) => {
  if (!err) return next();
  const messaggio = err.code === 'LIMIT_FILE_SIZE' ? 'Immagine troppo grande (massimo 2 MB)' : err.message;
  return res.status(400).json({ error: messaggio });
}), auditLog('logo_carta_intestata', 'impostazione'), cartaIntestata.caricaLogo);
router.post('/carta-intestata/anteprima', requireAdmin, cartaIntestata.anteprima);

// GET - Storico delle variazioni (solo admin)
router.get('/:chiave/storico', requireAdmin, impostazioniController.getStorico);

// PUT - Modifica una impostazione (solo admin)
router.put('/:chiave', requireAdmin, auditLog('modifica_impostazione', 'impostazione'), impostazioniController.updateImpostazione);

module.exports = router;
