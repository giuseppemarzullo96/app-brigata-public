const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');
const logger = require('../utils/logger');

/**
 * GET /api/v1/turni/slot-liberi
 * Slot ancora liberi nei prossimi turni, con ricetta e data, utile per generare
 * contenuti promozionali (es. storie Instagram) che chiedono aiuto ai volontari.
 */
const getSlotLiberi = async (req, res) => {
  try {
    const limitTurni = parseInt(req.query.limitTurni, 10) || 8;

    const slot = await sequelize.query(
      `SELECT
        s.id AS slot_id, s.tipo_slot, s.numero_porzioni,
        t.id AS turno_id, t.data_turno, t.tipo_turno,
        r.nome_ricetta, r.note_alimentari
       FROM slot_turno s
       JOIN turni_cucina t ON t.id = s.turno_id
       LEFT JOIN ricettari r ON r.id = s.ricettario_id
       WHERE s.stato = 'libero' AND t.data_turno >= CURRENT_DATE
       AND t.id IN (
         SELECT id FROM turni_cucina WHERE data_turno >= CURRENT_DATE
         ORDER BY data_turno ASC LIMIT :limitTurni
       )
       ORDER BY t.data_turno ASC, s.tipo_slot`,
      { replacements: { limitTurni }, type: QueryTypes.SELECT }
    );

    res.json({ slot });
  } catch (error) {
    logger.error('Errore recupero slot liberi:', error);
    res.status(500).json({ error: 'Errore durante il recupero degli slot liberi' });
  }
};

/**
 * GET /api/v1/turni
 * Lista turni con filtri opzionali (data inizio, data fine)
 */
const getTurni = async (req, res) => {
  try {
    const { dataInizio, dataFine, tipoTurno, limit } = req.query;
    
    // `scoperti` dice QUALI portate mancano, non solo quante: e' la
    // differenza fra "11/14" e "mancano 3 posti di frutta", cioe' fra un
    // numero e una cosa che qualcuno puo' andare a fare.
    let query = `
      SELECT 
        t.*,
        COUNT(DISTINCT s.id) as totale_slot,
        COUNT(DISTINCT CASE WHEN s.stato = 'assegnato' THEN s.id END) as slot_assegnati,
        m.scoperti
      FROM turni_cucina t
      LEFT JOIN slot_turno s ON t.id = s.turno_id
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object('tipo', x.tipo_slot, 'liberi', x.liberi)
                        ORDER BY x.liberi DESC, x.tipo_slot) AS scoperti
        FROM (
          SELECT tipo_slot, COUNT(*)::int AS liberi
          FROM slot_turno
          WHERE turno_id = t.id AND stato <> 'assegnato'
          GROUP BY tipo_slot
        ) x
      ) m ON true
      WHERE 1=1
    `;
    
    const replacements = {};
    
    if (dataInizio) {
      query += ' AND t.data_turno >= :dataInizio';
      replacements.dataInizio = dataInizio;
    }
    
    if (dataFine) {
      query += ' AND t.data_turno <= :dataFine';
      replacements.dataFine = dataFine;
    }
    
    if (tipoTurno) {
      query += ' AND t.tipo_turno = :tipoTurno';
      replacements.tipoTurno = tipoTurno;
    }
    
    query += ' GROUP BY t.id, m.scoperti ORDER BY t.data_turno ASC, t.tipo_turno';

    const parsedLimit = parseInt(limit, 10);
    if (Number.isInteger(parsedLimit) && parsedLimit > 0) {
      query += ' LIMIT :limit';
      replacements.limit = parsedLimit;
    }

    const turni = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });
    
    res.json({ turni });
  } catch (error) {
    logger.error('Errore recupero turni:', error);
    res.status(500).json({ error: 'Errore durante il recupero dei turni' });
  }
};

/**
 * GET /api/v1/turni/:id
 * Dettaglio turno con slot
 */
const getTurnoById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Valida formato UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ error: 'ID turno non valido' });
    }
    
    // Recupera turno
    const [turno] = await sequelize.query(
      'SELECT * FROM turni_cucina WHERE id = :id',
      {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (!turno) {
      return res.status(404).json({ error: 'Turno non trovato' });
    }
    
    // Recupera slot con ricette
    const slot = await sequelize.query(
      `SELECT 
        s.*,
        u.nome as volontario_nome,
        u.cognome as volontario_cognome,
        u.ragione_sociale as volontario_ragione_sociale,
        u.email as volontario_email,
        r.id as ricetta_id,
        r.nome_ricetta,
        r.descrizione as ricetta_descrizione,
        r.ingredienti as ricetta_ingredienti,
        r.istruzioni as ricetta_istruzioni,
        r.porzioni as ricetta_porzioni,
        r.note_alimentari as ricetta_note_alimentari
       FROM slot_turno s
       LEFT JOIN users u ON s.user_id = u.id
       LEFT JOIN ricettari r ON s.ricettario_id = r.id
       WHERE s.turno_id = :turnoId
       ORDER BY s.tipo_slot`,
      {
        replacements: { turnoId: id },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    res.json({ turno, slot });
  } catch (error) {
    logger.error('Errore recupero turno:', error);
    res.status(500).json({ error: 'Errore durante il recupero del turno' });
  }
};

/**
 * POST /api/v1/turni
 * Crea nuovo turno
 */
const createTurno = async (req, res) => {
  try {
    const { data_turno, tipo_turno, numero_porzioni, note_generali } = req.body;
    
    if (!data_turno || !tipo_turno) {
      return res.status(400).json({ error: 'Data e tipo turno obbligatori' });
    }
    
    // Verifica turno già esistente
    const [existing] = await sequelize.query(
      'SELECT id FROM turni_cucina WHERE data_turno = :dataTurno AND tipo_turno = :tipoTurno',
      {
        replacements: { dataTurno: data_turno, tipoTurno: tipo_turno },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (existing) {
      return res.status(400).json({ error: 'Turno già esistente per questa data e tipo' });
    }
    
    // Crea turno
    const result = await sequelize.query(
      `INSERT INTO turni_cucina (data_turno, tipo_turno, numero_porzioni, note_generali, created_by)
       VALUES (:dataTurno, :tipoTurno, :numeroPorzioni, :noteGenerali, :createdBy)
       RETURNING *`,
      {
        replacements: {
          dataTurno: data_turno,
          tipoTurno: tipo_turno,
          numeroPorzioni: numero_porzioni || null,
          noteGenerali: note_generali || null,
          createdBy: req.user.id
        },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (!result || result.length === 0) {
      return res.status(500).json({ error: 'Errore durante la creazione del turno' });
    }
    
    const turnoCreato = result[0];
    
    logger.info(`Turno creato: ${data_turno} - ${tipo_turno} da ${req.user.email} (ID: ${turnoCreato.id})`);
    
    res.status(201).json({ turno: turnoCreato });
  } catch (error) {
    logger.error('Errore creazione turno:', error);
    res.status(500).json({ error: 'Errore durante la creazione del turno' });
  }
};

/**
 * PUT /api/v1/turni/:id
 * Aggiorna turno
 */
const updateTurno = async (req, res) => {
  try {
    const { id } = req.params;
    const { data_turno, tipo_turno, numero_porzioni, note_generali } = req.body;
    
    const [turno] = await sequelize.query(
      'SELECT id FROM turni_cucina WHERE id = :id',
      {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (!turno) {
      return res.status(404).json({ error: 'Turno non trovato' });
    }
    
    // Aggiorna
    await sequelize.query(
      `UPDATE turni_cucina 
       SET data_turno = COALESCE(:dataTurno, data_turno),
           tipo_turno = COALESCE(:tipoTurno, tipo_turno),
           numero_porzioni = COALESCE(:numeroPorzioni, numero_porzioni),
           note_generali = COALESCE(:noteGenerali, note_generali),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :id`,
      {
        replacements: {
          id,
          // Sequelize rifiuta i valori undefined: senza questi fallback un
          // aggiornamento parziale (per esempio le sole porzioni) fallirebbe
          // con un 500 invece di lasciare invariati gli altri campi, che e'
          // proprio quello che COALESCE serve a fare.
          dataTurno: data_turno ?? null,
          tipoTurno: tipo_turno ?? null,
          numeroPorzioni: numero_porzioni ?? null,
          noteGenerali: note_generali ?? null
        },
        type: sequelize.QueryTypes.UPDATE
      }
    );
    
    res.json({ message: 'Turno aggiornato con successo' });
  } catch (error) {
    logger.error('Errore aggiornamento turno:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento del turno' });
  }
};

/**
 * DELETE /api/v1/turni/:id
 * Elimina turno
 */
const deleteTurno = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verifica esistenza
    const [turno] = await sequelize.query(
      'SELECT id FROM turni_cucina WHERE id = :id',
      {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (!turno) {
      return res.status(404).json({ error: 'Turno non trovato' });
    }
    
    // Elimina prima le partecipazioni_attivita associate (per evitare foreign key constraint)
    await sequelize.query(
      'DELETE FROM partecipazioni_attivita WHERE turno_id = :id',
      {
        replacements: { id },
        type: sequelize.QueryTypes.DELETE
      }
    );
    
    // Elimina il turno (CASCADE eliminerà anche gli slot e le ricette associate al turno)
    await sequelize.query(
      'DELETE FROM turni_cucina WHERE id = :id',
      {
        replacements: { id },
        type: sequelize.QueryTypes.DELETE
      }
    );
    
    logger.info(`Turno ${id} eliminato con successo da ${req.user.email}`);
    res.json({ message: 'Turno eliminato con successo' });
  } catch (error) {
    logger.error('Errore eliminazione turno:', error);
    res.status(500).json({ error: 'Errore durante l\'eliminazione del turno' });
  }
};

/**
 * POST /api/v1/turni/:turnoId/slot/:slotId/prenota
 * Prenota slot (volontari)
 */
const prenotaSlot = async (req, res) => {
  try {
    const { turnoId, slotId } = req.params;
    
    // Verifica slot
    const [slot] = await sequelize.query(
      'SELECT * FROM slot_turno WHERE id = :slotId AND turno_id = :turnoId',
      {
        replacements: { slotId, turnoId },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (!slot) {
      return res.status(404).json({ error: 'Slot non trovato' });
    }
    
    if (slot.stato === 'assegnato') {
      return res.status(400).json({ error: 'Slot già assegnato' });
    }
    
    // Assegna slot
    await sequelize.query(
      `UPDATE slot_turno 
       SET user_id = :userId, stato = 'assegnato', updated_at = CURRENT_TIMESTAMP
       WHERE id = :slotId`,
      {
        replacements: { userId: req.user.id, slotId },
        type: sequelize.QueryTypes.UPDATE
      }
    );
    
    // Registra partecipazione
    await sequelize.query(
      `INSERT INTO partecipazioni_attivita (user_id, tipo_attivita, data_attivita, turno_id, slot_id)
       VALUES (:userId, 'cucina', (SELECT data_turno FROM turni_cucina WHERE id = :turnoId), :turnoId, :slotId)`,
      {
        replacements: { userId: req.user.id, turnoId, slotId },
        type: sequelize.QueryTypes.INSERT
      }
    );
    
    res.json({ message: 'Slot prenotato con successo' });
  } catch (error) {
    logger.error('Errore prenotazione slot:', error);
    res.status(500).json({ error: 'Errore durante la prenotazione dello slot' });
  }
};

/**
 * DELETE /api/v1/turni/:turnoId/slot/:slotId/libera
 * Libera slot
 */
const liberaSlot = async (req, res) => {
  try {
    const { turnoId, slotId } = req.params;
    
    // Verifica slot e permessi (il proprio slot, oppure admin e gestori cucine)
    const [slot] = await sequelize.query(
      'SELECT * FROM slot_turno WHERE id = :slotId AND turno_id = :turnoId',
      {
        replacements: { slotId, turnoId },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (!slot) {
      return res.status(404).json({ error: 'Slot non trovato' });
    }
    
    if (slot.user_id !== req.user.id && !['admin', 'gestore_cucine'].includes(req.user.ruolo)) {
      return res.status(403).json({ error: 'Non puoi liberare questo slot' });
    }
    
    // Libera slot
    await sequelize.query(
      `UPDATE slot_turno 
       SET user_id = NULL, stato = 'libero', updated_at = CURRENT_TIMESTAMP
       WHERE id = :slotId`,
      {
        replacements: { slotId },
        type: sequelize.QueryTypes.UPDATE
      }
    );
    
    res.json({ message: 'Slot liberato con successo' });
  } catch (error) {
    logger.error('Errore liberazione slot:', error);
    res.status(500).json({ error: 'Errore durante la liberazione dello slot' });
  }
};

/**
 * POST /api/v1/turni/:turnoId/slot/:slotId/assegna
 * Assegna slot manualmente (solo admin)
 */
const assegnaSlot = async (req, res) => {
  try {
    const { turnoId, slotId } = req.params;
    const { user_id } = req.body;
    
    // Verifica slot
    const [slot] = await sequelize.query(
      'SELECT * FROM slot_turno WHERE id = :slotId AND turno_id = :turnoId',
      {
        replacements: { slotId, turnoId },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (!slot) {
      return res.status(404).json({ error: 'Slot non trovato' });
    }
    
    // Se user_id non è specificato, libera lo slot
    if (!user_id) {
      await sequelize.query(
        `UPDATE slot_turno 
         SET user_id = NULL, stato = 'libero', updated_at = CURRENT_TIMESTAMP
         WHERE id = :slotId`,
        {
          replacements: { slotId },
          type: sequelize.QueryTypes.UPDATE
        }
      );
      
      return res.json({ message: 'Slot liberato con successo' });
    }
    
    // Verifica utente
    const [utente] = await sequelize.query(
      'SELECT id, nome, cognome FROM users WHERE id = :userId AND attivo = true',
      {
        replacements: { userId: user_id },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (!utente) {
      return res.status(404).json({ error: 'Utente non trovato o non attivo' });
    }
    
    // Assegna slot
    await sequelize.query(
      `UPDATE slot_turno 
       SET user_id = :userId, stato = 'assegnato', updated_at = CURRENT_TIMESTAMP
       WHERE id = :slotId`,
      {
        replacements: { userId: user_id, slotId },
        type: sequelize.QueryTypes.UPDATE
      }
    );
    
    // Verifica se esiste già una partecipazione per questo slot
    const [partecipazioneEsistente] = await sequelize.query(
      'SELECT id FROM partecipazioni_attivita WHERE slot_id = :slotId AND user_id = :userId',
      {
        replacements: { slotId, userId: user_id },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    // Registra partecipazione solo se non esiste già
    if (!partecipazioneEsistente) {
      await sequelize.query(
        `INSERT INTO partecipazioni_attivita (user_id, tipo_attivita, data_attivita, turno_id, slot_id)
         VALUES (:userId, 'cucina', (SELECT data_turno FROM turni_cucina WHERE id = :turnoId), :turnoId, :slotId)`,
        {
          replacements: { userId: user_id, turnoId, slotId },
          type: sequelize.QueryTypes.INSERT
        }
      );
    }
    
    logger.info(`Slot ${slotId} assegnato a ${utente.nome} ${utente.cognome} da admin ${req.user.email}`);
    
    res.json({ 
      message: 'Slot assegnato con successo',
      utente: {
        id: utente.id,
        nome: utente.nome,
        cognome: utente.cognome
      }
    });
  } catch (error) {
    logger.error('Errore assegnazione slot:', error);
    res.status(500).json({ error: 'Errore durante l\'assegnazione dello slot' });
  }
};

/**
 * GET /api/v1/turni/:id/ricettario
 * Recupera ricettario turno
 */
const getRicettario = async (req, res) => {
  try {
    // Verifica che il path sia effettivamente /ricettario e non /slot
    // Express matcha /:id/ricettario anche con /:id/slot, quindi dobbiamo verificare
    if (req.originalUrl.includes('/slot') || !req.originalUrl.includes('/ricettario')) {
      return res.status(404).json({ error: 'Route non trovata' });
    }
    
    const { id } = req.params;
    
    const ricettari = await sequelize.query(
      'SELECT * FROM ricettari WHERE turno_id = :turnoId ORDER BY created_at',
      {
        replacements: { turnoId: id },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    res.json({ ricettari });
  } catch (error) {
    logger.error('Errore recupero ricettario:', error);
    res.status(500).json({ error: 'Errore durante il recupero del ricettario' });
  }
};

/**
 * POST /api/v1/turni/:turnoId/slot
 * Crea nuovo slot (solo admin)
 */
const createSlot = async (req, res) => {
  try {
    const { turnoId } = req.params;
    const { tipo_slot, numero_porzioni, note } = req.body;
    
    logger.info(`[createSlot] Richiesta ricevuta - URL: ${req.originalUrl}, Path: ${req.path}`, { 
      turnoId, 
      tipo_slot, 
      numero_porzioni, 
      note,
      body: req.body 
    });
    
    if (!tipo_slot) {
      logger.warn(`[createSlot] Tipo slot mancante per turno ${turnoId}`);
      return res.status(400).json({ error: 'Tipo slot obbligatorio' });
    }
    
    // Verifica turno
    const [turno] = await sequelize.query(
      'SELECT id FROM turni_cucina WHERE id = :turnoId',
      {
        replacements: { turnoId },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (!turno) {
      return res.status(404).json({ error: 'Turno non trovato' });
    }
    
    // Crea slot
    const result = await sequelize.query(
      `INSERT INTO slot_turno (turno_id, tipo_slot, numero_porzioni, note, stato, created_at, updated_at)
       VALUES (:turnoId, :tipoSlot, :numeroPorzioni, :note, 'libero', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      {
        replacements: {
          turnoId,
          tipoSlot: tipo_slot,
          numeroPorzioni: numero_porzioni || null,
          note: note || null
        },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (!result || result.length === 0) {
      return res.status(500).json({ error: 'Errore durante la creazione dello slot' });
    }
    
    res.status(201).json({ slot: result[0] });
  } catch (error) {
    logger.error('Errore creazione slot:', error);
    res.status(500).json({ error: 'Errore durante la creazione dello slot' });
  }
};

/**
 * DELETE /api/v1/turni/:turnoId/slot/:slotId
 * Elimina un singolo slot (solo admin e gestore cucine)
 */
const deleteSlot = async (req, res) => {
  try {
    const { turnoId, slotId } = req.params;

    const [slot] = await sequelize.query(
      'SELECT id, stato, user_id FROM slot_turno WHERE id = :slotId AND turno_id = :turnoId',
      {
        replacements: { slotId, turnoId },
        type: QueryTypes.SELECT
      }
    );

    if (!slot) {
      return res.status(404).json({ error: 'Slot non trovato' });
    }

    // Uno slot con sopra il nome di qualcuno non si cancella alle sue spalle:
    // prima va liberato, così la scelta di togliere il posto è esplicita.
    if (slot.user_id || slot.stato !== 'libero') {
      return res.status(409).json({
        error: 'Lo slot è assegnato: liberalo prima di eliminarlo'
      });
    }

    // Uno slot prenotato e poi liberato lascia la riga in partecipazioni_attivita,
    // che referenzia slot_turno senza ON DELETE: va tolta prima dello slot.
    await sequelize.query(
      'DELETE FROM partecipazioni_attivita WHERE slot_id = :slotId',
      {
        replacements: { slotId },
        type: QueryTypes.DELETE
      }
    );

    await sequelize.query(
      'DELETE FROM slot_turno WHERE id = :slotId',
      {
        replacements: { slotId },
        type: QueryTypes.DELETE
      }
    );

    logger.info(`Slot ${slotId} del turno ${turnoId} eliminato da ${req.user.email}`);
    res.json({ message: 'Slot eliminato con successo' });
  } catch (error) {
    logger.error('Errore eliminazione slot:', error);
    res.status(500).json({ error: 'Errore durante l\'eliminazione dello slot' });
  }
};

/**
 * POST /api/v1/turni/:id/ricettario
 * Salva ricettario
 */
const saveRicettario = async (req, res) => {
  try {
    // Verifica che il path sia effettivamente /ricettario e non /slot
    // Express matcha /:id/ricettario anche con /:id/slot, quindi dobbiamo verificare
    logger.info(`[saveRicettario] Richiesta ricevuta - URL: ${req.originalUrl}, Path: ${req.path}`, { 
      params: req.params,
      body: req.body 
    });
    
    if (req.originalUrl.includes('/slot') || !req.originalUrl.includes('/ricettario')) {
      logger.warn(`[saveRicettario] Route non valida - URL: ${req.originalUrl}`);
      return res.status(404).json({ error: 'Route non trovata' });
    }
    
    const { id } = req.params;
    const { nome_ricetta, descrizione, ingredienti, istruzioni, porzioni, note_alimentari } = req.body;
    
    if (!nome_ricetta) {
      return res.status(400).json({ error: 'Nome ricetta obbligatorio' });
    }
    
    // Verifica turno
    const [turno] = await sequelize.query(
      'SELECT id FROM turni_cucina WHERE id = :turnoId',
      {
        replacements: { turnoId: id },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (!turno) {
      return res.status(404).json({ error: 'Turno non trovato' });
    }
    
    // Crea/aggiorna ricettario
    const [result] = await sequelize.query(
      `INSERT INTO ricettari (turno_id, nome_ricetta, descrizione, ingredienti, istruzioni, porzioni, note_alimentari, created_by)
       VALUES (:turnoId, :nomeRicetta, :descrizione, :ingredienti, :istruzioni, :porzioni, :noteAlimentari, :createdBy)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      {
        replacements: {
          turnoId: id,
          nomeRicetta: nome_ricetta,
          descrizione: descrizione || null,
          ingredienti: ingredienti ? JSON.stringify(ingredienti) : null,
          istruzioni: istruzioni || null,
          porzioni: porzioni || null,
          noteAlimentari: note_alimentari || null,
          createdBy: req.user.id
        },
        type: sequelize.QueryTypes.INSERT
      }
    );
    
    res.status(201).json({ ricettario: result[0] || { message: 'Ricettario già esistente' } });
  } catch (error) {
    logger.error('Errore salvataggio ricettario:', error);
    res.status(500).json({ error: 'Errore durante il salvataggio del ricettario' });
  }
};

/**
 * POST /api/v1/turni/:turnoId/slot/:slotId/duplica
 * Duplica uno slot (solo admin)
 */
const duplicaSlot = async (req, res) => {
  try {
    const { turnoId, slotId } = req.params;
    
    // Recupera lo slot da duplicare
    const [slotOriginale] = await sequelize.query(
      `SELECT tipo_slot, numero_porzioni, note, ricettario_id
       FROM slot_turno 
       WHERE id = :slotId AND turno_id = :turnoId`,
      {
        replacements: { slotId, turnoId },
        type: QueryTypes.SELECT
      }
    );
    
    if (!slotOriginale) {
      return res.status(404).json({ error: 'Slot non trovato' });
    }
    
    // Verifica che il turno esista
    const [turno] = await sequelize.query(
      'SELECT id FROM turni_cucina WHERE id = :turnoId',
      {
        replacements: { turnoId },
        type: QueryTypes.SELECT
      }
    );
    
    if (!turno) {
      return res.status(404).json({ error: 'Turno non trovato' });
    }
    
    // Crea slot duplicato (sempre libero, senza user_id)
    const result = await sequelize.query(
      `INSERT INTO slot_turno (turno_id, tipo_slot, numero_porzioni, note, ricettario_id, stato, created_at, updated_at)
       VALUES (:turnoId, :tipoSlot, :numeroPorzioni, :note, :ricettarioId, 'libero', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      {
        replacements: {
          turnoId,
          tipoSlot: slotOriginale.tipo_slot,
          numeroPorzioni: slotOriginale.numero_porzioni || null,
          note: slotOriginale.note || null,
          ricettarioId: slotOriginale.ricettario_id || null
        },
        type: QueryTypes.SELECT
      }
    );
    
    if (!result || result.length === 0) {
      return res.status(500).json({ error: 'Errore durante la duplicazione dello slot' });
    }
    
    logger.info(`Slot ${slotId} duplicato nel turno ${turnoId} da ${req.user.email}`);
    res.status(201).json({ slot: result[0] });
  } catch (error) {
    logger.error('Errore duplicazione slot:', error);
    res.status(500).json({ error: 'Errore durante la duplicazione dello slot' });
  }
};

/**
 * POST /api/v1/turni/:turnoId/slot/:slotId/ricetta
 * Associa ricetta a slot
 */
const associaRicettaSlot = async (req, res) => {
  try {
    const { turnoId, slotId } = req.params;
    const { ricettario_id } = req.body;
    
    // Verifica slot
    const [slot] = await sequelize.query(
      'SELECT id FROM slot_turno WHERE id = :slotId AND turno_id = :turnoId',
      {
        replacements: { slotId, turnoId },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (!slot) {
      return res.status(404).json({ error: 'Slot non trovato' });
    }
    
    // Se ricettario_id è null, rimuove l'associazione
    if (!ricettario_id) {
      await sequelize.query(
        'UPDATE slot_turno SET ricettario_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = :slotId',
        {
          replacements: { slotId },
          type: sequelize.QueryTypes.UPDATE
        }
      );
      return res.json({ message: 'Ricetta rimossa dallo slot' });
    }
    
    // Verifica che la ricetta esista
    const [ricetta] = await sequelize.query(
      'SELECT id FROM ricettari WHERE id = :ricettarioId',
      {
        replacements: { ricettarioId: ricettario_id },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (!ricetta) {
      return res.status(404).json({ error: 'Ricetta non trovata' });
    }
    
    // Associa ricetta
    await sequelize.query(
      'UPDATE slot_turno SET ricettario_id = :ricettarioId, updated_at = CURRENT_TIMESTAMP WHERE id = :slotId',
      {
        replacements: { ricettarioId: ricettario_id, slotId },
        type: sequelize.QueryTypes.UPDATE
      }
    );
    
    res.json({ message: 'Ricetta associata allo slot con successo' });
  } catch (error) {
    logger.error('Errore associazione ricetta:', error);
    res.status(500).json({ error: 'Errore durante l\'associazione della ricetta' });
  }
};

module.exports = {
  getSlotLiberi,
  getTurni,
  getTurnoById,
  createTurno,
  updateTurno,
  deleteTurno,
  createSlot,
  deleteSlot,
  prenotaSlot,
  liberaSlot,
  assegnaSlot,
  getRicettario,
  saveRicettario,
  associaRicettaSlot,
  duplicaSlot
};

