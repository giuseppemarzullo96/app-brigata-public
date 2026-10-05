const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');
const logger = require('../utils/logger');
const allegati = require('../utils/allegati');

/**
 * GET /api/v1/messaggi
 * Lista messaggi (ricevuti o inviati)
 */
const getMessaggi = async (req, res) => {
  try {
    const { tipo = 'ricevuti' } = req.query; // 'ricevuti' o 'inviati'
    
    let query = '';
    const replacements = { userId: req.user.id };
    
    if (tipo === 'ricevuti') {
      query = `
        SELECT 
          m.*,
          u.nome as mittente_nome,
          u.cognome as mittente_cognome,
          u.email as mittente_email
        FROM messaggi_interni m
        JOIN users u ON m.mittente_id = u.id
        WHERE m.destinatario_id = :userId OR m.destinatario_id IS NULL
        ORDER BY m.created_at DESC
      `;
    } else {
      query = `
        SELECT 
          m.*,
          u.nome as destinatario_nome,
          u.cognome as destinatario_cognome,
          u.email as destinatario_email
        FROM messaggi_interni m
        LEFT JOIN users u ON m.destinatario_id = u.id
        WHERE m.mittente_id = :userId
        ORDER BY m.created_at DESC
      `;
    }
    
    const messaggi = await sequelize.query(query, {
      replacements,
      type: QueryTypes.SELECT
    });
    
    res.json({ messaggi });
  } catch (error) {
    logger.error('Errore recupero messaggi:', error);
    res.status(500).json({ error: 'Errore durante il recupero dei messaggi' });
  }
};

/**
 * GET /api/v1/messaggi/:id
 * Dettaglio messaggio
 */
const getMessaggioById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [messaggio] = await sequelize.query(
      `SELECT 
        m.*,
        u1.nome as mittente_nome,
        u1.cognome as mittente_cognome,
        u1.email as mittente_email,
        u2.nome as destinatario_nome,
        u2.cognome as destinatario_cognome,
        u2.email as destinatario_email
       FROM messaggi_interni m
       JOIN users u1 ON m.mittente_id = u1.id
       LEFT JOIN users u2 ON m.destinatario_id = u2.id
       WHERE m.id = :id
       AND (m.mittente_id = :userId OR m.destinatario_id = :userId OR m.destinatario_id IS NULL)`,
      {
        replacements: { id, userId: req.user.id },
        type: QueryTypes.SELECT
      }
    );
    
    if (!messaggio) {
      return res.status(404).json({ error: 'Messaggio non trovato' });
    }
    
    // Segna come letto se destinatario
    if (messaggio.destinatario_id === req.user.id && !messaggio.letto) {
      await sequelize.query(
        `UPDATE messaggi_interni 
         SET letto = true, data_lettura = CURRENT_TIMESTAMP
         WHERE id = :id`,
        {
          replacements: { id },
          type: QueryTypes.UPDATE
        }
      );
    }
    
    res.json({ messaggio });
  } catch (error) {
    logger.error('Errore recupero messaggio:', error);
    res.status(500).json({ error: 'Errore durante il recupero del messaggio' });
  }
};

/**
 * POST /api/v1/messaggi
 * Invia messaggio
 */
const inviaMessaggio = async (req, res) => {
  try {
    const { destinatario_id, oggetto, contenuto, conversazione_id, gruppo_id } = req.body;
    
    if (!contenuto && !req.file) {
      return res.status(400).json({ error: 'Contenuto o allegato obbligatorio' });
    }
    
    // Determina tipo allegato se presente
    let tipoAllegato = null;
    let allegatoPath = null;
    let allegatoNome = null;
    let allegatoDimensione = null;
    
    if (req.file) {
      // Tipo e percorso arrivano dalla stessa tabella che ha deciso in quale
      // cartella multer ha appena posato il file: non possono divergere.
      tipoAllegato = allegati.tipoAllegato(req.file.originalname) || 'documento';
      allegatoPath = allegati.percorsoPubblico(req.file.originalname, req.file.filename);
      allegatoNome = req.file.originalname;
      allegatoDimensione = req.file.size;
    }
    
    // Verifica che l'utente sia admin o socio (volontario/ordinario)
    const userCategoria = req.user.categoria_socio || req.user.ruolo;
    const categoriePermesse = ['admin', 'volontario', 'ordinario'];
    if (!categoriePermesse.includes(userCategoria) && req.user.ruolo !== 'admin') {
      return res.status(403).json({ error: 'Solo admin e soci possono inviare messaggi' });
    }
    
    let conversazioneId = conversazione_id || null;
    let gruppoId = gruppo_id || null;
    
    // Se è un messaggio a un gruppo
    if (gruppoId) {
      // Verifica che il gruppo esista e che l'utente possa scrivere
      const [gruppo] = await sequelize.query(
        `SELECT g.*, 
         EXISTS (
           SELECT 1 FROM partecipanti_gruppo pg 
           WHERE pg.gruppo_id = g.id AND pg.user_id = :userId
         ) as is_partecipante
         FROM gruppi_chat g
         WHERE g.id = :gruppoId`,
        {
          replacements: { gruppoId, userId: req.user.id },
          type: QueryTypes.SELECT
        }
      );
      
      if (!gruppo) {
        return res.status(404).json({ error: 'Gruppo non trovato' });
      }
      
      // Verifica accesso: chat generale o se è partecipante
      if (gruppo.tipo_gruppo !== 'generale' && !gruppo.is_partecipante) {
        return res.status(403).json({ error: 'Non fai parte di questo gruppo' });
      }
      
      // Per i gruppi, usiamo gruppo_id come conversazione_id
      conversazioneId = gruppoId;
    } else if (destinatario_id) {
      // Messaggio privato
      const [destinatario] = await sequelize.query(
        `SELECT id, ruolo, categoria_socio FROM users WHERE id = :id AND attivo = true`,
        {
          replacements: { id: destinatario_id },
          type: QueryTypes.SELECT
        }
      );
      
      if (!destinatario) {
        return res.status(404).json({ error: 'Destinatario non trovato' });
      }
      
      // Verifica che il destinatario sia admin o socio
      const destinatarioCategoria = destinatario.categoria_socio || destinatario.ruolo;
      if (!categoriePermesse.includes(destinatarioCategoria) && destinatario.ruolo !== 'admin') {
        return res.status(403).json({ error: 'Il destinatario deve essere admin o socio' });
      }
      
      // Se c'è una conversazione_id, verifica che l'utente faccia parte della conversazione
      if (conversazioneId) {
        const [conversazione] = await sequelize.query(
          `SELECT DISTINCT 
            CASE 
              WHEN mittente_id = :userId THEN destinatario_id
              WHEN destinatario_id = :userId THEN mittente_id
              ELSE NULL
            END as altro_utente
           FROM messaggi_interni
           WHERE conversazione_id = :conversazioneId
           AND gruppo_id IS NULL
           AND (mittente_id = :userId OR destinatario_id = :userId)
           LIMIT 1`,
          {
            replacements: { conversazioneId, userId: req.user.id },
            type: QueryTypes.SELECT
          }
        );
        
        if (!conversazione || !conversazione.altro_utente) {
          return res.status(403).json({ error: 'Non fai parte di questa conversazione' });
        }
        
        // Assicurati che il destinatario sia l'altro utente della conversazione
        if (destinatario_id !== conversazione.altro_utente) {
          return res.status(400).json({ error: 'Il destinatario non corrisponde alla conversazione' });
        }
      } else {
        // Crea una nuova conversazione se non esiste
        const [conversazioneEsistente] = await sequelize.query(
          `SELECT DISTINCT conversazione_id
           FROM messaggi_interni
           WHERE (
             (mittente_id = :userId AND destinatario_id = :destinatarioId)
             OR (mittente_id = :destinatarioId AND destinatario_id = :userId)
           )
           AND conversazione_id IS NOT NULL
           AND gruppo_id IS NULL
           LIMIT 1`,
          {
            replacements: { userId: req.user.id, destinatarioId: destinatario_id },
            type: QueryTypes.SELECT
          }
        );
        
        if (conversazioneEsistente) {
          conversazioneId = conversazioneEsistente.conversazione_id;
        } else {
          // Genera un nuovo UUID per la conversazione
          const [uuidResult] = await sequelize.query('SELECT gen_random_uuid() as id', {
            type: QueryTypes.SELECT
          });
          conversazioneId = uuidResult.id;
        }
      }
    } else {
      return res.status(400).json({ error: 'Specifica destinatario_id o gruppo_id' });
    }
    
    /**
     * Crittografia end-to-end: ogni messaggio arriva in DUE copie cifrate, una
     * per chi legge e una per chi scrive. Senza la seconda il mittente non
     * potrebbe piu' rileggere cio' che ha mandato, perche' la chiave e'
     * derivata dalla pubblica del destinatario e il server non vede il testo.
     */
    const {
      crittografato = false, iv = null, chiave_ephemeral = null,
      contenuto_mittente = null, iv_mittente = null, chiave_ephemeral_mittente = null,
    } = req.body;

    const result = await sequelize.query(
      `INSERT INTO messaggi_interni (mittente_id, destinatario_id, oggetto, contenuto, conversazione_id, gruppo_id, tipo_allegato, allegato_path, allegato_nome, allegato_dimensione, crittografato, iv, chiave_ephemeral, contenuto_mittente, iv_mittente, chiave_ephemeral_mittente)
       VALUES (:mittenteId, :destinatarioId, :oggetto, :contenuto, :conversazioneId, :gruppoId, :tipoAllegato, :allegatoPath, :allegatoNome, :allegatoDimensione, :crittografato, :iv, :chiaveEphemeral, :contenutoMittente, :ivMittente, :chiaveEphemeralMittente)
       RETURNING *`,
      {
        replacements: {
          mittenteId: req.user.id,
          destinatarioId: destinatario_id || null,
          oggetto: oggetto || null,
          contenuto: contenuto || null,
          conversazioneId,
          gruppoId,
          tipoAllegato,
          allegatoPath,
          allegatoNome,
          allegatoDimensione,
          crittografato: crittografato || false,
          iv: iv || null,
          chiaveEphemeral: chiave_ephemeral || null,
          contenutoMittente: contenuto_mittente || null,
          ivMittente: iv_mittente || null,
          chiaveEphemeralMittente: chiave_ephemeral_mittente || null
        },
        type: QueryTypes.SELECT
      }
    );
    
    logger.info(`Messaggio inviato da ${req.user.email}${gruppoId ? ' a gruppo' : ''}`);
    
    res.status(201).json({ messaggio: result[0] });
  } catch (error) {
    logger.error('Errore invio messaggio:', error);
    res.status(500).json({ error: 'Errore durante l\'invio del messaggio' });
  }
};

/**
 * GET /api/v1/messaggi/non-letti
 * Conta messaggi non letti (solo conversazioni chat)
 */
const getMessaggiNonLetti = async (req, res) => {
  try {
    // Verifica che l'utente sia admin o socio
    const userCategoria = req.user.categoria_socio || req.user.ruolo;
    const categoriePermesse = ['admin', 'volontario', 'ordinario'];
    if (!categoriePermesse.includes(userCategoria) && req.user.ruolo !== 'admin') {
      return res.json({ count: 0 });
    }
    
    // Conta solo messaggi delle conversazioni (chat) dove l'utente è destinatario)
    // Escludi messaggi con destinatario_id IS NULL (messaggi a tutti del vecchio sistema)
    // Escludi messaggi eliminati
    const [result] = await sequelize.query(
      `SELECT COUNT(*) as count 
       FROM messaggi_interni 
       WHERE destinatario_id = :userId
       AND conversazione_id IS NOT NULL
       AND letto = false
       AND eliminato = false`,
      {
        replacements: { userId: req.user.id },
        type: QueryTypes.SELECT
      }
    );
    
    res.json({ count: parseInt(result.count) });
  } catch (error) {
    logger.error('Errore conteggio messaggi:', error);
    res.status(500).json({ error: 'Errore durante il conteggio' });
  }
};

/**
 * GET /api/v1/messaggi/conversazioni
 * Lista conversazioni (solo admin e soci) - include chat private, di gruppo e generale
 */
const getConversazioni = async (req, res) => {
  try {
    // Verifica che l'utente sia admin o socio
    const userCategoria = req.user.categoria_socio || req.user.ruolo;
    const categoriePermesse = ['admin', 'volontario', 'ordinario'];
    if (!categoriePermesse.includes(userCategoria) && req.user.ruolo !== 'admin') {
      return res.status(403).json({ error: 'Solo admin e soci possono vedere le conversazioni' });
    }
    
    /**
     * Conversazioni private (1-1).
     *
     * L'ultimo messaggio si prende con un LATERAL: prima erano sette
     * sottoquery correlate che rileggevano la stessa riga sette volte, e ogni
     * campo nuovo ne aggiungeva un'altra.
     *
     * Della copia cifrata per il mittente c'e' bisogno anche qui: se l'ultimo
     * messaggio della conversazione l'ho scritto io, l'anteprima nell'elenco
     * dev'essere leggibile da me.
     */
    const conversazioniPrivate = await sequelize.query(
      `SELECT
        c.conversazione_id,
        'privata' as tipo_conversazione,
        NULL as gruppo_id,
        NULL as gruppo_nome,
        c.altro_utente_id,
        u.nome as altro_utente_nome,
        u.cognome as altro_utente_cognome,
        u.ruolo as altro_utente_ruolo,
        u.categoria_socio as altro_utente_categoria,
        u.foto_profilo as altro_utente_foto,
        ult.contenuto as ultimo_messaggio,
        ult.id as ultimo_messaggio_id,
        ult.mittente_id as ultimo_messaggio_mittente_id,
        ult.crittografato as ultimo_messaggio_crittografato,
        ult.iv as ultimo_messaggio_iv,
        ult.chiave_ephemeral as ultimo_messaggio_chiave_ephemeral,
        ult.contenuto_mittente as ultimo_messaggio_contenuto_mittente,
        ult.iv_mittente as ultimo_messaggio_iv_mittente,
        ult.chiave_ephemeral_mittente as ultimo_messaggio_chiave_ephemeral_mittente,
        ult.tipo_allegato as ultimo_messaggio_tipo_allegato,
        ult.created_at as ultimo_messaggio_data,
        (
          SELECT COUNT(*)
          FROM messaggi_interni
          WHERE conversazione_id = c.conversazione_id
          AND destinatario_id = :userId
          AND letto = false
          AND eliminato = false
        ) as messaggi_non_letti
       FROM (
         SELECT DISTINCT
           m.conversazione_id,
           CASE WHEN m.mittente_id = :userId THEN m.destinatario_id ELSE m.mittente_id END as altro_utente_id
         FROM messaggi_interni m
         WHERE m.conversazione_id IS NOT NULL
           AND m.gruppo_id IS NULL
           AND (m.mittente_id = :userId OR m.destinatario_id = :userId)
       ) c
       LEFT JOIN users u ON u.id = c.altro_utente_id
       LEFT JOIN LATERAL (
         SELECT *
         FROM messaggi_interni
         WHERE conversazione_id = c.conversazione_id
           AND eliminato = false
         ORDER BY created_at DESC
         LIMIT 1
       ) ult ON true
       ORDER BY ult.created_at DESC NULLS LAST`,
      {
        replacements: { userId: req.user.id },
        type: QueryTypes.SELECT
      }
    );

    // Recupera gruppi di chat a cui l'utente partecipa
    const gruppi = await sequelize.query(
      `SELECT 
        g.id as gruppo_id,
        g.nome as gruppo_nome,
        g.descrizione as gruppo_descrizione,
        g.tipo_gruppo,
        g.foto_profilo,
        'gruppo' as tipo_conversazione,
        NULL as altro_utente_id,
        NULL as altro_utente_nome,
        NULL as altro_utente_cognome,
        NULL as altro_utente_email,
        NULL as altro_utente_ruolo,
        NULL as altro_utente_categoria,
        (
          SELECT contenuto 
          FROM messaggi_interni 
          WHERE gruppo_id = g.id 
          AND eliminato = false
          ORDER BY created_at DESC 
          LIMIT 1
        ) as ultimo_messaggio,
        (
          SELECT id 
          FROM messaggi_interni 
          WHERE gruppo_id = g.id 
          AND eliminato = false
          ORDER BY created_at DESC 
          LIMIT 1
        ) as ultimo_messaggio_id,
        (
          SELECT mittente_id 
          FROM messaggi_interni 
          WHERE gruppo_id = g.id 
          AND eliminato = false
          ORDER BY created_at DESC 
          LIMIT 1
        ) as ultimo_messaggio_mittente_id,
        (
          SELECT crittografato 
          FROM messaggi_interni 
          WHERE gruppo_id = g.id 
          AND eliminato = false
          ORDER BY created_at DESC 
          LIMIT 1
        ) as ultimo_messaggio_crittografato,
        (
          SELECT iv 
          FROM messaggi_interni 
          WHERE gruppo_id = g.id 
          AND eliminato = false
          ORDER BY created_at DESC 
          LIMIT 1
        ) as ultimo_messaggio_iv,
        (
          SELECT chiave_ephemeral 
          FROM messaggi_interni 
          WHERE gruppo_id = g.id 
          AND eliminato = false
          ORDER BY created_at DESC 
          LIMIT 1
        ) as ultimo_messaggio_chiave_ephemeral,
        (
          SELECT created_at 
          FROM messaggi_interni 
          WHERE gruppo_id = g.id 
          AND eliminato = false
          ORDER BY created_at DESC 
          LIMIT 1
        ) as ultimo_messaggio_data,
        0 as messaggi_non_letti
       FROM gruppi_chat g
       WHERE g.tipo_gruppo = 'generale'
       OR EXISTS (
         SELECT 1 FROM partecipanti_gruppo pg
         WHERE pg.gruppo_id = g.id
         AND pg.user_id = :userId
       )
       ORDER BY ultimo_messaggio_data DESC NULLS LAST, g.nome`,
      {
        replacements: { userId: req.user.id },
        type: QueryTypes.SELECT
      }
    );
    
    // Combina le conversazioni
    const conversazioni = [
      ...conversazioniPrivate.map(c => ({
        ...c,
        conversazione_id: c.conversazione_id
      })),
      ...gruppi.map(g => ({
        conversazione_id: g.gruppo_id, // Usa gruppo_id come conversazione_id per i gruppi
        tipo_conversazione: g.tipo_conversazione,
        gruppo_id: g.gruppo_id,
        gruppo_nome: g.gruppo_nome,
        gruppo_descrizione: g.gruppo_descrizione,
        tipo_gruppo: g.tipo_gruppo,
        altro_utente_id: null,
        altro_utente_nome: null,
        altro_utente_cognome: null,
        altro_utente_email: null,
        altro_utente_ruolo: null,
        altro_utente_categoria: null,
        ultimo_messaggio: g.ultimo_messaggio,
        ultimo_messaggio_data: g.ultimo_messaggio_data,
        messaggi_non_letti: parseInt(g.messaggi_non_letti) || 0
      }))
    ].sort((a, b) => {
      const dateA = a.ultimo_messaggio_data ? new Date(a.ultimo_messaggio_data).getTime() : 0;
      const dateB = b.ultimo_messaggio_data ? new Date(b.ultimo_messaggio_data).getTime() : 0;
      return dateB - dateA;
    });
    
    res.json({ conversazioni });
  } catch (error) {
    logger.error('Errore recupero conversazioni:', error);
    res.status(500).json({ error: 'Errore durante il recupero delle conversazioni' });
  }
};

/**
 * GET /api/v1/messaggi/conversazione/:conversazioneId
 * Messaggi di una conversazione specifica (può essere privata, di gruppo o generale)
 */
const getConversazione = async (req, res) => {
  try {
    const { conversazioneId } = req.params;
    
    // Verifica che l'utente sia admin o socio
    const userCategoria = req.user.categoria_socio || req.user.ruolo;
    const categoriePermesse = ['admin', 'volontario', 'ordinario'];
    if (!categoriePermesse.includes(userCategoria) && req.user.ruolo !== 'admin') {
      return res.status(403).json({ error: 'Solo admin e soci possono vedere le conversazioni' });
    }
    
    // Verifica se è un gruppo o una conversazione privata
    const [gruppo] = await sequelize.query(
      `SELECT g.*, 
       EXISTS (
         SELECT 1 FROM partecipanti_gruppo pg 
         WHERE pg.gruppo_id = g.id AND pg.user_id = :userId
       ) as is_partecipante
       FROM gruppi_chat g
       WHERE g.id = :conversazioneId`,
      {
        replacements: { conversazioneId, userId: req.user.id },
        type: QueryTypes.SELECT
      }
    );
    
    if (gruppo) {
      // È un gruppo - verifica che l'utente possa accedervi
      if (gruppo.tipo_gruppo !== 'generale' && !gruppo.is_partecipante) {
        return res.status(403).json({ error: 'Non fai parte di questo gruppo' });
      }
      
      // Recupera messaggi del gruppo (escludi eliminati)
      const messaggi = await sequelize.query(
        `SELECT 
          m.*,
          u1.nome as mittente_nome,
          u1.cognome as mittente_cognome,
          u1.email as mittente_email,
          NULL as destinatario_nome,
          NULL as destinatario_cognome,
          NULL as destinatario_email
         FROM messaggi_interni m
         JOIN users u1 ON m.mittente_id = u1.id
         WHERE m.gruppo_id = :conversazioneId
         AND m.eliminato = false
         ORDER BY m.created_at ASC`,
        {
          replacements: { conversazioneId },
          type: QueryTypes.SELECT
        }
      );
      
      // Segna messaggi come letti quando l'utente apre la conversazione
      // Per i gruppi, segniamo come letti i messaggi dove l'utente è destinatario esplicito
      // (per i messaggi di gruppo senza destinatario esplicito, non li segniamo come letti)
      await sequelize.query(
        `UPDATE messaggi_interni 
         SET letto = true 
         WHERE gruppo_id = :conversazioneId
         AND destinatario_id = :userId
         AND letto = false`,
        {
          replacements: { conversazioneId, userId: req.user.id },
          type: QueryTypes.UPDATE
        }
      );
      
      res.json({ 
        messaggi,
        gruppo: {
          id: gruppo.id,
          nome: gruppo.nome,
          descrizione: gruppo.descrizione,
          tipo_gruppo: gruppo.tipo_gruppo,
          foto_profilo: gruppo.foto_profilo
        }
      });
    } else {
      // È una conversazione privata
      const [conversazione] = await sequelize.query(
        `SELECT DISTINCT conversazione_id
         FROM messaggi_interni
         WHERE conversazione_id = :conversazioneId
         AND gruppo_id IS NULL
         AND (mittente_id = :userId OR destinatario_id = :userId)
         LIMIT 1`,
        {
          replacements: { conversazioneId, userId: req.user.id },
          type: QueryTypes.SELECT
        }
      );
      
      if (!conversazione) {
        return res.status(404).json({ error: 'Conversazione non trovata' });
      }
      
      // Recupera tutti i messaggi della conversazione (escludi eliminati)
      const messaggi = await sequelize.query(
        `SELECT 
          m.*,
          u1.nome as mittente_nome,
          u1.cognome as mittente_cognome,
          u1.email as mittente_email,
          u2.nome as destinatario_nome,
          u2.cognome as destinatario_cognome,
          u2.email as destinatario_email
         FROM messaggi_interni m
         JOIN users u1 ON m.mittente_id = u1.id
         LEFT JOIN users u2 ON m.destinatario_id = u2.id
         WHERE m.conversazione_id = :conversazioneId
         AND m.eliminato = false
         ORDER BY m.created_at ASC`,
        {
          replacements: { conversazioneId },
          type: QueryTypes.SELECT
        }
      );
      
      // Segna tutti i messaggi come letti se l'utente è il destinatario
      await sequelize.query(
        `UPDATE messaggi_interni 
         SET letto = true, data_lettura = CURRENT_TIMESTAMP
         WHERE conversazione_id = :conversazioneId
         AND destinatario_id = :userId
         AND letto = false`,
        {
          replacements: { conversazioneId, userId: req.user.id },
          type: QueryTypes.UPDATE
        }
      );
      
      res.json({ messaggi });
    }
  } catch (error) {
    logger.error('Errore recupero conversazione:', error);
    res.status(500).json({ error: 'Errore durante il recupero della conversazione' });
  }
};

/**
 * POST /api/v1/messaggi/gruppi
 * Crea nuovo gruppo di chat
 */
const creaGruppo = async (req, res) => {
  try {
    const { nome, descrizione, partecipanti } = req.body;
    
    if (!nome) {
      return res.status(400).json({ error: 'Nome gruppo obbligatorio' });
    }
    
    // Verifica che l'utente sia admin (solo admin possono creare gruppi)
    if (req.user.ruolo !== 'admin') {
      return res.status(403).json({ error: 'Solo gli amministratori possono creare gruppi' });
    }
    
    // Crea gruppo
    logger.info(`Creazione gruppo: ${nome}, creatore: ${req.user.id}`);
    
    // Eseguiamo la query INSERT con RETURNING
    const result = await sequelize.query(
      `INSERT INTO gruppi_chat (nome, descrizione, tipo_gruppo, creatore_id)
       VALUES (:nome, :descrizione, 'normale', :creatoreId)
       RETURNING *`,
      {
        replacements: {
          nome,
          descrizione: descrizione || null,
          creatoreId: req.user.id
        },
        type: QueryTypes.SELECT
      }
    );
    
    logger.info(`Risultato query creazione gruppo (tipo: ${typeof result}, isArray: ${Array.isArray(result)}): ${JSON.stringify(result)}`);
    
    // Con QueryTypes.SELECT, il risultato è un array di oggetti
    // Prendiamo il primo elemento
    const gruppo = Array.isArray(result) && result.length > 0 ? result[0] : result;
    
    if (!gruppo || !gruppo.id) {
      logger.error(`Errore: gruppo non creato correttamente. Risultato: ${JSON.stringify(result)}`);
      return res.status(500).json({ error: 'Errore durante la creazione del gruppo' });
    }
    
    logger.info(`Gruppo creato con ID: ${gruppo.id}`);
    
    // Aggiungi il creatore come partecipante
    try {
      await sequelize.query(
        `INSERT INTO partecipanti_gruppo (gruppo_id, user_id, ruolo, aggiunto_da)
         VALUES (:gruppoId, :userId, 'admin', :userId)
         ON CONFLICT (gruppo_id, user_id) DO NOTHING`,
        {
          replacements: {
            gruppoId: gruppo.id,
            userId: req.user.id
          },
          type: QueryTypes.INSERT
        }
      );
    } catch (err) {
      logger.warn(`Errore aggiunta creatore come partecipante (potrebbe già esistere): ${err.message}`);
      // Non blocchiamo la creazione del gruppo se questo fallisce
    }
    
    // Aggiungi altri partecipanti se specificati
    if (partecipanti && Array.isArray(partecipanti) && partecipanti.length > 0) {
      for (const partecipanteId of partecipanti) {
        // Verifica che il partecipante sia admin o socio
        const [partecipante] = await sequelize.query(
          `SELECT id, ruolo, categoria_socio FROM users WHERE id = :id AND attivo = true`,
          {
            replacements: { id: partecipanteId },
            type: QueryTypes.SELECT
          }
        );
        
        if (partecipante) {
          const partecipanteCategoria = partecipante.categoria_socio || partecipante.ruolo;
          if (categoriePermesse.includes(partecipanteCategoria) || partecipante.ruolo === 'admin') {
            try {
              await sequelize.query(
                `INSERT INTO partecipanti_gruppo (gruppo_id, user_id, ruolo, aggiunto_da)
                 VALUES (:gruppoId, :userId, 'membro', :aggiuntoDa)
                 ON CONFLICT (gruppo_id, user_id) DO NOTHING`,
                {
                  replacements: {
                    gruppoId: gruppo.id,
                    userId: partecipanteId,
                    aggiuntoDa: req.user.id
                  },
                  type: QueryTypes.INSERT
                }
              );
            } catch (err) {
              logger.warn(`Errore aggiunta partecipante ${partecipanteId}: ${err.message}`);
              // Continua con gli altri partecipanti
            }
          }
        }
      }
    }
    
    logger.info(`Gruppo chat creato: ${nome} da ${req.user.email}`);
    
    res.status(201).json({ gruppo });
  } catch (error) {
    logger.error('Errore creazione gruppo:', error);
    res.status(500).json({ error: 'Errore durante la creazione del gruppo' });
  }
};

/**
 * GET /api/v1/messaggi/gruppi/:gruppoId/partecipanti
 * Lista partecipanti di un gruppo
 */
const getPartecipantiGruppo = async (req, res) => {
  try {
    const { gruppoId } = req.params;
    
    // Verifica che l'utente sia admin o socio
    const userCategoria = req.user.categoria_socio || req.user.ruolo;
    const categoriePermesse = ['admin', 'volontario', 'ordinario'];
    if (!categoriePermesse.includes(userCategoria) && req.user.ruolo !== 'admin') {
      return res.status(403).json({ error: 'Solo admin e soci possono vedere i gruppi' });
    }
    
    // Verifica che l'utente faccia parte del gruppo
    const [gruppo] = await sequelize.query(
      `SELECT g.*, 
       EXISTS (
         SELECT 1 FROM partecipanti_gruppo pg 
         WHERE pg.gruppo_id = g.id AND pg.user_id = :userId
       ) as is_partecipante
       FROM gruppi_chat g
       WHERE g.id = :gruppoId`,
      {
        replacements: { gruppoId, userId: req.user.id },
        type: QueryTypes.SELECT
      }
    );
    
    if (!gruppo) {
      return res.status(404).json({ error: 'Gruppo non trovato' });
    }
    
    if (gruppo.tipo_gruppo !== 'generale' && !gruppo.is_partecipante) {
      return res.status(403).json({ error: 'Non fai parte di questo gruppo' });
    }
    
    // Per il gruppo generale, mostra tutti gli utenti admin/volontario/ordinario
    // Per gli altri gruppi, mostra solo i partecipanti registrati
    let partecipanti;
    if (gruppo.tipo_gruppo === 'generale') {
      partecipanti = await sequelize.query(
        `SELECT 
          u.id as user_id,
          u.nome,
          u.cognome,
          u.email,
          u.ruolo,
          u.categoria_socio,
          COALESCE(pg.ruolo, 'membro') as ruolo_gruppo,
          pg.id,
          pg.created_at
         FROM users u
         LEFT JOIN partecipanti_gruppo pg ON pg.user_id = u.id AND pg.gruppo_id = :gruppoId
         WHERE u.attivo = true
         AND (u.ruolo = 'admin' OR u.categoria_socio IN ('volontario', 'ordinario'))
         ORDER BY u.nome ASC, u.cognome ASC`,
        {
          replacements: { gruppoId },
          type: QueryTypes.SELECT
        }
      );
    } else {
      partecipanti = await sequelize.query(
        `SELECT 
          pg.*,
          u.nome,
          u.cognome,
          u.email,
          u.ruolo,
          u.categoria_socio
         FROM partecipanti_gruppo pg
         JOIN users u ON pg.user_id = u.id
         WHERE pg.gruppo_id = :gruppoId
         ORDER BY pg.created_at ASC`,
        {
          replacements: { gruppoId },
          type: QueryTypes.SELECT
        }
      );
    }
    
    res.json({ partecipanti });
  } catch (error) {
    logger.error('Errore recupero partecipanti:', error);
    res.status(500).json({ error: 'Errore durante il recupero dei partecipanti' });
  }
};

/**
 * POST /api/v1/messaggi/gruppi/:gruppoId/partecipanti
 * Aggiungi partecipante a un gruppo
 */
const aggiungiPartecipante = async (req, res) => {
  try {
    const { gruppoId } = req.params;
    const { user_id } = req.body;
    
    if (!user_id) {
      return res.status(400).json({ error: 'user_id obbligatorio' });
    }
    
    // Solo admin possono aggiungere partecipanti ai gruppi
    if (req.user.ruolo !== 'admin') {
      return res.status(403).json({ error: 'Solo gli admin possono aggiungere partecipanti ai gruppi' });
    }
    
    // Verifica che il gruppo esista
    const [gruppo] = await sequelize.query(
      `SELECT g.*
       FROM gruppi_chat g
       WHERE g.id = :gruppoId`,
      {
        replacements: { gruppoId },
        type: QueryTypes.SELECT
      }
    );
    
    if (!gruppo) {
      return res.status(404).json({ error: 'Gruppo non trovato' });
    }
    
    if (gruppo.tipo_gruppo === 'generale') {
      return res.status(400).json({ error: 'Non puoi aggiungere partecipanti alla chat generale' });
    }
    
    // Verifica che il nuovo partecipante sia admin o socio
    const [nuovoPartecipante] = await sequelize.query(
      `SELECT id, ruolo, categoria_socio FROM users WHERE id = :id AND attivo = true`,
      {
        replacements: { id: user_id },
        type: QueryTypes.SELECT
      }
    );
    
    if (!nuovoPartecipante) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }
    
    const nuovoPartecipanteCategoria = nuovoPartecipante.categoria_socio || nuovoPartecipante.ruolo;
    if (!categoriePermesse.includes(nuovoPartecipanteCategoria) && nuovoPartecipante.ruolo !== 'admin') {
      return res.status(403).json({ error: 'L\'utente deve essere admin o socio' });
    }
    
    // Aggiungi partecipante
    await sequelize.query(
      `INSERT INTO partecipanti_gruppo (gruppo_id, user_id, ruolo, aggiunto_da)
       VALUES (:gruppoId, :userId, 'membro', :aggiuntoDa)
       ON CONFLICT (gruppo_id, user_id) DO NOTHING`,
      {
        replacements: {
          gruppoId,
          userId: user_id,
          aggiuntoDa: req.user.id
        },
        type: QueryTypes.INSERT
      }
    );
    
    logger.info(`Partecipante aggiunto al gruppo ${gruppoId} da ${req.user.email}`);
    
    res.json({ message: 'Partecipante aggiunto con successo' });
  } catch (error) {
    logger.error('Errore aggiunta partecipante:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiunta del partecipante' });
  }
};

/**
 * DELETE /api/v1/messaggi/gruppi/:gruppoId
 * Elimina gruppo (solo admin)
 */
const eliminaGruppo = async (req, res) => {
  try {
    const { gruppoId } = req.params;
    
    // Solo admin possono eliminare gruppi
    if (req.user.ruolo !== 'admin') {
      return res.status(403).json({ error: 'Solo gli amministratori possono eliminare gruppi' });
    }
    
    // Verifica che il gruppo esista
    const [gruppo] = await sequelize.query(
      'SELECT id, nome FROM gruppi_chat WHERE id = :gruppoId',
      {
        replacements: { gruppoId },
        type: QueryTypes.SELECT
      }
    );
    
    if (!gruppo) {
      return res.status(404).json({ error: 'Gruppo non trovato' });
    }
    
    // Non permettere eliminazione della chat generale
    const [gruppoCheck] = await sequelize.query(
      'SELECT tipo_gruppo FROM gruppi_chat WHERE id = :gruppoId',
      {
        replacements: { gruppoId },
        type: QueryTypes.SELECT
      }
    );
    
    if (gruppoCheck && gruppoCheck.tipo_gruppo === 'generale') {
      return res.status(400).json({ error: 'Non puoi eliminare la chat generale' });
    }
    
    // Elimina il gruppo (CASCADE eliminerà partecipanti e messaggi)
    await sequelize.query(
      'DELETE FROM gruppi_chat WHERE id = :gruppoId',
      {
        replacements: { gruppoId },
        type: QueryTypes.DELETE
      }
    );
    
    logger.info(`Gruppo ${gruppoId} eliminato da ${req.user.email}`);
    
    res.json({ message: 'Gruppo eliminato con successo' });
  } catch (error) {
    logger.error('Errore eliminazione gruppo:', error);
    res.status(500).json({ error: 'Errore durante l\'eliminazione del gruppo' });
  }
};

/**
 * POST /api/v1/messaggi/gruppi/:gruppoId/foto
 * Cambia foto profilo del gruppo (solo admin del gruppo o admin generale)
 */
const cambiaFotoGruppo = async (req, res) => {
  try {
    const { gruppoId } = req.params;
    
    if (!req.file) {
      return res.status(400).json({ error: 'File immagine obbligatorio' });
    }
    
    // Solo admin possono modificare i gruppi
    if (req.user.ruolo !== 'admin') {
      return res.status(403).json({ error: 'Solo gli admin possono modificare i gruppi' });
    }
    
    // Verifica che il gruppo esista
    const [gruppo] = await sequelize.query(
      `SELECT g.*, 
       EXISTS (
         SELECT 1 FROM partecipanti_gruppo pg 
         WHERE pg.gruppo_id = g.id AND pg.user_id = :userId AND pg.ruolo = 'admin'
       ) as is_admin
       FROM gruppi_chat g
       WHERE g.id = :gruppoId`,
      {
        replacements: { gruppoId, userId: req.user.id },
        type: QueryTypes.SELECT
      }
    );
    
    if (!gruppo) {
      return res.status(404).json({ error: 'Gruppo non trovato' });
    }
    
    // Solo admin possono cambiare la foto dei gruppi
    if (req.user.ruolo !== 'admin') {
      return res.status(403).json({ error: 'Solo gli admin possono cambiare la foto del gruppo' });
    }
    
    const fotoPath = `/uploads/gruppi/${req.file.filename}`;
    
    // Elimina vecchia foto se esiste
    if (gruppo.foto_profilo) {
      const fs = require('fs');
      const path = require('path');
      const oldPath = path.join(process.env.UPLOAD_PATH || './uploads', gruppo.foto_profilo.replace('/uploads/', ''));
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }
    
    // Aggiorna foto profilo
    await sequelize.query(
      `UPDATE gruppi_chat 
       SET foto_profilo = :fotoPath, updated_at = CURRENT_TIMESTAMP
       WHERE id = :gruppoId`,
      {
        replacements: { fotoPath, gruppoId },
        type: QueryTypes.UPDATE
      }
    );
    
    logger.info(`Foto profilo cambiata per gruppo ${gruppoId} da ${req.user.email}`);
    
    res.json({ 
      message: 'Foto profilo aggiornata con successo',
      foto_profilo: fotoPath
    });
  } catch (error) {
    logger.error('Errore cambio foto gruppo:', error);
    res.status(500).json({ error: 'Errore durante il cambio della foto profilo' });
  }
};

/**
 * DELETE /api/v1/messaggi/gruppi/:gruppoId/partecipanti/:userId
 * Rimuovi partecipante dal gruppo (solo admin del gruppo o admin generale)
 */
const rimuoviPartecipante = async (req, res) => {
  try {
    const { gruppoId, userId } = req.params;
    
    // Solo admin possono rimuovere partecipanti dai gruppi
    if (req.user.ruolo !== 'admin') {
      return res.status(403).json({ error: 'Solo gli admin possono rimuovere partecipanti dai gruppi' });
    }
    
    // Verifica che il gruppo esista
    const [gruppo] = await sequelize.query(
      `SELECT g.*
       FROM gruppi_chat g
       WHERE g.id = :gruppoId`,
      {
        replacements: { gruppoId },
        type: QueryTypes.SELECT
      }
    );
    
    if (!gruppo) {
      return res.status(404).json({ error: 'Gruppo non trovato' });
    }
    
    if (gruppo.tipo_gruppo === 'generale') {
      return res.status(400).json({ error: 'Non puoi rimuovere partecipanti dalla chat generale' });
    }
    
    // Non permettere di rimuovere se stessi se si è l'unico admin
    if (userId === req.user.id) {
      const [adminCount] = await sequelize.query(
        `SELECT COUNT(*) as count 
         FROM partecipanti_gruppo 
         WHERE gruppo_id = :gruppoId AND ruolo = 'admin'`,
        {
          replacements: { gruppoId },
          type: QueryTypes.SELECT
        }
      );
      
      if (parseInt(adminCount.count) <= 1) {
        return res.status(400).json({ error: 'Non puoi rimuovere l\'unico admin del gruppo' });
      }
    }
    
    // Rimuovi partecipante
    await sequelize.query(
      'DELETE FROM partecipanti_gruppo WHERE gruppo_id = :gruppoId AND user_id = :userId',
      {
        replacements: { gruppoId, userId },
        type: QueryTypes.DELETE
      }
    );
    
    logger.info(`Partecipante ${userId} rimosso dal gruppo ${gruppoId} da ${req.user.email}`);
    
    res.json({ message: 'Partecipante rimosso con successo' });
  } catch (error) {
    logger.error('Errore rimozione partecipante:', error);
    res.status(500).json({ error: 'Errore durante la rimozione del partecipante' });
  }
};

/**
 * DELETE /api/v1/messaggi/:id
 * Elimina un messaggio (solo il mittente può eliminarlo)
 */
const eliminaMessaggio = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    // Verifica che l'utente sia admin o socio
    const userCategoria = req.user.categoria_socio || req.user.ruolo;
    const categoriePermesse = ['admin', 'volontario', 'ordinario'];
    if (!categoriePermesse.includes(userCategoria) && req.user.ruolo !== 'admin') {
      return res.status(403).json({ error: 'Solo admin e soci possono eliminare messaggi' });
    }
    
    // Verifica che il messaggio esista e che l'utente sia il mittente
    const [messaggio] = await sequelize.query(
      `SELECT id, mittente_id, eliminato FROM messaggi_interni WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );
    
    if (!messaggio) {
      return res.status(404).json({ error: 'Messaggio non trovato' });
    }
    
    if (messaggio.eliminato) {
      return res.status(400).json({ error: 'Messaggio già eliminato' });
    }
    
    // Solo il mittente può eliminare il messaggio (o admin)
    if (messaggio.mittente_id !== userId && req.user.ruolo !== 'admin') {
      return res.status(403).json({ error: 'Puoi eliminare solo i tuoi messaggi' });
    }
    
    // Soft delete: marca come eliminato
    await sequelize.query(
      `UPDATE messaggi_interni 
       SET eliminato = true, data_eliminazione = CURRENT_TIMESTAMP
       WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.UPDATE }
    );
    
    logger.info(`Messaggio ${id} eliminato da ${req.user.email}`);
    
    res.json({ message: 'Messaggio eliminato con successo' });
  } catch (error) {
    logger.error('Errore eliminazione messaggio:', error);
    res.status(500).json({ error: 'Errore durante l\'eliminazione del messaggio' });
  }
};

/**
 * PUT /api/v1/messaggi/:id
 * Modifica un messaggio (solo il mittente può modificarlo, entro 10 minuti)
 */
const modificaMessaggio = async (req, res) => {
  try {
    const { id } = req.params;
    const { contenuto } = req.body;
    const userId = req.user.id;
    
    if (!contenuto || !contenuto.trim()) {
      return res.status(400).json({ error: 'Contenuto obbligatorio' });
    }
    
    // Verifica che l'utente sia admin o socio
    const userCategoria = req.user.categoria_socio || req.user.ruolo;
    const categoriePermesse = ['admin', 'volontario', 'ordinario'];
    if (!categoriePermesse.includes(userCategoria) && req.user.ruolo !== 'admin') {
      return res.status(403).json({ error: 'Solo admin e soci possono modificare messaggi' });
    }
    
    // Verifica che il messaggio esista e che l'utente sia il mittente
    const [messaggio] = await sequelize.query(
      `SELECT id, mittente_id, contenuto, created_at, crittografato, iv, chiave_ephemeral, eliminato
       FROM messaggi_interni 
       WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );
    
    if (!messaggio) {
      return res.status(404).json({ error: 'Messaggio non trovato' });
    }
    
    if (messaggio.eliminato) {
      return res.status(400).json({ error: 'Non puoi modificare un messaggio eliminato' });
    }
    
    // Solo il mittente può modificare il messaggio (o admin)
    if (messaggio.mittente_id !== userId && req.user.ruolo !== 'admin') {
      return res.status(403).json({ error: 'Puoi modificare solo i tuoi messaggi' });
    }
    
    // Verifica che non siano passati più di 10 minuti
    const dataInvio = new Date(messaggio.created_at);
    const dataOra = new Date();
    const minutiTrascorsi = (dataOra.getTime() - dataInvio.getTime()) / (1000 * 60);
    
    if (minutiTrascorsi > 10 && req.user.ruolo !== 'admin') {
      return res.status(400).json({ error: 'Non puoi modificare un messaggio dopo 10 minuti dall\'invio' });
    }
    
    // Aggiorna il messaggio
    await sequelize.query(
      `UPDATE messaggi_interni 
       SET contenuto = :contenuto, modificato = true, data_modifica = CURRENT_TIMESTAMP
       WHERE id = :id`,
      { replacements: { id, contenuto: contenuto.trim() }, type: QueryTypes.UPDATE }
    );
    
    // Recupera il messaggio aggiornato
    const [messaggioAggiornato] = await sequelize.query(
      `SELECT * FROM messaggi_interni WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );
    
    logger.info(`Messaggio ${id} modificato da ${req.user.email}`);
    
    res.json({ 
      message: 'Messaggio modificato con successo',
      messaggio: messaggioAggiornato
    });
  } catch (error) {
    logger.error('Errore modifica messaggio:', error);
    res.status(500).json({ error: 'Errore durante la modifica del messaggio' });
  }
};

/**
 * DELETE /api/v1/messaggi/conversazione/:conversazioneId/reset
 * Resetta una conversazione (elimina tutti i messaggi, solo per admin o mittente)
 */
const resettaChat = async (req, res) => {
  try {
    logger.info('=== RESET CHAT CHIAMATO ===');
    logger.info('Params:', JSON.stringify(req.params));
    logger.info('User:', JSON.stringify({ id: req.user?.id, email: req.user?.email, ruolo: req.user?.ruolo }));
    
    const { conversazioneId } = req.params;
    const userId = req.user.id;
    
    logger.info(`Tentativo reset chat: conversazioneId=${conversazioneId}, userId=${userId}`);
    
    if (!conversazioneId) {
      logger.error('ID conversazione mancante!');
      return res.status(400).json({ error: 'ID conversazione mancante' });
    }
    
    // Solo admin possono resettare le chat
    if (req.user.ruolo !== 'admin') {
      return res.status(403).json({ error: 'Solo gli admin possono resettare le chat' });
    }
    
    // Verifica se è un gruppo o una conversazione privata
    logger.info(`Verifica se ${conversazioneId} è un gruppo...`);
    const gruppoResult = await sequelize.query(
      `SELECT id, tipo_gruppo, creatore_id 
       FROM gruppi_chat 
       WHERE id = :conversazioneId`,
      { replacements: { conversazioneId }, type: QueryTypes.SELECT }
    );
    
    const gruppo = gruppoResult && gruppoResult.length > 0 ? gruppoResult[0] : null;
    logger.info(`Risultato verifica gruppo: ${gruppo ? 'trovato' : 'non trovato'}`);
    
    if (gruppo) {
      // È un gruppo: solo admin può resettare
      logger.info(`È un gruppo. User: ${userId}, Ruolo: ${req.user.ruolo}`);
      
      // Elimina tutti i messaggi del gruppo
      logger.info(`Eliminazione messaggi del gruppo ${conversazioneId}...`);
      logger.info(`Eseguendo UPDATE con conversazioneId: ${conversazioneId}`);
      try {
        const result = await sequelize.query(
          `UPDATE messaggi_interni 
           SET eliminato = true, data_eliminazione = CURRENT_TIMESTAMP
           WHERE gruppo_id = :conversazioneId AND eliminato = false`,
          { replacements: { conversazioneId }, type: QueryTypes.UPDATE }
        );
        logger.info(`Query UPDATE eseguita con successo. Risultato:`, result);
        logger.info(`Reset gruppo ${conversazioneId} completato`);
      } catch (sqlError) {
        logger.error(`Errore SQL durante UPDATE:`, sqlError);
        logger.error(`SQL Error message:`, sqlError.message);
        logger.error(`SQL Error stack:`, sqlError.stack);
        throw sqlError;
      }
    } else {
      // È una conversazione privata: solo admin può resettare
      logger.info(`Verifica conversazione privata ${conversazioneId}...`);
      
      // Elimina tutti i messaggi della conversazione
      logger.info(`Eliminazione messaggi della conversazione ${conversazioneId}...`);
      logger.info(`Eseguendo UPDATE con conversazioneId: ${conversazioneId}`);
      try {
        const result = await sequelize.query(
          `UPDATE messaggi_interni 
           SET eliminato = true, data_eliminazione = CURRENT_TIMESTAMP
           WHERE conversazione_id = :conversazioneId AND eliminato = false`,
          { replacements: { conversazioneId }, type: QueryTypes.UPDATE }
        );
        logger.info(`Query UPDATE eseguita con successo. Risultato:`, result);
        logger.info(`Reset conversazione privata ${conversazioneId} completato`);
      } catch (sqlError) {
        logger.error(`Errore SQL durante UPDATE:`, sqlError);
        logger.error(`SQL Error message:`, sqlError.message);
        logger.error(`SQL Error stack:`, sqlError.stack);
        throw sqlError;
      }
    }
    
    logger.info(`Chat ${conversazioneId} resettata da ${req.user.email}`);
    
    res.json({ message: 'Chat resettata con successo' });
  } catch (error) {
    logger.error('=== ERRORE RESET CHAT ===');
    logger.error('Error name:', error.name);
    logger.error('Error message:', error.message);
    logger.error('Error stack:', error.stack);
    logger.error('Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    res.status(500).json({ 
      error: 'Errore durante il reset della chat', 
      details: error.message,
      name: error.name
    });
  }
};

module.exports = {
  getMessaggi,
  getMessaggioById,
  inviaMessaggio,
  getMessaggiNonLetti,
  getConversazioni,
  getConversazione,
  creaGruppo,
  eliminaGruppo,
  getPartecipantiGruppo,
  aggiungiPartecipante,
  rimuoviPartecipante,
  cambiaFotoGruppo,
  eliminaMessaggio,
  modificaMessaggio,
  resettaChat
};

