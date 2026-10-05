const Sentry = require('@sentry/node');
const logger = require('./logger');

/**
 * Raccolta degli errori del backend.
 *
 * Si attiva solo se SENTRY_DSN e' valorizzata: senza, l'app funziona
 * esattamente come prima e non viene inviato nulla da nessuna parte.
 *
 * Regola non negoziabile: verso il raccoglitore non devono uscire dati
 * personali dei soci ne' alcuna informazione sul voto. Per questo il payload
 * viene ripulito prima dell'invio.
 */

// Campi che non devono mai lasciare il server.
// Tutto minuscolo: il confronto avviene su chiave.toLowerCase(), quindi una
// voce in camelCase qui dentro non verrebbe mai riconosciuta.
const DA_RIMUOVERE = [
  'password', 'currentpassword', 'newpassword', 'nuova_email',
  'candidati', 'scheda_bianca',          // contenuto della scheda elettorale
  'email', 'telefono', 'codice_fiscale', 'indirizzo', 'note',
  'token', 'authorization', 'apikey',
];

function ripulisci(oggetto) {
  if (!oggetto || typeof oggetto !== 'object') return oggetto;
  const copia = Array.isArray(oggetto) ? [...oggetto] : { ...oggetto };
  for (const chiave of Object.keys(copia)) {
    if (DA_RIMUOVERE.includes(chiave.toLowerCase())) {
      copia[chiave] = '[rimosso]';
    } else if (copia[chiave] && typeof copia[chiave] === 'object') {
      copia[chiave] = ripulisci(copia[chiave]);
    }
  }
  return copia;
}

let attivo = false;

function inizializza() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    logger.info('Monitoraggio errori non configurato (SENTRY_DSN assente)');
    return false;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'production',
    // Nessuna raccolta di indirizzi IP o dati utente in automatico.
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(evento) {
      if (evento.request) {
        delete evento.request.cookies;
        delete evento.request.headers;
        if (evento.request.data) evento.request.data = ripulisci(evento.request.data);
        // La query string puo' contenere una ricerca per nome.
        delete evento.request.query_string;
      }
      // L'utente si identifica con il solo id: basta a capire quante persone
      // sono state colpite, senza dire chi sono.
      if (evento.user) evento.user = { id: evento.user.id };
      return evento;
    },
  });

  attivo = true;
  logger.info('Monitoraggio errori attivo');
  return true;
}

/** Middleware Express da montare dopo le rotte, prima del gestore di errori. */
function middlewareErrori() {
  return (err, req, res, next) => {
    if (attivo && (!err.status || err.status >= 500)) {
      Sentry.withScope((scope) => {
        if (req.user?.id) scope.setUser({ id: req.user.id });
        scope.setTag('rotta', req.route?.path || req.path);
        Sentry.captureException(err);
      });
    }
    next(err);
  };
}

module.exports = { inizializza, middlewareErrori, ripulisci, DA_RIMUOVERE, Sentry };
