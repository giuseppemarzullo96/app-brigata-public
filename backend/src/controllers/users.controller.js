const { sequelize } = require('../config/database');
const logger = require('../utils/logger');
const { linkProfilo, rigaWhatsapp, rigaEmail } = require('../utils/link');
const { getQuotaAnnuale } = require('../utils/impostazioni');
const { sendMail } = require('../utils/mailer');
const { sendWhatsApp } = require('../utils/whatsapp');
const paypal = require('../utils/paypal');
const bcrypt = require('bcryptjs');
const credenziali = require('../utils/credenziali');

/**
 * GET /api/v1/users
 * Lista utenti con filtri
 */
const getUsers = async (req, res) => {
  try {
    const { categoria, ruolo, attivo, search, fittizio } = req.query;
    const isAdmin = req.user.ruolo === 'admin';

    // L'elenco serve anche ai non admin, per i menu a tendina: scelta dei
    // candidati, assegnazione di uno slot, avvio di una conversazione. A loro
    // bastano nome e foto. Email, telefono, indirizzo e le note interne
    // dell'amministratore restano fuori: sono dati personali di terzi, e il
    // libro soci non deve essere scaricabile da chiunque abbia un account.
    const CAMPI_ADMIN = `id, email, nome, cognome, telefono, indirizzo, citta, cap,
        categoria_socio, ruolo, tipo_persona, ragione_sociale, fittizio, note,
        attivo, archiviato, sospeso, foto_profilo, created_at`;
    // attivo e' sempre true in questa proiezione, visto che i non admin
    // ricevono solo utenti in forza: viene incluso perche' l'interfaccia ci
    // filtra sopra (elenco chat, assegnazione di uno slot) e senza il campo
    // quei menu a tendina restano vuoti.
    const CAMPI_SOCIO = `id, nome, cognome, ragione_sociale, tipo_persona,
        categoria_socio, ruolo, fittizio, foto_profilo, attivo`;

    // Per l'admin, lo stato della quota dell'anno in corso di ogni socio: la
    // lista dei soci deve dire a colpo d'occhio chi ha pagato e chi no.
    //   pagata        la quota risulta pagata
    //   da_verificare il socio ha segnalato il pagamento, manca la conferma
    //   da_pagare     la quota c'e' ma non e' pagata (anche se rifiutata)
    //   NULL          per quest'anno la quota non e' mai stata creata
    const annoQuota = new Date().getFullYear();
    const STATO_QUOTA = `(SELECT CASE
          WHEN q.pagata THEN 'pagata'
          WHEN q.stato_validazione = 'in_attesa' THEN 'da_verificare'
          ELSE 'da_pagare' END
        FROM quote_associative q
       WHERE q.user_id = users.id AND q.anno = :annoQuota
       ORDER BY q.pagata DESC LIMIT 1) AS quota_stato`;

    let query = `SELECT ${isAdmin ? `${CAMPI_ADMIN}, ${STATO_QUOTA}` : CAMPI_SOCIO} FROM users WHERE 1=1`;
    const replacements = isAdmin ? { annoQuota } : {};

    // Chi non e' admin vede solo le persone realmente in forza: un socio
    // sospeso o archiviato non deve comparire nei menu di scelta.
    if (!isAdmin) {
      query += ' AND attivo = true AND archiviato = false AND COALESCE(sospeso, false) = false';
    }

    if (categoria) {
      query += ' AND categoria_socio = :categoria';
      replacements.categoria = categoria;
    }

    if (ruolo) {
      query += ' AND ruolo = :ruolo';
      replacements.ruolo = ruolo;
    }

    if (attivo !== undefined) {
      query += ' AND attivo = :attivo';
      replacements.attivo = attivo === 'true';
    }

    if (fittizio !== undefined) {
      query += ' AND fittizio = :fittizio';
      replacements.fittizio = fittizio === 'true';
    }

    if (search) {
      query += isAdmin
        ? ' AND (nome ILIKE :search OR cognome ILIKE :search OR email ILIKE :search)'
        : ' AND (nome ILIKE :search OR cognome ILIKE :search)';
      replacements.search = `%${search}%`;
    }
    
    query += ' ORDER BY cognome, nome';
    
    const users = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });
    
    res.json(isAdmin ? { users, annoQuota } : { users });
  } catch (error) {
    logger.error('Errore recupero utenti:', error);
    res.status(500).json({ error: 'Errore durante il recupero degli utenti' });
  }
};

/**
 * GET /api/v1/users/:id
 * Dettaglio utente
 */
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verifica permessi (solo admin o proprio profilo)
    if (req.user.id !== id && req.user.ruolo !== 'admin') {
      return res.status(403).json({ error: 'Accesso negato' });
    }
    
    const [user] = await sequelize.query(
      `SELECT id, email, nome, cognome, telefono, data_nascita, codice_fiscale,
              indirizzo, citta, cap, categoria_socio, ruolo, tipo_persona,
              ragione_sociale, partita_iva, fittizio, attivo, archiviato, sospeso, foto_profilo, note, numero_tessera, created_at
       FROM users
       WHERE id = :id`,
      {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (!user) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }
    
    res.json({ user });
  } catch (error) {
    logger.error('Errore recupero utente:', error);
    res.status(500).json({ error: 'Errore durante il recupero dell\'utente' });
  }
};

/**
 * PUT /api/v1/users/:id
 * Aggiorna utente
 */
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verifica permessi
    if (req.user.id !== id && req.user.ruolo !== 'admin') {
      return res.status(403).json({ error: 'Accesso negato' });
    }
    
    const [user] = await sequelize.query(
      'SELECT * FROM users WHERE id = :id',
      {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (!user) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }
    
    const {
      nome, cognome, telefono, data_nascita, indirizzo, citta, cap,
      categoria_socio, ruolo, note, ragione_sociale
    } = req.body;

    // Solo admin può modificare ruolo e categoria
    const updateFields = {};
    if (nome) updateFields.nome = nome;
    if (cognome) updateFields.cognome = cognome;
    if (telefono !== undefined) updateFields.telefono = telefono;
    if (data_nascita) updateFields.data_nascita = data_nascita;
    if (indirizzo !== undefined) updateFields.indirizzo = indirizzo;
    if (citta) updateFields.citta = citta;
    if (cap) updateFields.cap = cap;
    // Le note sono le annotazioni dell'amministratore sul socio: restano sue.
    if (note !== undefined && req.user.ruolo === 'admin') updateFields.note = note;
    if (ragione_sociale !== undefined) updateFields.ragione_sociale = ragione_sociale;
    
    if (req.user.ruolo === 'admin') {
      if (categoria_socio) updateFields.categoria_socio = categoria_socio;
      if (ruolo) updateFields.ruolo = ruolo;
    }
    
    // Costruisci query dinamica
    const setClause = Object.keys(updateFields).map(key => `${key} = :${key}`).join(', ');
    if (setClause) {
      await sequelize.query(
        `UPDATE users SET ${setClause}, updated_at = CURRENT_TIMESTAMP, updated_by = :updatedBy WHERE id = :id`,
        {
          replacements: { ...updateFields, updatedBy: req.user.id, id },
          type: sequelize.QueryTypes.UPDATE
        }
      );
      
      // Changelog di ruolo e categoria: sono le due modifiche che cambiano
      // cosa una persona puo' fare, e nel libro soci devono restare tracciate.
      // Vanno registrate entrambe e in modo indipendente: inviandole insieme,
      // prima ne finiva a verbale una sola. E una modifica che non cambia
      // nulla non merita una riga.
      const modificheDaTracciare = [
        ['categoria_socio', user.categoria_socio, categoria_socio],
        ['ruolo', user.ruolo, ruolo],
      ].filter(([, precedente, nuovo]) => nuovo && nuovo !== precedente);

      for (const [campo, precedente, nuovo] of modificheDaTracciare) {
        await sequelize.query(
          `INSERT INTO user_changelog (user_id, campo_modificato, valore_precedente, valore_nuovo, motivo_modifica, modificato_da)
           VALUES (:userId, :campo, :valorePrec, :valoreNuovo, :motivo, :modificatoDa)`,
          {
            replacements: {
              userId: id,
              campo,
              valorePrec: precedente ?? null,
              valoreNuovo: nuovo,
              motivo: 'Aggiornamento da sistema',
              modificatoDa: req.user.id
            },
            type: sequelize.QueryTypes.INSERT
          }
        );
      }
    }
    
    res.json({ message: 'Utente aggiornato con successo' });
  } catch (error) {
    logger.error('Errore aggiornamento utente:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento dell\'utente' });
  }
};

/**
 * DELETE /api/v1/users/:id
 * Archivia utente (soft delete)
 */
const archiveUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (id === req.user.id) {
      return res.status(400).json({ error: 'Non puoi archiviare il tuo stesso account' });
    }
    
    await sequelize.query(
      `UPDATE users 
       SET archiviato = true, data_archiviazione = CURRENT_TIMESTAMP, attivo = false, updated_by = :updatedBy
       WHERE id = :id`,
      {
        replacements: { id, updatedBy: req.user.id },
        type: sequelize.QueryTypes.UPDATE
      }
    );
    
    res.json({ message: 'Utente archiviato con successo' });
  } catch (error) {
    logger.error('Errore archiviazione utente:', error);
    res.status(500).json({ error: 'Errore durante l\'archiviazione dell\'utente' });
  }
};

/**
 * GET /api/v1/users/:id/quote
 * Storico quote associative
 */
const getQuote = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verifica permessi
    if (req.user.id !== id && req.user.ruolo !== 'admin') {
      return res.status(403).json({ error: 'Accesso negato' });
    }
    
    const quote = await sequelize.query(
      `SELECT q.*, v.nome as validatore_nome, v.cognome as validatore_cognome
       FROM quote_associative q
       LEFT JOIN users v ON q.validato_da = v.id
       WHERE q.user_id = :userId 
       ORDER BY q.anno DESC`,
      {
        replacements: { userId: id },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    res.json({ quote });
  } catch (error) {
    logger.error('Errore recupero quote:', error);
    res.status(500).json({ error: 'Errore durante il recupero delle quote' });
  }
};

/**
 * POST /api/v1/users/:id/quote
 * Aggiungi quota associativa
 */
const addQuota = async (req, res) => {
  try {
    const { id } = req.params;
    const { anno, importo, data_pagamento, metodo_pagamento, riferimento_pagamento, note } = req.body;
    
    if (!anno || !importo) {
      return res.status(400).json({ error: 'Anno e importo obbligatori' });
    }
    
    // Verifica quota già esistente
    const [existing] = await sequelize.query(
      'SELECT id FROM quote_associative WHERE user_id = :userId AND anno = :anno',
      {
        replacements: { userId: id, anno },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (existing) {
      return res.status(400).json({ error: 'Quota già esistente per questo anno' });
    }
    
    const result = await sequelize.query(
      `INSERT INTO quote_associative (user_id, anno, importo, data_pagamento, metodo_pagamento, riferimento_pagamento, note, pagata)
       VALUES (:userId, :anno, :importo, :dataPagamento, :metodoPagamento, :riferimentoPagamento, :note, :pagata)
       RETURNING *`,
      {
        replacements: {
          userId: id,
          anno,
          importo,
          dataPagamento: data_pagamento || null,
          metodoPagamento: metodo_pagamento || null,
          riferimentoPagamento: riferimento_pagamento || null,
          note: note || null,
          pagata: !!data_pagamento
        },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    res.status(201).json({ quota: result[0] });
  } catch (error) {
    logger.error('Errore aggiunta quota:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiunta della quota' });
  }
};

/**
 * POST /api/v1/users/:id/quote/crea-e-paga
 * Crea quota annuale di 15€ se non esiste e restituisce i dati per il pagamento
 */
const creaQuotaEPaga = async (req, res) => {
  try {
    const { id } = req.params;
    const annoCorrente = new Date().getFullYear();
    
    // Verifica permessi (solo admin o proprio profilo)
    if (req.user.id !== id && req.user.ruolo !== 'admin') {
      return res.status(403).json({ error: 'Accesso negato' });
    }
    
    // Verifica se la quota per l'anno corrente esiste già
    const [quotaEsistente] = await sequelize.query(
      'SELECT * FROM quote_associative WHERE user_id = :userId AND anno = :anno',
      {
        replacements: { userId: id, anno: annoCorrente },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    let quota;
    if (quotaEsistente) {
      quota = quotaEsistente;
      if (quota.pagata) {
        return res.status(400).json({ error: 'La quota per questo anno è già stata pagata' });
      }
    } else {
      // Importo deciso dagli admin nelle impostazioni
      const importoQuota = await getQuotaAnnuale();
      const result = await sequelize.query(
        `INSERT INTO quote_associative (user_id, anno, importo, pagata)
         VALUES (:userId, :anno, :importo, false)
         RETURNING *`,
        {
          replacements: {
            userId: id,
            anno: annoCorrente,
            importo: importoQuota
          },
          type: sequelize.QueryTypes.SELECT
        }
      );
      quota = result[0];
    }
    
    if (!paypal.isConfigured()) {
      return res.status(503).json({ error: 'Pagamenti PayPal non configurati sul server' });
    }

    const ordine = await paypal.createOrder({
      importo: quota.importo,
      descrizione: `Quota associativa ${annoCorrente} - La Brigata ODV`,
      riferimento: quota.id,
    });

    // Salva order ID nella quota
    await sequelize.query(
      'UPDATE quote_associative SET paypal_order_id = :orderId WHERE id = :quotaId',
      {
        replacements: { orderId: ordine.id, quotaId: quota.id },
        type: sequelize.QueryTypes.UPDATE
      }
    );

    res.json({
      quota: quota,
      orderId: ordine.id,
      amount: parseFloat(quota.importo),
      currency: 'EUR',
      description: `Quota associativa ${annoCorrente} - La Brigata ODV`
    });
  } catch (error) {
    logger.error('Errore creazione quota e pagamento:', error);
    res.status(500).json({ error: 'Errore durante la creazione della quota e del pagamento' });
  }
};

/**
 * GET /api/v1/users/paypal/config
 * Client ID pubblico e ambiente PayPal, per inizializzare l'SDK lato frontend.
 */
const getPayPalConfig = async (req, res) => {
  res.json({
    configurato: paypal.isConfigured(),
    clientId: process.env.PAYPAL_CLIENT_ID || null,
    ambiente: process.env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox',
  });
};

/**
 * POST /api/v1/users/:id/quote/:quotaId/paypal/create
 * Crea ordine PayPal per quota
 */
const createPayPalOrder = async (req, res) => {
  try {
    const { id, quotaId } = req.params;
    
    // Verifica quota esiste e appartiene all'utente
    const [quota] = await sequelize.query(
      'SELECT * FROM quote_associative WHERE id = :quotaId AND user_id = :userId',
      {
        replacements: { quotaId, userId: id },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (!quota) {
      return res.status(404).json({ error: 'Quota non trovata' });
    }
    
    if (quota.pagata) {
      return res.status(400).json({ error: 'Quota già pagata' });
    }

    if (!paypal.isConfigured()) {
      return res.status(503).json({ error: 'Pagamenti PayPal non configurati sul server' });
    }

    const ordine = await paypal.createOrder({
      importo: quota.importo,
      descrizione: `Quota associativa ${quota.anno} - La Brigata ODV`,
      riferimento: quotaId,
    });

    // Salva order ID nella quota per poterlo verificare in fase di capture
    await sequelize.query(
      'UPDATE quote_associative SET paypal_order_id = :orderId WHERE id = :quotaId',
      {
        replacements: { orderId: ordine.id, quotaId },
        type: sequelize.QueryTypes.UPDATE
      }
    );

    logger.info(`Ordine PayPal ${ordine.id} creato per quota ${quotaId}`);

    res.json({
      orderId: ordine.id,
      amount: parseFloat(quota.importo),
      currency: 'EUR',
      description: `Quota associativa ${quota.anno} - La Brigata ODV`
    });
  } catch (error) {
    logger.error('Errore creazione ordine PayPal:', error);
    res.status(500).json({ error: 'Errore durante la creazione dell\'ordine PayPal' });
  }
};

/**
 * POST /api/v1/users/:id/quote/:quotaId/paypal/capture
 * Conferma pagamento PayPal
 */
const capturePayPalPayment = async (req, res) => {
  try {
    const { id, quotaId } = req.params;
    const { orderId } = req.body;

    // Verifica quota esiste e appartiene all'utente
    const [quota] = await sequelize.query(
      'SELECT * FROM quote_associative WHERE id = :quotaId AND user_id = :userId',
      {
        replacements: { quotaId, userId: id },
        type: sequelize.QueryTypes.SELECT
      }
    );

    if (!quota) {
      return res.status(404).json({ error: 'Quota non trovata' });
    }

    if (quota.pagata) {
      return res.json({ message: 'Quota già registrata come pagata' });
    }

    // L'ordine deve essere quello creato dal server per questa quota: impedisce
    // di far passare per pagata una quota indicando un ordine arbitrario.
    if (!orderId || quota.paypal_order_id !== orderId) {
      return res.status(400).json({ error: 'Order ID non corrispondente' });
    }

    if (!paypal.isConfigured()) {
      return res.status(503).json({ error: 'Pagamenti PayPal non configurati sul server' });
    }

    // Incassa l'ordine. Se era già stato incassato PayPal risponde con errore,
    // quindi in quel caso ricadiamo sulla lettura dello stato dell'ordine.
    let ordine;
    try {
      ordine = await paypal.captureOrder(orderId);
    } catch (err) {
      logger.warn(`Capture PayPal fallita per ordine ${orderId}, rileggo lo stato: ${err.message}`);
      ordine = await paypal.getOrder(orderId);
    }

    if (ordine.status !== 'COMPLETED') {
      logger.error(`Ordine PayPal ${orderId} non completato (stato: ${ordine.status})`);
      return res.status(400).json({ error: 'Il pagamento non risulta completato' });
    }

    // Verifica che l'importo incassato coincida con quello della quota.
    const capture = ordine.purchase_units?.[0]?.payments?.captures?.[0];
    const importoIncassato = parseFloat(capture?.amount?.value ?? 'NaN');
    const importoAtteso = parseFloat(quota.importo);

    if (!Number.isFinite(importoIncassato) || importoIncassato < importoAtteso) {
      logger.error(`Importo PayPal non valido per quota ${quotaId}: incassato ${importoIncassato}, atteso ${importoAtteso}`);
      return res.status(400).json({ error: 'Importo del pagamento non corrispondente' });
    }

    await sequelize.query(
      `UPDATE quote_associative
       SET pagata = true,
           data_pagamento = CURRENT_DATE,
           metodo_pagamento = 'paypal',
           paypal_payment_id = :paymentId,
           riferimento_pagamento = :orderId,
           stato_validazione = 'validato',
           data_validazione = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :quotaId`,
      {
        replacements: { paymentId: capture?.id || null, orderId, quotaId },
        type: sequelize.QueryTypes.UPDATE
      }
    );

    logger.info(`Pagamento PayPal ${capture?.id} confermato per quota ${quotaId} (${importoIncassato}€)`);

    res.json({ message: 'Pagamento confermato con successo' });
  } catch (error) {
    logger.error('Errore conferma pagamento PayPal:', error);
    res.status(500).json({ error: 'Errore durante la conferma del pagamento' });
  }
};

/**
 * GET /api/v1/users/:id/partecipazioni
 * Storico partecipazioni attività
 */
const getPartecipazioni = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verifica permessi
    if (req.user.id !== id && req.user.ruolo !== 'admin') {
      return res.status(403).json({ error: 'Accesso negato' });
    }
    
    const partecipazioni = await sequelize.query(
      `SELECT p.*, t.data_turno, t.tipo_turno, s.tipo_slot
       FROM partecipazioni_attivita p
       LEFT JOIN turni_cucina t ON p.turno_id = t.id
       LEFT JOIN slot_turno s ON p.slot_id = s.id
       WHERE p.user_id = :userId
       ORDER BY p.data_attivita DESC, p.created_at DESC`,
      {
        replacements: { userId: id },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    res.json({ partecipazioni });
  } catch (error) {
    logger.error('Errore recupero partecipazioni:', error);
    res.status(500).json({ error: 'Errore durante il recupero delle partecipazioni' });
  }
};

/**
 * GET /api/v1/users/:id/changelog
 * Changelog utente
 */
const getChangelog = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Solo admin può vedere changelog
    if (req.user.ruolo !== 'admin') {
      return res.status(403).json({ error: 'Accesso negato' });
    }
    
    const changelog = await sequelize.query(
      `SELECT c.*, u.nome as modificatore_nome, u.cognome as modificatore_cognome
       FROM user_changelog c
       LEFT JOIN users u ON c.modificato_da = u.id
       WHERE c.user_id = :userId
       ORDER BY c.created_at DESC`,
      {
        replacements: { userId: id },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    res.json({ changelog });
  } catch (error) {
    logger.error('Errore recupero changelog:', error);
    res.status(500).json({ error: 'Errore durante il recupero del changelog' });
  }
};

/**
 * PUT /api/v1/users/:id/sospendi
 * Sospende o riattiva un socio (solo admin)
 */
const toggleSospensione = async (req, res) => {
  try {
    const { id } = req.params;
    const { sospeso } = req.body;
    
    if (typeof sospeso !== 'boolean') {
      return res.status(400).json({ error: 'Il campo sospeso deve essere un booleano' });
    }
    
    if (id === req.user.id) {
      return res.status(400).json({ error: 'Non puoi sospendere il tuo stesso account' });
    }
    
    // Verifica che l'utente esista
    const [user] = await sequelize.query(
      'SELECT id, nome, cognome, sospeso FROM users WHERE id = :id',
      {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (!user) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }
    
    // Aggiorna stato sospensione
    await sequelize.query(
      `UPDATE users 
       SET sospeso = :sospeso, updated_at = CURRENT_TIMESTAMP, updated_by = :updatedBy
       WHERE id = :id`,
      {
        replacements: { sospeso, updatedBy: req.user.id, id },
        type: sequelize.QueryTypes.UPDATE
      }
    );
    
    // Log changelog
    await sequelize.query(
      `INSERT INTO user_changelog (user_id, campo_modificato, valore_precedente, valore_nuovo, motivo_modifica, modificato_da)
       VALUES (:userId, 'sospeso', :valorePrec, :valoreNuovo, :motivo, :modificatoDa)`,
      {
        replacements: {
          userId: id,
          valorePrec: user.sospeso ? 'true' : 'false',
          valoreNuovo: sospeso ? 'true' : 'false',
          motivo: sospeso ? 'Sospensione socio' : 'Riattivazione socio',
          modificatoDa: req.user.id
        },
        type: sequelize.QueryTypes.INSERT
      }
    );
    
    logger.info(`Socio ${user.nome} ${user.cognome} ${sospeso ? 'sospeso' : 'riattivato'} da ${req.user.email}`);
    
    res.json({ 
      message: sospeso ? 'Socio sospeso con successo' : 'Socio riattivato con successo',
      sospeso 
    });
  } catch (error) {
    logger.error('Errore sospensione/riattivazione socio:', error);
    res.status(500).json({ error: 'Errore durante la sospensione/riattivazione del socio' });
  }
};

/**
 * POST /api/v1/users/:id/foto-profilo
 * Carica o aggiorna foto profilo
 */
const uploadFotoProfilo = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verifica permessi (solo admin o proprio profilo)
    if (req.user.id !== id && req.user.ruolo !== 'admin') {
      return res.status(403).json({ error: 'Accesso negato' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'File immagine richiesto' });
    }
    
    // Verifica che l'utente esista
    const [user] = await sequelize.query(
      'SELECT id, foto_profilo FROM users WHERE id = :id',
      {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (!user) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }
    
    // Costruisci il percorso relativo del file
    const fotoPath = `/uploads/profili/${req.file.filename}`;
    
    // Se c'era una foto precedente, eliminala (opzionale, per risparmiare spazio)
    if (user.foto_profilo) {
      const fs = require('fs');
      const path = require('path');
      const oldPath = path.join(process.env.UPLOAD_PATH || './uploads', user.foto_profilo.replace('/uploads/', ''));
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }
    
    // Aggiorna foto profilo nel database
    await sequelize.query(
      `UPDATE users 
       SET foto_profilo = :fotoPath, updated_at = CURRENT_TIMESTAMP, updated_by = :updatedBy
       WHERE id = :id`,
      {
        replacements: { fotoPath, updatedBy: req.user.id, id },
        type: sequelize.QueryTypes.UPDATE
      }
    );
    
    logger.info(`Foto profilo aggiornata per utente ${id} da ${req.user.email}`);
    
    res.json({ 
      message: 'Foto profilo caricata con successo',
      foto_profilo: fotoPath 
    });
  } catch (error) {
    logger.error('Errore upload foto profilo:', error);
    res.status(500).json({ error: 'Errore durante il caricamento della foto profilo' });
  }
};

/**
 * POST /api/v1/users/:id/quote/:quotaId/segnala-pagamento
 * Utente segnala di aver effettuato il pagamento
 */
const segnalaPagamento = async (req, res) => {
  try {
    const { id, quotaId } = req.params;
    const { metodo_pagamento, riferimento_pagamento } = req.body;
    
    // Verifica permessi (solo proprio profilo o admin)
    if (req.user.id !== id && req.user.ruolo !== 'admin') {
      return res.status(403).json({ error: 'Accesso negato' });
    }
    
    if (!metodo_pagamento) {
      return res.status(400).json({ error: 'Metodo di pagamento obbligatorio' });
    }
    
    // Verifica quota esiste e appartiene all'utente
    const [quota] = await sequelize.query(
      'SELECT * FROM quote_associative WHERE id = :quotaId AND user_id = :userId',
      {
        replacements: { quotaId, userId: id },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (!quota) {
      return res.status(404).json({ error: 'Quota non trovata' });
    }
    
    if (quota.pagata) {
      return res.status(400).json({ error: 'Quota già pagata' });
    }
    
    // Aggiorna quota con segnalazione pagamento
    await sequelize.query(
      `UPDATE quote_associative 
       SET metodo_pagamento = :metodoPagamento,
           riferimento_pagamento = :riferimentoPagamento,
           stato_validazione = 'in_attesa',
           data_segnalazione = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :quotaId`,
      {
        replacements: { 
          metodoPagamento: metodo_pagamento,
          riferimentoPagamento: riferimento_pagamento || null,
          quotaId 
        },
        type: sequelize.QueryTypes.UPDATE
      }
    );
    
    logger.info(`Pagamento segnalato per quota ${quotaId} da utente ${id} - metodo: ${metodo_pagamento}`);
    
    res.json({ message: 'Pagamento segnalato con successo. In attesa di validazione.' });
  } catch (error) {
    logger.error('Errore segnalazione pagamento:', error);
    res.status(500).json({ error: 'Errore durante la segnalazione del pagamento' });
  }
};

/**
 * POST /api/v1/users/:id/quote/:quotaId/valida-pagamento
 * Admin valida o rifiuta un pagamento segnalato
 */
const validaPagamento = async (req, res) => {
  try {
    const { id, quotaId } = req.params;
    const { validato, motivo_rifiuto } = req.body;
    
    if (typeof validato !== 'boolean') {
      return res.status(400).json({ error: 'Campo validato obbligatorio (true/false)' });
    }
    
    // Verifica quota esiste
    const [quota] = await sequelize.query(
      'SELECT * FROM quote_associative WHERE id = :quotaId AND user_id = :userId',
      {
        replacements: { quotaId, userId: id },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (!quota) {
      return res.status(404).json({ error: 'Quota non trovata' });
    }
    
    if (quota.pagata) {
      return res.status(400).json({ error: 'Quota già validata e pagata' });
    }
    
    if (quota.stato_validazione !== 'in_attesa') {
      return res.status(400).json({ error: 'Nessun pagamento da validare per questa quota' });
    }
    
    if (validato) {
      // Valida il pagamento
      await sequelize.query(
        `UPDATE quote_associative 
         SET pagata = true,
             data_pagamento = CURRENT_DATE,
             stato_validazione = 'validato',
             validato_da = :validatoDa,
             data_validazione = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = :quotaId`,
        {
          replacements: { validatoDa: req.user.id, quotaId },
          type: sequelize.QueryTypes.UPDATE
        }
      );
      
      logger.info(`Pagamento validato per quota ${quotaId} da admin ${req.user.email}`);
      res.json({ message: 'Pagamento validato con successo' });
    } else {
      // Rifiuta il pagamento
      await sequelize.query(
        `UPDATE quote_associative 
         SET stato_validazione = 'rifiutato',
             validato_da = :validatoDa,
             data_validazione = CURRENT_TIMESTAMP,
             motivo_rifiuto = :motivoRifiuto,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = :quotaId`,
        {
          replacements: { 
            validatoDa: req.user.id, 
            quotaId,
            motivoRifiuto: motivo_rifiuto || null
          },
          type: sequelize.QueryTypes.UPDATE
        }
      );
      
      logger.info(`Pagamento rifiutato per quota ${quotaId} da admin ${req.user.email}`);
      res.json({ message: 'Pagamento rifiutato' });
    }
  } catch (error) {
    logger.error('Errore validazione pagamento:', error);
    res.status(500).json({ error: 'Errore durante la validazione del pagamento' });
  }
};

/**
 * POST /api/v1/users/invita-quote-anno-corrente
 * Crea quote anno corrente per tutti gli utenti attivi che non ce l'hanno e crea un avviso
 */
/**
 * Indirizzi che non portano a nessuno: quelli creati in blocco per i soci
 * che non avevano un'email, i segnaposto dei sondaggi, gli utenti di prova.
 * Scrivergli produce solo rimbalzi, e tanti rimbalzi fanno finire nello
 * spam anche le email vere.
 */
const DOMINI_FINTI = ['@soci.labrigataodv.it', '@fittizio.labrigataodv.it', '@test.local'];
const emailRaggiungibile = (email) =>
  !!email && email.includes('@') && !DOMINI_FINTI.some((d) => email.toLowerCase().endsWith(d));

/** «15,00 €», non «15.00€». */
const formattaEuro = (importo) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(importo));

/**
 * Pausa fra un WhatsApp e l'altro, a caso fra 8 e 20 secondi. Ventisette
 * messaggi identici in pochi secondi da un numero non ufficiale sono il modo
 * piu' rapido per farselo bloccare. Nei test non si aspetta.
 */
const pausaFraWhatsapp = () =>
  process.env.NODE_ENV === 'test' ? 0 : 8000 + Math.floor(Math.random() * 12000);
const aspetta = (ms) => new Promise((r) => setTimeout(r, ms));

/** Chi riceverebbe la quota dell'anno: attivi, veri, non sospesi, ancora senza quota. */
async function destinatariQuota(anno) {
  return sequelize.query(
    `SELECT u.id, u.nome, u.cognome, u.email, u.telefono
       FROM users u
      WHERE u.attivo = true
        AND u.archiviato = false
        AND u.sospeso = false
        AND u.fittizio = false
        AND NOT EXISTS (SELECT 1 FROM quote_associative q WHERE q.user_id = u.id AND q.anno = :anno)
      ORDER BY u.nome, u.cognome`,
    { replacements: { anno }, type: sequelize.QueryTypes.SELECT }
  );
}

function riepilogoInvio(destinatari) {
  const conWhatsapp = destinatari.filter((u) => u.telefono).length;
  const conEmail = destinatari.filter((u) => emailRaggiungibile(u.email)).length;
  return {
    destinatari: destinatari.length,
    whatsapp: conWhatsapp,
    email: conEmail,
    emailSaltate: destinatari.length - conEmail,
  };
}

/**
 * GET /api/v1/users/invita-quote-anno-corrente/anteprima
 * Cosa succederebbe premendo il pulsante: serve alla conferma, perche' un
 * tocco sbagliato manda decine di messaggi che non si ritirano.
 */
const anteprimaQuoteAnnoCorrente = async (req, res) => {
  try {
    const anno = new Date().getFullYear();
    const importo = await getQuotaAnnuale();
    const destinatari = await destinatariQuota(anno);
    res.json({ anno, importo, importoTesto: formattaEuro(importo), ...riepilogoInvio(destinatari) });
  } catch (error) {
    logger.error('Errore anteprima quote anno corrente:', error);
    res.status(500).json({ error: "Errore durante il calcolo dell'anteprima" });
  }
};

/** Manda email e WhatsApp uno alla volta, con le pause. Non lancia mai. */
async function inviaAvvisiQuota(destinatari, { anno, importo }, admin) {
  const testo = (nome) =>
    `Gentile ${nome},\n\nTi informiamo che è ora possibile pagare la quota associativa per l'anno ${anno}.\n\n` +
    `L'importo della quota è di ${formattaEuro(importo)}.\n\n` +
    'Puoi procedere al pagamento dalla tua pagina profilo, selezionando il metodo di pagamento preferito (contanti, bonifico o PayPal).\n\n' +
    'Grazie per il tuo supporto!\n\nLa Brigata ODV';

  let email = 0;
  let whatsapp = 0;
  let primoWhatsapp = true;
  for (const utente of destinatari) {
    // Link personale: porta il socio direttamente alla propria pagina,
    // dove trova la quota e i pulsanti di pagamento.
    const url = linkProfilo(utente.id);
    try {
      if (emailRaggiungibile(utente.email)) {
        const r = await sendMail({
          to: utente.email,
          subject: `Quota associativa ${anno} - Invito al pagamento`,
          titolo: 'Quota Associativa',
          corpoHtml: `<p style="white-space: pre-wrap;">${testo(utente.nome)}</p>` + rigaEmail(url, 'Paga la quota'),
        });
        if (r.sent) email++;
      }
      if (utente.telefono) {
        if (!primoWhatsapp) await aspetta(pausaFraWhatsapp());
        primoWhatsapp = false;
        const r = await sendWhatsApp(utente.telefono, `💳 *La Brigata ODV*\n\n${testo(utente.nome)}` + rigaWhatsapp(url, 'Paga la quota'));
        if (r.sent) whatsapp++;
      }
    } catch (error) {
      logger.error(`Invito quota ${anno}: invio a ${utente.id} non riuscito:`, error);
    }
  }
  logger.info(`Inviti quota ${anno} terminati (avviati da ${admin}): ${email} email, ${whatsapp} WhatsApp su ${destinatari.length} soci`);
  return { email, whatsapp };
}

/**
 * POST /api/v1/users/invita-quote-anno-corrente
 * Crea la quota dell'anno a chi non ce l'ha e lo invita a pagarla.
 *
 * Le quote e l'avviso nell'app si creano subito; email e WhatsApp partono
 * dopo la risposta, uno alla volta con le pause, e l'admin non resta
 * davanti a una pagina ferma per minuti.
 */
const inviaQuoteAnnoCorrente = async (req, res) => {
  try {
    const anno = new Date().getFullYear();
    const importo = await getQuotaAnnuale();
    const destinatari = await destinatariQuota(anno);

    if (destinatari.length === 0) {
      return res.json({
        message: "Tutti gli utenti attivi hanno già la quota per l'anno corrente",
        quoteCreate: 0,
      });
    }

    await sequelize.transaction(async (transaction) => {
      for (const utente of destinatari) {
        await sequelize.query(
          `INSERT INTO quote_associative (user_id, anno, importo, pagata)
           VALUES (:userId, :anno, :importo, false)`,
          { replacements: { userId: utente.id, anno, importo }, type: sequelize.QueryTypes.INSERT, transaction }
        );
      }

      // L'avviso nell'app va solo a chi deve pagare, non a chi l'ha gia' fatto.
      await sequelize.query(
        `INSERT INTO avvisi (titolo, contenuto, priorita, destinatari, pubblicato, data_pubblicazione, created_by)
         VALUES (:titolo, :contenuto, 'alta', :destinatari, true, CURRENT_TIMESTAMP, :createdBy)`,
        {
          replacements: {
            titolo: `Quota associativa ${anno} - Invito al pagamento`,
            contenuto: `È ora possibile pagare la quota associativa per l'anno ${anno}: ${formattaEuro(importo)}.\n\n` +
              'Puoi pagarla dalla tua pagina profilo, in contanti, con bonifico o con PayPal.\n\nGrazie per il tuo supporto!\n\nLa Brigata ODV',
            destinatari: JSON.stringify(destinatari.map((u) => `utente:${u.id}`)),
            createdBy: req.user.id,
          },
          type: sequelize.QueryTypes.INSERT,
          transaction,
        }
      );
    });

    const riepilogo = riepilogoInvio(destinatari);
    logger.info(`Quote ${anno} create per ${destinatari.length} soci da ${req.user.email}: in invio ${riepilogo.whatsapp} WhatsApp e ${riepilogo.email} email (${riepilogo.emailSaltate} email finte saltate)`);

    const invio = inviaAvvisiQuota(destinatari, { anno, importo }, req.user.email);
    // Nei test si aspetta la fine, per poterla verificare; in esercizio no.
    if (process.env.NODE_ENV === 'test') await invio;

    res.json({
      message: `Quote create: ${riepilogo.whatsapp} WhatsApp e ${riepilogo.email} email in invio`,
      quoteCreate: destinatari.length,
      anno,
      ...riepilogo,
    });
  } catch (error) {
    logger.error('Errore invio quote anno corrente:', error);
    res.status(500).json({ error: 'Errore durante la creazione delle quote' });
  }
};

/**
 * POST /api/v1/users/:id/rimanda-credenziali (solo admin)
 * Per chi ha perso il messaggio di benvenuto o non riesce piu' ad entrare:
 * una nuova password provvisoria, mandata per email e WhatsApp. La vecchia
 * smette di valere.
 */
const rimandaCredenziali = async (req, res) => {
  try {
    const [socio] = await sequelize.query(
      `SELECT id, email, nome, ragione_sociale, telefono, attivo, archiviato, COALESCE(fittizio, false) AS fittizio
         FROM users WHERE id = :id`,
      { replacements: { id: req.params.id }, type: sequelize.QueryTypes.SELECT }
    );
    if (!socio) return res.status(404).json({ error: 'Utente non trovato' });
    if (socio.fittizio) return res.status(400).json({ error: 'Gli enti fittizi non accedono all\'app' });
    if (!socio.attivo || socio.archiviato) {
      return res.status(400).json({ error: 'Il socio è archiviato o non attivo: riattivalo prima di mandargli i dati' });
    }

    const password = credenziali.generaPassword();
    await sequelize.query(
      `UPDATE users SET password_hash = :hash, updated_at = CURRENT_TIMESTAMP, updated_by = :admin WHERE id = :id`,
      { replacements: { hash: await bcrypt.hash(password, 10), admin: req.user.id, id: socio.id } }
    );

    const inviati = await credenziali.inviaCredenziali(socio, password, { nuovo: false });
    logger.info(`Dati di accesso rimandati a ${socio.email} da ${req.user.email}`, inviati);
    res.json({ credenziali: inviati });
  } catch (error) {
    logger.error('Errore invio dati di accesso:', error);
    res.status(500).json({ error: 'Errore durante l\'invio dei dati di accesso' });
  }
};

module.exports = {
  rimandaCredenziali,
  getUsers,
  getUserById,
  updateUser,
  archiveUser,
  getQuote,
  addQuota,
  creaQuotaEPaga,
  getPayPalConfig,
  createPayPalOrder,
  capturePayPalPayment,
  getPartecipazioni,
  getChangelog,
  toggleSospensione,
  uploadFotoProfilo,
  segnalaPagamento,
  validaPagamento,
  inviaQuoteAnnoCorrente,
  anteprimaQuoteAnnoCorrente,
  emailRaggiungibile,
  formattaEuro,
};

