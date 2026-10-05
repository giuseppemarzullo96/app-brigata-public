const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sequelize } = require('../config/database');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth.middleware');
const credenziali = require('../utils/credenziali');

/**
 * Registrazione nuovo utente (solo admin; i gestori cucine solo enti fittizi)
 */
const register = async (req, res) => {
  try {
    // I gestori cucine possono creare solo enti fittizi, per assegnare loro uno
    // slot: i campi che danno permessi vengono fissati qui e non presi dal body.
    const soloFittizio = req.user.ruolo === 'gestore_cucine' && req.body.fittizio === true;
    if (req.user.ruolo !== 'admin' && !soloFittizio) {
      return res.status(403).json({ error: 'Solo gli admin possono registrare nuovi utenti' });
    }

    const {
      email,
      nome,
      cognome,
      telefono,
      categoria_socio,
      ruolo,
      tipo_persona,
      ragione_sociale,
      partita_iva,
      fittizio
    } = soloFittizio
      ? {
          ...req.body,
          nome: '',
          cognome: '',
          telefono: null,
          categoria_socio: 'esterno',
          ruolo: 'esterno',
          tipo_persona: 'giuridica',
          partita_iva: null,
          fittizio: true
        }
      : req.body;

    // Un ente fittizio non accede: niente indirizzi veri, che permetterebbero
    // di recuperare la password ed entrare.
    if (soloFittizio && !/@fittizio\.labrigataodv\.it$/.test(email || '')) {
      return res.status(400).json({ error: 'Email non valida per un ente fittizio' });
    }

    // La password provvisoria la genera l'app e arriva al socio con il
    // messaggio di benvenuto. Chi la passa ancora (versioni vecchie dell'app)
    // la vede usata.
    const password = req.body.password || credenziali.generaPassword();

    // Validazione: per le persone giuridiche (enti) la ragione sociale sostituisce nome/cognome
    if (tipo_persona === 'giuridica') {
      if (!email || !ragione_sociale || !categoria_socio) {
        return res.status(400).json({ error: 'Campi obbligatori mancanti' });
      }
    } else if (!email || !nome || !cognome || !categoria_socio) {
      return res.status(400).json({ error: 'Campi obbligatori mancanti' });
    }

    // Verifica email già esistente
    const [existingUser] = await sequelize.query(
      'SELECT id FROM users WHERE email = :email',
      {
        replacements: { email },
        type: sequelize.QueryTypes.SELECT
      }
    );

    if (existingUser) {
      return res.status(400).json({ error: 'Email già registrata' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Inserimento utente
    const [result] = await sequelize.query(
      `INSERT INTO users (
        email, password_hash, nome, cognome, telefono, categoria_socio,
        ruolo, tipo_persona, ragione_sociale, partita_iva, fittizio, created_by
      ) VALUES (
        :email, :passwordHash, :nome, :cognome, :telefono, :categoriaSocio,
        :ruolo, :tipoPersona, :ragioneSociale, :partitaIva, :fittizio, :createdBy
      ) RETURNING id, email, nome, cognome, ruolo, categoria_socio`,
      {
        replacements: {
          email,
          passwordHash,
          nome: nome || '',
          cognome: cognome || '',
          telefono: telefono || null,
          categoriaSocio: categoria_socio,
          ruolo: ruolo || 'socio_ordinario',
          tipoPersona: tipo_persona || 'fisica',
          ragioneSociale: ragione_sociale || null,
          partitaIva: partita_iva || null,
          fittizio: !!fittizio,
          createdBy: req.user.id
        },
        type: sequelize.QueryTypes.INSERT
      }
    );

    logger.info(`Nuovo utente registrato: ${email} da ${req.user.email}`);

    // Gli enti fittizi non accedono: nessun messaggio.
    const inviati = fittizio
      ? null
      : await credenziali.inviaCredenziali({ email, nome, ragione_sociale, telefono }, password);

    res.status(201).json({
      message: 'Utente registrato con successo',
      user: result[0],
      credenziali: inviati
    });
  } catch (error) {
    logger.error('Errore registrazione:', error);
    res.status(500).json({ error: 'Errore durante la registrazione' });
  }
};

/**
 * Login
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e password obbligatorie' });
    }

    // Recupera utente
    const [user] = await sequelize.query(
      `SELECT id, email, password_hash, nome, cognome, ruolo, categoria_socio, attivo, archiviato, sospeso
       FROM users 
       WHERE email = :email`,
      {
        replacements: { email },
        type: sequelize.QueryTypes.SELECT
      }
    );

    if (!user) {
      return res.status(401).json({ error: 'Credenziali non valide' });
    }

    if (!user.attivo || user.archiviato) {
      return res.status(401).json({ error: 'Account non attivo o archiviato' });
    }

    // Controlla se l'utente è sospeso
    if (user.sospeso) {
      return res.status(403).json({ 
        error: 'Il tuo stato di socio è stato sospeso o revocato. Contatta la mail labrigatasalerno@gmail.com per ulteriori informazioni.',
        sospeso: true 
      });
    }

    // Verifica password
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      // Log tentativo login fallito
      await sequelize.query(
        `INSERT INTO audit_log (user_id, azione, dettagli, ip_address, user_agent)
         VALUES (:userId, 'login_failed', :dettagli, :ip, :userAgent)`,
        {
          replacements: {
            userId: user.id,
            dettagli: JSON.stringify({ email }),
            ip: req.ip || null,
            userAgent: req.get('user-agent') || null
          },
          type: sequelize.QueryTypes.INSERT
        }
      );
      return res.status(401).json({ error: 'Credenziali non valide' });
    }

    // Genera token JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email, ruolo: user.ruolo },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Log login riuscito
    await sequelize.query(
      `INSERT INTO audit_log (user_id, azione, dettagli, ip_address, user_agent)
       VALUES (:userId, 'login_success', :dettagli, :ip, :userAgent)`,
      {
        replacements: {
          userId: user.id,
          dettagli: JSON.stringify({ email }),
          ip: req.ip || null,
          userAgent: req.get('user-agent') || null
        },
        type: sequelize.QueryTypes.INSERT
      }
    );

    res.json({
      message: 'Login effettuato con successo',
      token,
      user: {
        id: user.id,
        email: user.email,
        nome: user.nome,
        cognome: user.cognome,
        ruolo: user.ruolo,
        categoria_socio: user.categoria_socio,
        foto_profilo: user.foto_profilo || null,
        sospeso: user.sospeso || false
      }
    });
  } catch (error) {
    logger.error('Errore login:', error);
    res.status(500).json({ error: 'Errore durante il login' });
  }
};

/**
 * Refresh token (se necessario in futuro)
 */
const refreshToken = async (req, res) => {
  // Implementazione futura se necessario
  res.status(501).json({ error: 'Funzionalità non ancora implementata' });
};

/**
 * Logout
 */
const logout = async (req, res) => {
  // Log logout
  await sequelize.query(
    `INSERT INTO audit_log (user_id, azione, dettagli, ip_address, user_agent)
     VALUES (:userId, 'logout', :dettagli, :ip, :userAgent)`,
    {
      replacements: {
        userId: req.user.id,
        dettagli: JSON.stringify({}),
        ip: req.ip || null,
        userAgent: req.get('user-agent') || null
      },
      type: sequelize.QueryTypes.INSERT
    }
  );

  res.json({ message: 'Logout effettuato con successo' });
};

/**
 * Get current user
 */
const getCurrentUser = async (req, res) => {
  try {
    const [user] = await sequelize.query(
      `SELECT id, email, nome, cognome, telefono, categoria_socio, ruolo, 
              tipo_persona, ragione_sociale, foto_profilo, sospeso, created_at
       FROM users 
       WHERE id = :userId`,
      {
        replacements: { userId: req.user.id },
        type: sequelize.QueryTypes.SELECT
      }
    );

    res.json({ user });
  } catch (error) {
    logger.error('Errore recupero utente:', error);
    res.status(500).json({ error: 'Errore durante il recupero dati utente' });
  }
};

/**
 * Cambio password
 */
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Password corrente e nuova password obbligatorie' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'La nuova password deve essere di almeno 8 caratteri' });
    }

    // Recupera password hash corrente
    const [user] = await sequelize.query(
      'SELECT password_hash FROM users WHERE id = :userId',
      {
        replacements: { userId: req.user.id },
        type: sequelize.QueryTypes.SELECT
      }
    );

    // Verifica password corrente
    const passwordValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Password corrente non corretta' });
    }

    // Hash nuova password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Aggiorna password
    await sequelize.query(
      'UPDATE users SET password_hash = :newPasswordHash, updated_at = CURRENT_TIMESTAMP WHERE id = :userId',
      {
        replacements: { newPasswordHash, userId: req.user.id },
        type: sequelize.QueryTypes.UPDATE
      }
    );

    logger.info(`Password cambiata per utente: ${req.user.email}`);

    res.json({ message: 'Password cambiata con successo' });
  } catch (error) {
    logger.error('Errore cambio password:', error);
    res.status(500).json({ error: 'Errore durante il cambio password' });
  }
};


/**
 * POST /api/v1/auth/change-email
 * Cambio della propria email.
 *
 * L'email e' la credenziale di accesso: cambiarla significa cambiare il modo in
 * cui si entra nell'account. Per questo si richiede la password corrente, come
 * per il cambio password: senza, chi trovasse un telefono sbloccato potrebbe
 * dirottare l'account in due passaggi.
 */
const changeEmail = async (req, res) => {
  try {
    const { nuova_email, password } = req.body;

    if (!nuova_email || !password) {
      return res.status(400).json({ error: 'Nuova email e password sono obbligatorie' });
    }

    // Normalizzazione: il login confronta l'email carattere per carattere,
    // quindi uno spazio o una maiuscola di troppo renderebbe impossibile entrare.
    const email = String(nuova_email).trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return res.status(400).json({ error: 'Indirizzo email non valido' });
    }

    const [user] = await sequelize.query(
      'SELECT id, email, password_hash FROM users WHERE id = :id',
      { replacements: { id: req.user.id }, type: sequelize.QueryTypes.SELECT }
    );

    if (!user) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    const passwordValida = await bcrypt.compare(password, user.password_hash);
    if (!passwordValida) {
      logger.warn(`Cambio email rifiutato per password errata: ${user.email}`);
      return res.status(401).json({ error: 'Password non corretta' });
    }

    if (email === user.email) {
      return res.status(400).json({ error: 'La nuova email coincide con quella attuale' });
    }

    // Confronto senza distinzione di maiuscole: due soci non possono avere
    // indirizzi che differiscono solo per il maiuscolo.
    const [occupata] = await sequelize.query(
      'SELECT id FROM users WHERE LOWER(email) = :email AND id <> :id',
      { replacements: { email, id: user.id }, type: sequelize.QueryTypes.SELECT }
    );

    if (occupata) {
      return res.status(409).json({ error: 'Questa email e\' gia\' associata a un altro account' });
    }

    await sequelize.query(
      `UPDATE users SET email = :email, updated_at = CURRENT_TIMESTAMP, updated_by = :id
        WHERE id = :id`,
      { replacements: { email, id: user.id }, type: sequelize.QueryTypes.UPDATE }
    );

    // Traccia nel libro soci: un cambio di credenziale deve restare ricostruibile.
    await sequelize.query(
      `INSERT INTO user_changelog (user_id, campo_modificato, valore_precedente, valore_nuovo, motivo_modifica, modificato_da)
       VALUES (:userId, 'email', :precedente, :nuova, 'Modifica dal proprio profilo', :userId)`,
      {
        replacements: { userId: user.id, precedente: user.email, nuova: email },
        type: sequelize.QueryTypes.INSERT,
      }
    );

    logger.info(`Email cambiata: ${user.email} -> ${email}`);
    res.json({ message: 'Email aggiornata con successo', email });
  } catch (error) {
    logger.error('Errore cambio email:', error);
    res.status(500).json({ error: 'Errore durante il cambio dell\'email' });
  }
};

/**
 * POST /api/v1/auth/password-dimenticata
 * Manda il link per scegliere una nuova password. Risponde sempre allo
 * stesso modo, che l'email esista o no: non deve servire a scoprire chi e'
 * socio.
 */
const RISPOSTA_DIMENTICATA = {
  message: 'Se l\'email è registrata, riceverai a breve un link per scegliere una nuova password.',
};

const passwordDimenticata = async (req, res) => {
  try {
    const email = String(req.body.email || '').trim();
    if (!email) return res.status(400).json({ error: 'Inserisci la tua email' });

    const [socio] = await sequelize.query(
      `SELECT id, email, nome, ragione_sociale, telefono, password_hash
         FROM users
        WHERE lower(email) = lower(:email)
          AND attivo AND NOT archiviato AND NOT sospeso AND NOT COALESCE(fittizio, false)`,
      { replacements: { email }, type: sequelize.QueryTypes.SELECT }
    );

    if (socio) {
      await credenziali.inviaLinkReset(socio);
      logger.info(`Link di reimpostazione password inviato a ${socio.email}`);
    }
    res.json(RISPOSTA_DIMENTICATA);
  } catch (error) {
    logger.error('Errore password dimenticata:', error);
    res.status(500).json({ error: 'Errore durante l\'invio del link' });
  }
};

/**
 * POST /api/v1/auth/reimposta-password
 * La nuova password, con il gettone arrivato per email o WhatsApp.
 */
const reimpostaPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    const nonValido = () => res.status(400).json({
      error: 'Il link non è più valido: è scaduto o è già stato usato. Chiedine uno nuovo.',
    });

    const id = credenziali.soggettoReset(token);
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return nonValido();

    const [socio] = await sequelize.query(
      `SELECT id, email, password_hash FROM users
        WHERE id = :id AND attivo AND NOT archiviato AND NOT sospeso`,
      { replacements: { id }, type: sequelize.QueryTypes.SELECT }
    );
    if (!socio || !credenziali.gettoneResetValido(token, socio)) return nonValido();

    if (!password || String(password).length < 8) {
      return res.status(400).json({ error: 'La nuova password deve essere di almeno 8 caratteri' });
    }

    await sequelize.query(
      'UPDATE users SET password_hash = :hash, updated_at = CURRENT_TIMESTAMP WHERE id = :id',
      { replacements: { hash: await bcrypt.hash(String(password), 10), id }, type: sequelize.QueryTypes.UPDATE }
    );

    logger.info(`Password reimpostata con il link per: ${socio.email}`);
    res.json({ message: 'Password aggiornata. Ora puoi accedere.' });
  } catch (error) {
    logger.error('Errore reimpostazione password:', error);
    res.status(500).json({ error: 'Errore durante la reimpostazione della password' });
  }
};

module.exports = {
  passwordDimenticata,
  reimpostaPassword,
  register,
  login,
  refreshToken,
  logout,
  getCurrentUser,
  changePassword,
  changeEmail
};

