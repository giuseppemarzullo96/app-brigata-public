const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');
const logger = require('../utils/logger');
const { linkSondaggio, rigaWhatsapp, rigaEmail } = require('../utils/link');
const { exportSondaggioCSV } = require('../utils/exportUtils');
const { notificaDestinatari } = require('../utils/notifiche');

/**
 * GET /api/v1/sondaggi
 * Lista sondaggi
 */
const getSondaggi = async (req, res) => {
  try {
    const { stato, destinatari } = req.query;
    
    let query = `
      SELECT 
        s.*,
        COUNT(DISTINCT r.user_id) as totale_risposte,
        u.nome as creatore_nome,
        u.cognome as creatore_cognome
      FROM sondaggi s
      LEFT JOIN risposte_sondaggio r ON s.id = r.sondaggio_id
      LEFT JOIN users u ON s.created_by = u.id
      WHERE 1=1
    `;
    
    const replacements = {};
    
    if (stato) {
      query += ' AND s.stato = :stato';
      replacements.stato = stato;
    }
    
    // Filtra per destinatari (se l'utente non è admin)
    if (req.user.ruolo !== 'admin' && req.user.categoria_socio) {
      query += ` AND (
        s.destinatari IS NULL 
        OR s.destinatari::jsonb @> :categoriaJson::jsonb
        OR s.destinatari::jsonb @> '["tutti"]'::jsonb
      )`;
      replacements.categoriaJson = JSON.stringify([req.user.categoria_socio]);
    }
    
    query += ' GROUP BY s.id, u.nome, u.cognome ORDER BY s.created_at DESC';
    
    const sondaggi = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });
    
    res.json({ sondaggi });
  } catch (error) {
    logger.error('Errore recupero sondaggi:', error);
    res.status(500).json({ error: 'Errore durante il recupero dei sondaggi' });
  }
};

/**
 * GET /api/v1/sondaggi/:id
 * Dettaglio sondaggio
 */
const getSondaggioById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [sondaggio] = await sequelize.query(
      `SELECT s.*, u.nome as creatore_nome, u.cognome as creatore_cognome
       FROM sondaggi s
       LEFT JOIN users u ON s.created_by = u.id
       WHERE s.id = :id`,
      {
        replacements: { id },
        type: QueryTypes.SELECT
      }
    );
    
    if (!sondaggio) {
      return res.status(404).json({ error: 'Sondaggio non trovato' });
    }
    
    // Recupera opzioni
    const opzioni = await sequelize.query(
      'SELECT * FROM opzioni_sondaggio WHERE sondaggio_id = :id ORDER BY ordine',
      {
        replacements: { id },
        type: QueryTypes.SELECT
      }
    );
    
    // Verifica se l'utente ha già risposto (può avere più risposte se permetti_multiple_risposte)
    let rispostaUtente = null;
    if (req.user) {
      const risposte = await sequelize.query(
        `SELECT * FROM risposte_sondaggio 
         WHERE sondaggio_id = :id AND user_id = :userId`,
        {
          replacements: { id, userId: req.user.id },
          type: QueryTypes.SELECT
        }
      );
      // Se permetti_multiple_risposte, restituisci array, altrimenti singola risposta
      if (sondaggio.permetti_multiple_risposte) {
        rispostaUtente = risposte.length > 0 ? risposte : null;
      } else {
        rispostaUtente = risposte.length > 0 ? risposte[0] : null;
      }
    }
    
    res.json({ sondaggio, opzioni, risposta_utente: rispostaUtente });
  } catch (error) {
    logger.error('Errore recupero sondaggio:', error);
    res.status(500).json({ error: 'Errore durante il recupero del sondaggio' });
  }
};

/**
 * POST /api/v1/sondaggi
 * Crea sondaggio
 */
const createSondaggio = async (req, res) => {
  try {
    const {
      titolo,
      descrizione,
      tipo_sondaggio,
      destinatari,
      opzioni,
      risultati_visibili,
      permetti_multiple_risposte
    } = req.body;
    
    if (!titolo) {
      return res.status(400).json({ error: 'Titolo obbligatorio' });
    }
    
    // Crea sondaggio
    const [sondaggioResult] = await sequelize.query(
      `INSERT INTO sondaggi (
        titolo, descrizione, tipo_sondaggio, destinatari, risultati_visibili, permetti_multiple_risposte, created_by
      ) VALUES (
        :titolo, :descrizione, :tipoSondaggio, :destinatari, :risultatiVisibili, :permettiMultipleRisposte, :createdBy
      ) RETURNING *`,
      {
        replacements: {
          titolo,
          descrizione: descrizione || null,
          tipoSondaggio: tipo_sondaggio || 'scelta_multipla',
          destinatari: destinatari ? JSON.stringify(destinatari) : null,
          risultatiVisibili: risultati_visibili || false,
          permettiMultipleRisposte: permetti_multiple_risposte || false,
          createdBy: req.user.id
        },
        type: QueryTypes.INSERT
      }
    );
    
    const sondaggioId = sondaggioResult[0].id;
    
    // Crea opzioni se presenti
    if (opzioni && Array.isArray(opzioni) && opzioni.length > 0) {
      for (let i = 0; i < opzioni.length; i++) {
        await sequelize.query(
          `INSERT INTO opzioni_sondaggio (sondaggio_id, testo_opzione, ordine)
           VALUES (:sondaggioId, :testo, :ordine)`,
          {
            replacements: {
              sondaggioId,
              testo: opzioni[i].testo || opzioni[i],
              ordine: i
            },
            type: QueryTypes.INSERT
          }
        );
      }
    }
    
    const sondaggio = sondaggioResult[0];
    
    // Crea automaticamente un avviso per tutti i destinatari
    try {
      // Costruisci il contenuto dell'avviso
      let contenutoAvviso = `È stato creato un nuovo sondaggio:\n\n`;
      contenutoAvviso += `📊 ${titolo}\n`;
      if (descrizione) {
        contenutoAvviso += `\n${descrizione}\n\n`;
      }
      contenutoAvviso += `Partecipa al sondaggio per esprimere la tua opinione!`;
      
      // Determina i destinatari (stessi del sondaggio o tutti se non specificati)
      const destinatariAvviso = destinatari && destinatari.length > 0 
        ? destinatari 
        : ['volontario', 'ordinario'];
      
      // Crea l'avviso
      await sequelize.query(
        `INSERT INTO avvisi (
          titolo, contenuto, priorita, destinatari, pubblicato, data_pubblicazione, sondaggio_id, created_by
        ) VALUES (
          :titolo, :contenuto, :priorita, :destinatari, true, CURRENT_TIMESTAMP, :sondaggioId, :createdBy
        ) RETURNING *`,
        {
          replacements: {
            titolo: `Nuovo Sondaggio: ${titolo}`,
            contenuto: contenutoAvviso,
            priorita: 'normale',
            destinatari: JSON.stringify(destinatariAvviso),
            sondaggioId: sondaggioId,
            createdBy: req.user.id
          },
          type: QueryTypes.INSERT
        }
      );
      
      logger.info(`Avviso creato automaticamente per sondaggio ${sondaggioId}`);

      const url = linkSondaggio(sondaggioId);
      notificaDestinatari(destinatariAvviso, {
        subject: `Nuovo sondaggio: ${titolo}`,
        titolo: `Nuovo Sondaggio: ${titolo}`,
        corpoHtml: `<p style="white-space: pre-wrap;">${contenutoAvviso}</p>` + rigaEmail(url, 'Rispondi al sondaggio'),
        testoWhatsapp: `📊 *La Brigata ODV*\n\n${contenutoAvviso}` + rigaWhatsapp(url, 'Rispondi al sondaggio'),
      }).catch((err) => logger.error('Errore invio notifiche sondaggio:', err));
    } catch (avvisoError) {
      // Non bloccare la creazione del sondaggio se l'avviso fallisce
      logger.error('Errore creazione avviso per sondaggio:', avvisoError);
    }
    
    logger.info(`Sondaggio creato: ${titolo} da ${req.user.email}`);
    
    res.status(201).json({ sondaggio });
  } catch (error) {
    logger.error('Errore creazione sondaggio:', error);
    res.status(500).json({ error: 'Errore durante la creazione del sondaggio' });
  }
};

/**
 * PUT /api/v1/sondaggi/:id
 * Aggiorna sondaggio
 */
const updateSondaggio = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      titolo,
      descrizione,
      stato,
      data_chiusura,
      risultati_visibili
    } = req.body;
    
    await sequelize.query(
      `UPDATE sondaggi 
       SET titolo = COALESCE(:titolo, titolo),
           descrizione = COALESCE(:descrizione, descrizione),
           stato = COALESCE(:stato, stato),
           data_chiusura = COALESCE(:dataChiusura, data_chiusura),
           risultati_visibili = COALESCE(:risultatiVisibili, risultati_visibili),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :id`,
      {
        replacements: {
          id,
          titolo,
          descrizione,
          stato,
          dataChiusura: data_chiusura,
          risultatiVisibili: risultati_visibili
        },
        type: QueryTypes.UPDATE
      }
    );
    
    res.json({ message: 'Sondaggio aggiornato con successo' });
  } catch (error) {
    logger.error('Errore aggiornamento sondaggio:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento del sondaggio' });
  }
};

/**
 * DELETE /api/v1/sondaggi/:id
 * Elimina sondaggio
 */
const deleteSondaggio = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verifica che il sondaggio esista
    const [sondaggio] = await sequelize.query(
      'SELECT id FROM sondaggi WHERE id = :id',
      {
        replacements: { id },
        type: QueryTypes.SELECT
      }
    );
    
    if (!sondaggio) {
      return res.status(404).json({ error: 'Sondaggio non trovato' });
    }
    
    // Elimina prima le risposte (CASCADE dovrebbe gestirlo, ma meglio essere espliciti)
    await sequelize.query(
      'DELETE FROM risposte_sondaggio WHERE sondaggio_id = :id',
      {
        replacements: { id },
        type: QueryTypes.DELETE
      }
    );
    
    // Elimina le opzioni
    await sequelize.query(
      'DELETE FROM opzioni_sondaggio WHERE sondaggio_id = :id',
      {
        replacements: { id },
        type: QueryTypes.DELETE
      }
    );
    
    // Elimina il sondaggio (CASCADE eliminerà anche gli avvisi collegati)
    await sequelize.query(
      'DELETE FROM sondaggi WHERE id = :id',
      {
        replacements: { id },
        type: QueryTypes.DELETE
      }
    );
    
    logger.info(`Sondaggio ${id} eliminato da ${req.user.email}`);
    
    res.json({ message: 'Sondaggio eliminato con successo' });
  } catch (error) {
    logger.error('Errore eliminazione sondaggio:', error);
    res.status(500).json({ error: 'Errore durante l\'eliminazione del sondaggio' });
  }
};

/**
 * POST /api/v1/sondaggi/:id/pubblica
 * Pubblica sondaggio
 */
const pubblicaSondaggio = async (req, res) => {
  try {
    const { id } = req.params;
    
    await sequelize.query(
      `UPDATE sondaggi 
       SET stato = 'aperto', data_apertura = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = :id`,
      {
        replacements: { id },
        type: QueryTypes.UPDATE
      }
    );
    
    res.json({ message: 'Sondaggio pubblicato con successo' });
  } catch (error) {
    logger.error('Errore pubblicazione sondaggio:', error);
    res.status(500).json({ error: 'Errore durante la pubblicazione del sondaggio' });
  }
};

/**
 * POST /api/v1/sondaggi/:id/chiudi
 * Chiudi sondaggio
 */
const chiudiSondaggio = async (req, res) => {
  try {
    const { id } = req.params;
    
    await sequelize.query(
      `UPDATE sondaggi 
       SET stato = 'chiuso', data_chiusura = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = :id`,
      {
        replacements: { id },
        type: QueryTypes.UPDATE
      }
    );
    
    logger.info(`Sondaggio ${id} chiuso da ${req.user.email}`);
    res.json({ message: 'Sondaggio chiuso con successo' });
  } catch (error) {
    logger.error('Errore chiusura sondaggio:', error);
    res.status(500).json({ error: 'Errore durante la chiusura del sondaggio' });
  }
};

/**
 * POST /api/v1/sondaggi/:id/rispondi
 * Rispondi a sondaggio
 */
const rispondiSondaggio = async (req, res) => {
  try {
    const { id } = req.params;
    const { opzione_id, opzione_ids, risposta_testo } = req.body;
    
    // Verifica sondaggio esiste e è aperto
    const [sondaggio] = await sequelize.query(
      `SELECT * FROM sondaggi 
       WHERE id = :id AND stato = 'aperto' 
       AND (data_chiusura IS NULL OR data_chiusura >= CURRENT_TIMESTAMP)`,
      {
        replacements: { id },
        type: QueryTypes.SELECT
      }
    );
    
    if (!sondaggio) {
      return res.status(400).json({ error: 'Sondaggio non trovato o non aperto' });
    }
    
    // Gestisci risposte multiple o singola
    if (sondaggio.permetti_multiple_risposte && sondaggio.tipo_sondaggio === 'scelta_multipla') {
      // Risposte multiple: array di opzione_ids
      const opzioniIds = opzione_ids || (opzione_id ? [opzione_id] : []);
      
      if (opzioniIds.length === 0) {
        return res.status(400).json({ error: 'Seleziona almeno un\'opzione' });
      }
      
      // Elimina risposte precedenti dell'utente per questo sondaggio
      await sequelize.query(
        `DELETE FROM risposte_sondaggio 
         WHERE sondaggio_id = :sondaggioId AND user_id = :userId`,
        {
          replacements: { sondaggioId: id, userId: req.user.id },
          type: QueryTypes.DELETE
        }
      );
      
      // Inserisci tutte le risposte selezionate
      for (const opzioneId of opzioniIds) {
        await sequelize.query(
          `INSERT INTO risposte_sondaggio (sondaggio_id, user_id, opzione_id, risposta_testo)
           VALUES (:sondaggioId, :userId, :opzioneId, null)`,
          {
            replacements: {
              sondaggioId: id,
              userId: req.user.id,
              opzioneId: opzioneId
            },
            type: QueryTypes.INSERT
          }
        );
      }
      
      res.json({ message: `Risposte registrate con successo (${opzioniIds.length} selezioni)` });
    } else {
      // Risposta singola
      // Verifica se ha già risposto
      const [rispostaEsistente] = await sequelize.query(
        `SELECT id FROM risposte_sondaggio 
         WHERE sondaggio_id = :id AND user_id = :userId`,
        {
          replacements: { id, userId: req.user.id },
          type: QueryTypes.SELECT
        }
      );
      
      if (rispostaEsistente) {
        return res.status(400).json({ error: 'Hai già risposto a questo sondaggio' });
      }
      
      // Inserisci risposta
      await sequelize.query(
        `INSERT INTO risposte_sondaggio (sondaggio_id, user_id, opzione_id, risposta_testo)
         VALUES (:sondaggioId, :userId, :opzioneId, :rispostaTesto)`,
        {
          replacements: {
            sondaggioId: id,
            userId: req.user.id,
            opzioneId: opzione_id || null,
            rispostaTesto: risposta_testo || null
          },
          type: QueryTypes.INSERT
        }
      );
      
      res.json({ message: 'Risposta registrata con successo' });
    }
  } catch (error) {
    logger.error('Errore registrazione risposta:', error);
    res.status(500).json({ error: 'Errore durante la registrazione della risposta' });
  }
};

/**
 * GET /api/v1/sondaggi/:id/risultati
 * Risultati sondaggio
 */
const getRisultati = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verifica sondaggio
    const [sondaggio] = await sequelize.query(
      'SELECT * FROM sondaggi WHERE id = :id',
      {
        replacements: { id },
        type: QueryTypes.SELECT
      }
    );
    
    if (!sondaggio) {
      return res.status(404).json({ error: 'Sondaggio non trovato' });
    }
    
    // Verifica permessi (solo admin o se risultati_visibili = true)
    if (req.user.ruolo !== 'admin' && !sondaggio.risultati_visibili) {
      return res.status(403).json({ error: 'Risultati non visibili' });
    }
    
    if (sondaggio.tipo_sondaggio === 'scelta_multipla') {
      // Risultati per scelta multipla
      const risultati = await sequelize.query(
        `SELECT 
          o.id,
          o.testo_opzione,
          COUNT(r.id) as voti,
          ROUND(COUNT(r.id) * 100.0 / NULLIF((SELECT COUNT(*) FROM risposte_sondaggio WHERE sondaggio_id = :id), 0), 2) as percentuale
         FROM opzioni_sondaggio o
         LEFT JOIN risposte_sondaggio r ON o.id = r.opzione_id
         WHERE o.sondaggio_id = :id
         GROUP BY o.id, o.testo_opzione
         ORDER BY o.ordine`,
        {
          replacements: { id },
          type: QueryTypes.SELECT
        }
      );
      
      const totaleRisposte = await sequelize.query(
        'SELECT COUNT(*) as totale FROM risposte_sondaggio WHERE sondaggio_id = :id',
        {
          replacements: { id },
          type: QueryTypes.SELECT
        }
      );
      
      res.json({
        risultati,
        totale_risposte: parseInt(totaleRisposte[0].totale)
      });
    } else {
      // Risultati per testo libero
      const risposte = await sequelize.query(
        `SELECT r.risposta_testo, r.created_at, u.nome, u.cognome
         FROM risposte_sondaggio r
         JOIN users u ON r.user_id = u.id
         WHERE r.sondaggio_id = :id
         ORDER BY r.created_at DESC`,
        {
          replacements: { id },
          type: QueryTypes.SELECT
        }
      );
      
      res.json({
        risposte,
        totale_risposte: risposte.length
      });
    }
  } catch (error) {
    logger.error('Errore recupero risultati:', error);
    res.status(500).json({ error: 'Errore durante il recupero dei risultati' });
  }
};

/**
 * GET /api/v1/sondaggi/:id/export
 * Esporta risultati (CSV)
 */
const exportRisultati = async (req, res) => {
  try {
    const { id } = req.params;
    const { format = 'csv' } = req.query;
    
    // Recupera sondaggio e risultati
    const [sondaggio] = await sequelize.query(
      'SELECT * FROM sondaggi WHERE id = :id',
      {
        replacements: { id },
        type: QueryTypes.SELECT
      }
    );
    
    if (!sondaggio) {
      return res.status(404).json({ error: 'Sondaggio non trovato' });
    }
    
    if (format === 'csv') {
      const risultati = await getRisultatiData(id, sondaggio);
      const csv = exportSondaggioCSV(sondaggio, risultati);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="sondaggio_${id}_risultati.csv"`);
      res.send(csv);
    } else {
      res.status(400).json({ error: 'Formato non supportato. Usa format=csv' });
    }
  } catch (error) {
    logger.error('Errore export risultati:', error);
    res.status(500).json({ error: 'Errore durante l\'export dei risultati' });
  }
};

// Helper per recuperare dati risultati
async function getRisultatiData(id, sondaggio) {
  if (sondaggio.tipo_sondaggio === 'scelta_multipla') {
    const risultati = await sequelize.query(
      `SELECT 
        o.id,
        o.testo_opzione,
        COUNT(r.id) as voti,
        ROUND(COUNT(r.id) * 100.0 / NULLIF((SELECT COUNT(*) FROM risposte_sondaggio WHERE sondaggio_id = :id), 0), 2) as percentuale
       FROM opzioni_sondaggio o
       LEFT JOIN risposte_sondaggio r ON o.id = r.opzione_id
       WHERE o.sondaggio_id = :id
       GROUP BY o.id, o.testo_opzione
       ORDER BY o.ordine`,
      {
        replacements: { id },
        type: QueryTypes.SELECT
      }
    );
    
    const totaleRisposte = await sequelize.query(
      'SELECT COUNT(*) as totale FROM risposte_sondaggio WHERE sondaggio_id = :id',
      {
        replacements: { id },
        type: QueryTypes.SELECT
      }
    );
    
    return {
      risultati,
      totale_risposte: parseInt(totaleRisposte[0].totale)
    };
  }
  return { risultati: [], totale_risposte: 0 };
}

module.exports = {
  getSondaggi,
  getSondaggioById,
  createSondaggio,
  updateSondaggio,
  deleteSondaggio,
  pubblicaSondaggio,
  chiudiSondaggio,
  rispondiSondaggio,
  getRisultati,
  exportRisultati
};
