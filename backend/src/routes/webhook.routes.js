const express = require('express');
const router = express.Router();
const sondaggiWhatsappController = require('../controllers/sondaggiWhatsapp.controller');

/**
 * Eventi in arrivo da Evolution API.
 *
 * A differenza di tutto il resto dell'API queste rotte NON passano da
 * `authenticate`: a chiamarle e' un servizio, non una persona con una
 * sessione. Al posto del token di sessione c'e' un segreto nel percorso,
 * confrontato a tempo costante; un percorso sbagliato risponde 404 e non
 * rivela che qui ci sia qualcosa.
 */
router.post('/whatsapp/:token', sondaggiWhatsappController.riceviEvento);

module.exports = router;
