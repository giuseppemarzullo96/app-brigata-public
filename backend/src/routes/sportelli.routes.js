const express = require('express');
const router = express.Router();
const sportelliController = require('../controllers/sportelli.controller');
const { authenticate, requireAdmin, auditLog } = require('../middleware/auth.middleware');

router.use(authenticate);

// GET - Lista sportelli
router.get('/', sportelliController.getSportelli);

// GET - Dettaglio sportello
router.get('/:id', sportelliController.getSportelloById);

// POST - Crea sportello (solo admin)
router.post('/', requireAdmin, auditLog('creazione_sportello', 'sportello'), sportelliController.createSportello);

// PUT - Aggiorna sportello (solo admin)
router.put('/:id', requireAdmin, auditLog('modifica_sportello', 'sportello'), sportelliController.updateSportello);

// GET - Lista appuntamenti
router.get('/:id/appuntamenti', sportelliController.getAppuntamenti);

// POST - Crea appuntamento
router.post('/:id/appuntamenti', auditLog('creazione_appuntamento', 'sportello'), sportelliController.createAppuntamento);

// PUT - Aggiorna appuntamento
router.put('/appuntamenti/:id', auditLog('modifica_appuntamento', 'sportello'), sportelliController.updateAppuntamento);

// GET - Lista beneficiari (solo operatori sportello)
router.get('/beneficiari', sportelliController.getBeneficiari);

// POST - Crea beneficiario (solo operatori)
router.post('/beneficiari', auditLog('creazione_beneficiario', 'beneficiario'), sportelliController.createBeneficiario);

// GET - Storico interventi
router.get('/interventi', sportelliController.getInterventi);

// POST - Registra intervento
router.post('/interventi', auditLog('registrazione_intervento', 'sportello'), sportelliController.registraIntervento);

module.exports = router;

