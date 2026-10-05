const express = require('express');
const router = express.Router();
const calendarioPubblico = require('../controllers/calendarioPubblico.controller');
const tessera = require('../controllers/tessera.controller');

/**
 * Pagine per chi non ha un account. Nessuna autenticazione: al posto della
 * sessione c'e' un codice nel percorso, e un codice sbagliato risponde 404.
 */
router.get('/calendario/:codice', calendarioPubblico.getCalendario);

// Il QR della tessera digitale porta qui, attraverso la pagina dell'app.
router.get('/tessera/:codice', tessera.verifica);

// Il file per Apple Wallet: al posto del codice c'e' un gettone firmato di pochi minuti.
router.get('/tessera-apple/:gettone', tessera.scaricaApple);

module.exports = router;
