const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');
const logger = require('../utils/logger');
const { linkAvviso, rigaWhatsapp, rigaEmail } = require('../utils/link');
const { notificaDestinatari } = require('../utils/notifiche');

/**
 * GET /api/v1/avvisi
 * Lista avvisi (filtrati per destinatari)
 */
const getAvvisi = async (req, res) => {
  try {
    const { priorita, pubblicato } = req.query;
    
    let query = `
      SELECT 
        a.*,
        u.nome as creatore_nome,
        u.cognome as creatore_cognome
      FROM avvisi a
      LEFT JOIN users u ON a.created_by = u.id
      WHERE 1=1
    `;
    
    const replacements = {};
    
    // Filtra per destinatari se non admin
    if (req.user.ruolo !== 'admin') {
      query += ` AND (
        a.destinatari IS NULL 
        OR a.destinatari::jsonb @> :categoriaJson::jsonb
        OR a.destinatari::jsonb @> '["tutti"]'::jsonb
        OR a.destinatari::jsonb @> :utenteJson::jsonb
      )`;
      replacements.categoriaJson = JSON.stringify([req.user.categoria_socio]);
      // Un avviso puo' essere indirizzato anche a persone precise ("utente:<id>"),
      // per esempio l'invito a pagare la quota, che riguarda solo chi non l'ha pagata.
      replacements.utenteJson = JSON.stringify([`utente:${req.user.id}`]);
    }
    
    // Solo avvisi pubblicati per utenti non admin
    if (req.user.ruolo !== 'admin') {
      query += ' AND a.pubblicato = true';
      query += ' AND (a.data_scadenza IS NULL OR a.data_scadenza >= CURRENT_TIMESTAMP)';
    } else if (pubblicato !== undefined) {
      query += ' AND a.pubblicato = :pubblicato';
      replacements.pubblicato = pubblicato === 'true';
    }
    
    if (priorita) {
      query += ' AND a.priorita = :priorita';
      replacements.priorita = priorita;
    }
    
    query += ' ORDER BY a.priorita DESC, a.created_at DESC';
    
    const avvisi = await sequelize.query(query, {
      replacements,
      type: QueryTypes.SELECT
    });
    
    // Per ogni avviso, verifica se è stato letto dall'utente corrente
    if (req.user && avvisi.length > 0) {
      const avvisiIds = avvisi.map(a => a.id);
      if (avvisiIds.length > 0) {
        const placeholders = avvisiIds.map((_, i) => `:id${i}`).join(',');
        const replacements = { userId: req.user.id };
        avvisiIds.forEach((id, i) => {
          replacements[`id${i}`] = id;
        });
        
        const letture = await sequelize.query(
          `SELECT avviso_id FROM avvisi_letture WHERE user_id = :userId AND avviso_id IN (${placeholders})`,
          {
            replacements,
            type: QueryTypes.SELECT
          }
        );
        
        const lettureIds = new Set(letture.map(l => l.avviso_id));
        avvisi.forEach(avviso => {
          avviso.letto = lettureIds.has(avviso.id);
        });
      }
    }
    
    res.json({ avvisi });
  } catch (error) {
    logger.error('Errore recupero avvisi:', error);
    res.status(500).json({ error: 'Errore durante il recupero degli avvisi' });
  }
};

/**
 * GET /api/v1/avvisi/:id
 * Dettaglio avviso
 */
const getAvvisoById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [avviso] = await sequelize.query(
      `SELECT a.*, u.nome as creatore_nome, u.cognome as creatore_cognome
       FROM avvisi a
       LEFT JOIN users u ON a.created_by = u.id
       WHERE a.id = :id`,
      {
        replacements: { id },
        type: QueryTypes.SELECT
      }
    );
    
    if (!avviso) {
      return res.status(404).json({ error: 'Avviso non trovato' });
    }
    
    // Verifica permessi (solo admin o se pubblicato e destinatario corretto)
    if (req.user.ruolo !== 'admin') {
      if (!avviso.pubblicato) {
        return res.status(403).json({ error: 'Avviso non pubblicato' });
      }
      
      const destinatari = avviso.destinatari || [];
      if (destinatari.length > 0 && 
          !destinatari.includes('tutti') && 
          !destinatari.includes(req.user.categoria_socio) &&
          !destinatari.includes(`utente:${req.user.id}`)) {
        return res.status(403).json({ error: 'Accesso negato' });
      }
    }
    
    // Marca come letto se non già letto (solo se pubblicato)
    if (req.user && avviso.pubblicato) {
      await sequelize.query(
        `INSERT INTO avvisi_letture (avviso_id, user_id, data_lettura)
         VALUES (:avvisoId, :userId, CURRENT_TIMESTAMP)
         ON CONFLICT (avviso_id, user_id) DO NOTHING`,
        {
          replacements: { avvisoId: id, userId: req.user.id },
          type: QueryTypes.INSERT
        }
      );
      avviso.letto = true;
    }
    
    // Se admin, aggiungi informazioni sulle letture
    if (req.user.ruolo === 'admin') {
      const letture = await sequelize.query(
        `SELECT COUNT(*) as count FROM avvisi_letture WHERE avviso_id = :avvisoId`,
        {
          replacements: { avvisoId: id },
          type: QueryTypes.SELECT
        }
      );
      avviso.numero_letture = parseInt(letture[0]?.count || 0);
    }
    
    res.json({ avviso });
  } catch (error) {
    logger.error('Errore recupero avviso:', error);
    res.status(500).json({ error: 'Errore durante il recupero dell\'avviso' });
  }
};

/**
 * POST /api/v1/avvisi
 * Crea avviso
 */
const createAvviso = async (req, res) => {
  try {
    const {
      titolo,
      contenuto,
      priorita,
      destinatari,
      data_scadenza
    } = req.body;
    
    if (!titolo || !contenuto) {
      return res.status(400).json({ error: 'Titolo e contenuto obbligatori' });
    }
    
    const [result] = await sequelize.query(
      `INSERT INTO avvisi (
        titolo, contenuto, priorita, destinatari, data_scadenza, created_by
      ) VALUES (
        :titolo, :contenuto, :priorita, :destinatari, :dataScadenza, :createdBy
      ) RETURNING *`,
      {
        replacements: {
          titolo,
          contenuto,
          priorita: priorita || 'normale',
          destinatari: destinatari ? JSON.stringify(destinatari) : null,
          dataScadenza: data_scadenza || null,
          createdBy: req.user.id
        },
        type: sequelize.QueryTypes.INSERT
      }
    );
    
    logger.info(`Avviso creato: ${titolo} da ${req.user.email}`);
    
    res.status(201).json({ avviso: result[0] });
  } catch (error) {
    logger.error('Errore creazione avviso:', error);
    res.status(500).json({ error: 'Errore durante la creazione dell\'avviso' });
  }
};

/**
 * PUT /api/v1/avvisi/:id
 * Aggiorna avviso
 */
const updateAvviso = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      titolo,
      contenuto,
      priorita,
      destinatari,
      data_scadenza
    } = req.body;
    
    await sequelize.query(
      `UPDATE avvisi 
       SET titolo = COALESCE(:titolo, titolo),
           contenuto = COALESCE(:contenuto, contenuto),
           priorita = COALESCE(:priorita, priorita),
           destinatari = COALESCE(:destinatari, destinatari),
           data_scadenza = COALESCE(:dataScadenza, data_scadenza),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :id`,
      {
        replacements: {
          id,
          titolo,
          contenuto,
          priorita,
          destinatari: destinatari ? JSON.stringify(destinatari) : null,
          dataScadenza: data_scadenza
        },
        type: QueryTypes.UPDATE
      }
    );
    
    res.json({ message: 'Avviso aggiornato con successo' });
  } catch (error) {
    logger.error('Errore aggiornamento avviso:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento dell\'avviso' });
  }
};

/**
 * DELETE /api/v1/avvisi/:id
 * Elimina avviso
 */
const deleteAvviso = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verifica che l'avviso esista
    const [avviso] = await sequelize.query(
      'SELECT id FROM avvisi WHERE id = :id',
      {
        replacements: { id },
        type: QueryTypes.SELECT
      }
    );
    
    if (!avviso) {
      return res.status(404).json({ error: 'Avviso non trovato' });
    }
    
    // Elimina l'avviso (CASCADE eliminerà anche le letture)
    await sequelize.query(
      'DELETE FROM avvisi WHERE id = :id',
      {
        replacements: { id },
        type: QueryTypes.DELETE
      }
    );
    
    logger.info(`Avviso ${id} eliminato da ${req.user.email}`);
    
    res.json({ message: 'Avviso eliminato con successo' });
  } catch (error) {
    logger.error('Errore eliminazione avviso:', error);
    res.status(500).json({ error: 'Errore durante l\'eliminazione dell\'avviso' });
  }
};

/**
 * POST /api/v1/avvisi/:id/pubblica
 * Pubblica avviso
 */
const pubblicaAvviso = async (req, res) => {
  try {
    const { id } = req.params;

    await sequelize.query(
      `UPDATE avvisi
       SET pubblicato = true, data_pubblicazione = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = :id`,
      {
        replacements: { id },
        type: QueryTypes.UPDATE
      }
    );

    const [avviso] = await sequelize.query(
      'SELECT titolo, contenuto, destinatari FROM avvisi WHERE id = :id',
      { replacements: { id }, type: QueryTypes.SELECT }
    );

    if (avviso) {
      const destinatari = avviso.destinatari || null;
      const url = linkAvviso(id);
      notificaDestinatari(destinatari, {
        subject: `Nuovo avviso: ${avviso.titolo}`,
        titolo: avviso.titolo,
        corpoHtml: `<p style="white-space: pre-wrap;">${avviso.contenuto}</p>` + rigaEmail(url, 'Leggi l\'avviso'),
        testoWhatsapp: `📢 *La Brigata ODV*\n\n*${avviso.titolo}*\n\n${avviso.contenuto}` + rigaWhatsapp(url, 'Leggi l\'avviso'),
      }).catch((err) => logger.error('Errore invio notifiche avviso:', err));
    }

    res.json({ message: 'Avviso pubblicato con successo' });
  } catch (error) {
    logger.error('Errore pubblicazione avviso:', error);
    res.status(500).json({ error: 'Errore durante la pubblicazione dell\'avviso' });
  }
};

/**
 * POST /api/v1/avvisi/:id/segna-letto
 * Segna avviso come letto
 */
const segnaLetto = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verifica che l'avviso esista
    const [avviso] = await sequelize.query(
      'SELECT id FROM avvisi WHERE id = :id',
      {
        replacements: { id },
        type: QueryTypes.SELECT
      }
    );
    
    if (!avviso) {
      return res.status(404).json({ error: 'Avviso non trovato' });
    }
    
    // Marca come letto
    await sequelize.query(
      `INSERT INTO avvisi_letture (avviso_id, user_id, data_lettura)
       VALUES (:avvisoId, :userId, CURRENT_TIMESTAMP)
       ON CONFLICT (avviso_id, user_id) DO UPDATE SET data_lettura = CURRENT_TIMESTAMP`,
      {
        replacements: { avvisoId: id, userId: req.user.id },
        type: QueryTypes.INSERT
      }
    );
    
    res.json({ message: 'Avviso segnato come letto' });
  } catch (error) {
    logger.error('Errore segnatura lettura avviso:', error);
    res.status(500).json({ error: 'Errore durante la segnatura della lettura' });
  }
};

/**
 * GET /api/v1/avvisi/:id/letture
 * Lista utenti che hanno letto l'avviso (solo admin)
 */
const getLettureAvviso = async (req, res) => {
  try {
    const { id } = req.params;
    
    const letture = await sequelize.query(
      `SELECT 
        al.*,
        u.nome,
        u.cognome,
        u.email,
        u.categoria_socio
       FROM avvisi_letture al
       JOIN users u ON al.user_id = u.id
       WHERE al.avviso_id = :avvisoId
       ORDER BY al.data_lettura DESC`,
      {
        replacements: { avvisoId: id },
        type: QueryTypes.SELECT
      }
    );
    
    res.json({ letture });
  } catch (error) {
    logger.error('Errore recupero letture avviso:', error);
    res.status(500).json({ error: 'Errore durante il recupero delle letture' });
  }
};

module.exports = {
  getAvvisi,
  getAvvisoById,
  createAvviso,
  updateAvviso,
  deleteAvviso,
  pubblicaAvviso,
  segnaLetto,
  getLettureAvviso
};
