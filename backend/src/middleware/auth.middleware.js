const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { sequelize } = require('../config/database');

/**
 * Middleware per verificare il token JWT
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token di autenticazione mancante' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Recupera utente dal database
    const [user] = await sequelize.query(
      `SELECT id, email, nome, cognome, ruolo, categoria_socio, attivo, archiviato, sospeso 
       FROM users 
       WHERE id = :userId AND attivo = true AND archiviato = false`,
      {
        replacements: { userId: decoded.userId },
        type: sequelize.QueryTypes.SELECT
      }
    );

    if (!user) {
      return res.status(401).json({ error: 'Utente non trovato o non attivo' });
    }

    // Controlla se l'utente è sospeso
    if (user.sospeso) {
      return res.status(403).json({ 
        error: 'Il tuo stato di socio è stato sospeso o revocato. Contatta la mail labrigatasalerno@gmail.com per ulteriori informazioni.',
        sospeso: true 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Token non valido' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token scaduto' });
    }
    
    logger.error('Errore autenticazione:', error);
    res.status(500).json({ error: 'Errore durante l\'autenticazione' });
  }
};

/**
 * Middleware per verificare permessi basati su ruoli
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Autenticazione richiesta' });
    }

    if (!allowedRoles.includes(req.user.ruolo)) {
      logger.warn(`Accesso negato per ${req.user.email} - Ruolo: ${req.user.ruolo}`);
      return res.status(403).json({ error: 'Accesso negato: permessi insufficienti' });
    }

    next();
  };
};

/**
 * Middleware per verificare se l'utente è admin
 */
const requireAdmin = authorize('admin');

/**
 * Ruolo che amministra le cucine solidali: crea e modifica i turni, assegna gli
 * slot e cura il ricettario, senza pero' accedere al libro soci, alle quote o
 * alle impostazioni. Serve a non dover dare i pieni poteri a chi si occupa solo
 * dell'organizzazione delle cene.
 */
const RUOLO_CUCINE = 'gestore_cucine';

/**
 * Middleware per verificare se l'utente può prenotare o liberare uno slot.
 */
const canManageTurni = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Autenticazione richiesta' });
  }

  const allowedRoles = ['admin', RUOLO_CUCINE, 'socio_volontario'];
  if (!allowedRoles.includes(req.user.ruolo)) {
    return res.status(403).json({ error: 'Accesso negato: solo volontari possono gestire turni' });
  }

  next();
};

/**
 * Middleware per le operazioni di organizzazione delle cucine: creare turni e
 * slot, assegnare qualcuno a uno slot, gestire le ricette.
 */
const canGestireCucine = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Autenticazione richiesta' });
  }

  if (!['admin', RUOLO_CUCINE].includes(req.user.ruolo)) {
    logger.warn(`Accesso negato alle cucine per ${req.user.email} - Ruolo: ${req.user.ruolo}`);
    return res.status(403).json({
      error: 'Accesso negato: riservato agli amministratori e ai gestori delle cucine',
    });
  }

  next();
};

/**
 * Campi che non devono MAI finire nell'audit log.
 * `candidati` e `scheda_bianca` sono il contenuto di una scheda elettorale:
 * registrarli renderebbe il voto riconducibile al singolo socio e vanificherebbe
 * la segretezza su cui si regge il modulo votazioni.
 */
const CAMPI_DA_OSCURARE = [
  'password',
  'password_hash',
  'nuova_password',
  'candidati',
  'scheda_bianca'
];

const oscuraCampiSensibili = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const copia = { ...body };
  CAMPI_DA_OSCURARE.forEach((campo) => {
    if (campo in copia) copia[campo] = '[oscurato]';
  });
  return copia;
};

/**
 * Middleware per logging attività (audit)
 */
const auditLog = (action, entity = null) => {
  return async (req, res, next) => {
    // Esegui la richiesta originale
    const originalSend = res.send;
    res.send = function(data) {
      // Dopo la risposta, logga l'attività
      if (res.statusCode < 400 && req.user) {
        // Estrai l'ID dell'entità da vari possibili parametri
        const entitaId = req.params.id || req.params.conversazioneId || req.params.gruppoId || req.params.turnoId || req.params.sondaggioId || req.params.assembleaId || null;
        
        sequelize.query(
          `INSERT INTO audit_log (user_id, azione, entita, entita_id, dettagli, ip_address, user_agent)
           VALUES (:userId, :azione, :entita, :entitaId, :dettagli, :ip, :userAgent)`,
          {
            replacements: {
              userId: req.user.id,
              azione: action,
              entita: entity,
              entitaId: entitaId,
              dettagli: JSON.stringify({
                method: req.method,
                path: req.path,
                body: req.method !== 'GET' ? oscuraCampiSensibili(req.body) : null
              }),
              // Sequelize rifiuta i valori undefined nelle replacements: senza
              // questi fallback una richiesta priva di User-Agent farebbe
              // fallire in silenzio l'intera scrittura dell'audit log.
              ip: req.ip || null,
              userAgent: req.get('user-agent') || null
            },
            type: sequelize.QueryTypes.INSERT
          }
        ).catch(err => logger.error('Errore audit log:', err));
      }
      return originalSend.call(this, data);
    };
    next();
  };
};

module.exports = {
  authenticate,
  authorize,
  requireAdmin,
  canManageTurni,
  canGestireCucine,
  RUOLO_CUCINE,
  auditLog,
  oscuraCampiSensibili
};

