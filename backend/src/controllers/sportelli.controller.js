const { sequelize } = require('../config/database');
const logger = require('../utils/logger');

/**
 * GET /api/v1/sportelli
 * Lista sportelli
 */
const getSportelli = async (req, res) => {
  try {
    const sportelli = await sequelize.query(
      `SELECT 
        s.*,
        u.nome as responsabile_nome,
        u.cognome as responsabile_cognome
       FROM sportelli_specialistici s
       LEFT JOIN users u ON s.responsabile_id = u.id
       ORDER BY s.nome`,
      { type: sequelize.QueryTypes.SELECT }
    );
    
    res.json({ sportelli });
  } catch (error) {
    logger.error('Errore recupero sportelli:', error);
    res.status(500).json({ error: 'Errore durante il recupero degli sportelli' });
  }
};

/**
 * GET /api/v1/sportelli/:id
 * Dettaglio sportello
 */
const getSportelloById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [sportello] = await sequelize.query(
      `SELECT s.*, u.nome as responsabile_nome, u.cognome as responsabile_cognome
       FROM sportelli_specialistici s
       LEFT JOIN users u ON s.responsabile_id = u.id
       WHERE s.id = :id`,
      {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (!sportello) {
      return res.status(404).json({ error: 'Sportello non trovato' });
    }
    
    res.json({ sportello });
  } catch (error) {
    logger.error('Errore recupero sportello:', error);
    res.status(500).json({ error: 'Errore durante il recupero dello sportello' });
  }
};

/**
 * POST /api/v1/sportelli
 * Crea sportello
 */
const createSportello = async (req, res) => {
  try {
    const { nome, descrizione, responsabile_id } = req.body;
    
    if (!nome) {
      return res.status(400).json({ error: 'Nome sportello obbligatorio' });
    }
    
    const [result] = await sequelize.query(
      `INSERT INTO sportelli_specialistici (nome, descrizione, responsabile_id)
       VALUES (:nome, :descrizione, :responsabileId) RETURNING *`,
      {
        replacements: {
          nome,
          descrizione: descrizione || null,
          responsabileId: responsabile_id || null
        },
        type: sequelize.QueryTypes.INSERT
      }
    );
    
    res.status(201).json({ sportello: result[0] });
  } catch (error) {
    logger.error('Errore creazione sportello:', error);
    res.status(500).json({ error: 'Errore durante la creazione dello sportello' });
  }
};

/**
 * PUT /api/v1/sportelli/:id
 * Aggiorna sportello
 */
const updateSportello = async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, descrizione, responsabile_id, attivo } = req.body;
    
    await sequelize.query(
      `UPDATE sportelli_specialistici 
       SET nome = COALESCE(:nome, nome),
           descrizione = COALESCE(:descrizione, descrizione),
           responsabile_id = COALESCE(:responsabileId, responsabile_id),
           attivo = COALESCE(:attivo, attivo)
       WHERE id = :id`,
      {
        replacements: {
          id,
          nome,
          descrizione,
          responsabileId: responsabile_id,
          attivo
        },
        type: sequelize.QueryTypes.UPDATE
      }
    );
    
    res.json({ message: 'Sportello aggiornato con successo' });
  } catch (error) {
    logger.error('Errore aggiornamento sportello:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento dello sportello' });
  }
};

/**
 * GET /api/v1/sportelli/:id/appuntamenti
 * Lista appuntamenti sportello
 */
const getAppuntamenti = async (req, res) => {
  try {
    const { id } = req.params;
    const { stato, dataInizio, dataFine } = req.query;
    
    let query = `
      SELECT 
        ap.*,
        b.codice_anonimo,
        s.nome as sportello_nome,
        u.nome as operatore_nome,
        u.cognome as operatore_cognome
      FROM appuntamenti_sportello ap
      JOIN beneficiari b ON ap.beneficiario_id = b.id
      JOIN sportelli_specialistici s ON ap.sportello_id = s.id
      LEFT JOIN users u ON ap.operatore_id = u.id
      WHERE ap.sportello_id = :sportelloId
    `;
    
    const replacements = { sportelloId: id };
    
    if (stato) {
      query += ' AND ap.stato = :stato';
      replacements.stato = stato;
    }
    
    if (dataInizio) {
      query += ' AND ap.data_appuntamento >= :dataInizio';
      replacements.dataInizio = dataInizio;
    }
    
    if (dataFine) {
      query += ' AND ap.data_appuntamento <= :dataFine';
      replacements.dataFine = dataFine;
    }
    
    query += ' ORDER BY ap.data_appuntamento DESC';
    
    const appuntamenti = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });
    
    res.json({ appuntamenti });
  } catch (error) {
    logger.error('Errore recupero appuntamenti:', error);
    res.status(500).json({ error: 'Errore durante il recupero degli appuntamenti' });
  }
};

/**
 * POST /api/v1/sportelli/:id/appuntamenti
 * Crea appuntamento
 */
const createAppuntamento = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      beneficiario_id,
      data_appuntamento,
      durata_minuti,
      tipo_intervento,
      note
    } = req.body;
    
    if (!beneficiario_id || !data_appuntamento) {
      return res.status(400).json({ error: 'Beneficiario e data appuntamento obbligatori' });
    }
    
    const [result] = await sequelize.query(
      `INSERT INTO appuntamenti_sportello (
        sportello_id, beneficiario_id, data_appuntamento, durata_minuti,
        tipo_intervento, note, operatore_id
      ) VALUES (
        :sportelloId, :beneficiarioId, :dataAppuntamento, :durataMinuti,
        :tipoIntervento, :note, :operatoreId
      ) RETURNING *`,
      {
        replacements: {
          sportelloId: id,
          beneficiarioId: beneficiario_id,
          dataAppuntamento: data_appuntamento,
          durataMinuti: durata_minuti || 60,
          tipoIntervento: tipo_intervento || null,
          note: note || null,
          operatoreId: req.user.id
        },
        type: sequelize.QueryTypes.INSERT
      }
    );
    
    res.status(201).json({ appuntamento: result[0] });
  } catch (error) {
    logger.error('Errore creazione appuntamento:', error);
    res.status(500).json({ error: 'Errore durante la creazione dell\'appuntamento' });
  }
};

/**
 * PUT /api/v1/sportelli/appuntamenti/:id
 * Aggiorna appuntamento
 */
const updateAppuntamento = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      data_appuntamento,
      durata_minuti,
      tipo_intervento,
      note,
      stato
    } = req.body;
    
    await sequelize.query(
      `UPDATE appuntamenti_sportello 
       SET data_appuntamento = COALESCE(:dataAppuntamento, data_appuntamento),
           durata_minuti = COALESCE(:durataMinuti, durata_minuti),
           tipo_intervento = COALESCE(:tipoIntervento, tipo_intervento),
           note = COALESCE(:note, note),
           stato = COALESCE(:stato, stato),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :id`,
      {
        replacements: {
          id,
          dataAppuntamento: data_appuntamento,
          durataMinuti: durata_minuti,
          tipoIntervento: tipo_intervento,
          note,
          stato
        },
        type: sequelize.QueryTypes.UPDATE
      }
    );
    
    res.json({ message: 'Appuntamento aggiornato con successo' });
  } catch (error) {
    logger.error('Errore aggiornamento appuntamento:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento dell\'appuntamento' });
  }
};

/**
 * GET /api/v1/sportelli/beneficiari
 * Lista beneficiari (solo operatori)
 */
const getBeneficiari = async (req, res) => {
  try {
    // Verifica permessi (solo admin o operatori sportello)
    if (req.user.ruolo !== 'admin' && req.user.ruolo !== 'socio_volontario') {
      return res.status(403).json({ error: 'Accesso negato' });
    }
    
    const { attivo, search } = req.query;
    
    let query = `
      SELECT 
        b.id,
        b.codice_anonimo,
        b.nome,
        b.cognome,
        b.data_nascita,
        b.data_primo_contatto,
        b.attivo,
        b.consenso_trattamento,
        u.nome as creatore_nome,
        u.cognome as creatore_cognome
      FROM beneficiari b
      LEFT JOIN users u ON b.created_by = u.id
      WHERE 1=1
    `;
    
    const replacements = {};
    
    if (attivo !== undefined) {
      query += ' AND b.attivo = :attivo';
      replacements.attivo = attivo === 'true';
    }
    
    if (search) {
      query += ' AND (b.codice_anonimo ILIKE :search OR b.nome ILIKE :search OR b.cognome ILIKE :search)';
      replacements.search = `%${search}%`;
    }
    
    query += ' ORDER BY b.codice_anonimo';
    
    const beneficiari = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });
    
    res.json({ beneficiari });
  } catch (error) {
    logger.error('Errore recupero beneficiari:', error);
    res.status(500).json({ error: 'Errore durante il recupero dei beneficiari' });
  }
};

/**
 * POST /api/v1/sportelli/beneficiari
 * Crea beneficiario
 */
const createBeneficiario = async (req, res) => {
  try {
    // Verifica permessi
    if (req.user.ruolo !== 'admin' && req.user.ruolo !== 'socio_volontario') {
      return res.status(403).json({ error: 'Accesso negato' });
    }
    
    const {
      codice_anonimo,
      nome,
      cognome,
      data_nascita,
      luogo_nascita,
      consenso_trattamento,
      consenso_condivisione
    } = req.body;
    
    if (!codice_anonimo) {
      return res.status(400).json({ error: 'Codice anonimo obbligatorio' });
    }
    
    // Genera codice anonimo se non fornito
    let codiceAnonimo = codice_anonimo;
    if (!codiceAnonimo) {
      const timestamp = Date.now().toString(36);
      const random = Math.random().toString(36).substring(2, 8);
      codiceAnonimo = `BEN-${timestamp}-${random}`.toUpperCase();
    }
    
    const [result] = await sequelize.query(
      `INSERT INTO beneficiari (
        codice_anonimo, nome, cognome, data_nascita, luogo_nascita,
        consenso_trattamento, consenso_condivisione, data_primo_contatto, created_by
      ) VALUES (
        :codiceAnonimo, :nome, :cognome, :dataNascita, :luogoNascita,
        :consensoTrattamento, :consensoCondivisione, CURRENT_DATE, :createdBy
      ) RETURNING id, codice_anonimo, nome, cognome, data_primo_contatto`,
      {
        replacements: {
          codiceAnonimo,
          nome: nome || null,
          cognome: cognome || null,
          dataNascita: data_nascita || null,
          luogoNascita: luogo_nascita || null,
          consensoTrattamento: consenso_trattamento || false,
          consensoCondivisione: consenso_condivisione || false,
          createdBy: req.user.id
        },
        type: sequelize.QueryTypes.INSERT
      }
    );
    
    res.status(201).json({ beneficiario: result[0] });
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ error: 'Codice anonimo già esistente' });
    }
    logger.error('Errore creazione beneficiario:', error);
    res.status(500).json({ error: 'Errore durante la creazione del beneficiario' });
  }
};

/**
 * GET /api/v1/sportelli/interventi
 * Storico interventi
 */
const getInterventi = async (req, res) => {
  try {
    const { sportello_id, beneficiario_id, dataInizio, dataFine } = req.query;
    
    let query = `
      SELECT 
        i.*,
        b.codice_anonimo,
        s.nome as sportello_nome,
        u.nome as operatore_nome,
        u.cognome as operatore_cognome
      FROM interventi_sportello i
      JOIN beneficiari b ON i.beneficiario_id = b.id
      JOIN sportelli_specialistici s ON i.sportello_id = s.id
      LEFT JOIN users u ON i.operatore_id = u.id
      WHERE 1=1
    `;
    
    const replacements = {};
    
    if (sportello_id) {
      query += ' AND i.sportello_id = :sportelloId';
      replacements.sportelloId = sportello_id;
    }
    
    if (beneficiario_id) {
      query += ' AND i.beneficiario_id = :beneficiarioId';
      replacements.beneficiarioId = beneficiario_id;
    }
    
    if (dataInizio) {
      query += ' AND i.data_intervento >= :dataInizio';
      replacements.dataInizio = dataInizio;
    }
    
    if (dataFine) {
      query += ' AND i.data_intervento <= :dataFine';
      replacements.dataFine = dataFine;
    }
    
    query += ' ORDER BY i.data_intervento DESC, i.created_at DESC';
    
    const interventi = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });
    
    res.json({ interventi });
  } catch (error) {
    logger.error('Errore recupero interventi:', error);
    res.status(500).json({ error: 'Errore durante il recupero degli interventi' });
  }
};

/**
 * POST /api/v1/sportelli/interventi
 * Registra intervento
 */
const registraIntervento = async (req, res) => {
  try {
    const {
      beneficiario_id,
      sportello_id,
      data_intervento,
      tipo_intervento,
      descrizione_criptata,
      esito,
      note_internal,
      appuntamento_id
    } = req.body;
    
    if (!beneficiario_id || !sportello_id || !data_intervento) {
      return res.status(400).json({ error: 'Beneficiario, sportello e data intervento obbligatori' });
    }
    
    const [result] = await sequelize.query(
      `INSERT INTO interventi_sportello (
        appuntamento_id, beneficiario_id, sportello_id, data_intervento,
        tipo_intervento, descrizione_criptata, esito, note_internal, operatore_id
      ) VALUES (
        :appuntamentoId, :beneficiarioId, :sportelloId, :dataIntervento,
        :tipoIntervento, :descrizioneCriptata, :esito, :noteInternal, :operatoreId
      ) RETURNING *`,
      {
        replacements: {
          appuntamentoId: appuntamento_id || null,
          beneficiarioId: beneficiario_id,
          sportelloId: sportello_id,
          dataIntervento: data_intervento,
          tipoIntervento: tipo_intervento || null,
          descrizioneCriptata: descrizione_criptata || null,
          esito: esito || null,
          noteInternal: note_internal || null,
          operatoreId: req.user.id
        },
        type: sequelize.QueryTypes.INSERT
      }
    );
    
    // Aggiorna stato appuntamento se collegato
    if (appuntamento_id) {
      await sequelize.query(
        `UPDATE appuntamenti_sportello 
         SET stato = 'completato', updated_at = CURRENT_TIMESTAMP
         WHERE id = :appuntamentoId`,
        {
          replacements: { appuntamentoId: appuntamento_id },
          type: sequelize.QueryTypes.UPDATE
        }
      );
    }
    
    res.status(201).json({ intervento: result[0] });
  } catch (error) {
    logger.error('Errore registrazione intervento:', error);
    res.status(500).json({ error: 'Errore durante la registrazione dell\'intervento' });
  }
};

module.exports = {
  getSportelli,
  getSportelloById,
  createSportello,
  updateSportello,
  getAppuntamenti,
  createAppuntamento,
  updateAppuntamento,
  getBeneficiari,
  createBeneficiario,
  getInterventi,
  registraIntervento
};
