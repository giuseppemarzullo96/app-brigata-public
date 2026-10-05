const { sequelize } = require('../config/database');
const logger = require('../utils/logger');

/**
 * GET /api/v1/richieste
 * Lista richieste form (solo admin)
 */
const getRichieste = async (req, res) => {
  try {
    if (req.user.ruolo !== 'admin') {
      return res.status(403).json({ error: 'Accesso negato' });
    }
    
    const { stato, tipo } = req.query;
    
    let query = `
      SELECT 
        r.*,
        u.nome as assegnato_nome,
        u.cognome as assegnato_cognome
      FROM richieste_form r
      LEFT JOIN users u ON r.assegnata_a = u.id
      WHERE 1=1
    `;
    
    const replacements = {};
    
    if (stato) {
      query += ' AND r.stato = :stato';
      replacements.stato = stato;
    }
    
    if (tipo) {
      query += ' AND r.tipo_richiesta = :tipo';
      replacements.tipo = tipo;
    }
    
    query += ' ORDER BY r.created_at DESC';
    
    const richieste = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });
    
    res.json({ richieste });
  } catch (error) {
    logger.error('Errore recupero richieste:', error);
    res.status(500).json({ error: 'Errore durante il recupero delle richieste' });
  }
};

/**
 * GET /api/v1/richieste/:id
 * Dettaglio richiesta
 */
const getRichiestaById = async (req, res) => {
  try {
    if (req.user.ruolo !== 'admin') {
      return res.status(403).json({ error: 'Accesso negato' });
    }
    
    const { id } = req.params;
    
    const [richiesta] = await sequelize.query(
      `SELECT r.*, u.nome as assegnato_nome, u.cognome as assegnato_cognome
       FROM richieste_form r
       LEFT JOIN users u ON r.assegnata_a = u.id
       WHERE r.id = :id`,
      {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (!richiesta) {
      return res.status(404).json({ error: 'Richiesta non trovata' });
    }
    
    res.json({ richiesta });
  } catch (error) {
    logger.error('Errore recupero richiesta:', error);
    res.status(500).json({ error: 'Errore durante il recupero della richiesta' });
  }
};

/**
 * POST /api/v1/richieste
 * Crea richiesta (pubblica, dal sito web)
 */
const createRichiesta = async (req, res) => {
  try {
    const {
      tipo_richiesta,
      nome,
      email,
      telefono,
      messaggio
    } = req.body;
    
    if (!tipo_richiesta || !nome || !email || !messaggio) {
      return res.status(400).json({ error: 'Campi obbligatori mancanti' });
    }
    
    const [result] = await sequelize.query(
      `INSERT INTO richieste_form (tipo_richiesta, nome, email, telefono, messaggio)
       VALUES (:tipoRichiesta, :nome, :email, :telefono, :messaggio)
       RETURNING *`,
      {
        replacements: {
          tipoRichiesta: tipo_richiesta,
          nome,
          email,
          telefono: telefono || null,
          messaggio
        },
        type: sequelize.QueryTypes.INSERT
      }
    );
    
    logger.info(`Nuova richiesta form: ${tipo_richiesta} da ${email}`);
    
    res.status(201).json({ 
      message: 'Richiesta inviata con successo',
      richiesta: result[0] 
    });
  } catch (error) {
    logger.error('Errore creazione richiesta:', error);
    res.status(500).json({ error: 'Errore durante l\'invio della richiesta' });
  }
};

/**
 * PUT /api/v1/richieste/:id
 * Aggiorna richiesta (solo admin)
 */
const updateRichiesta = async (req, res) => {
  try {
    if (req.user.ruolo !== 'admin') {
      return res.status(403).json({ error: 'Accesso negato' });
    }
    
    const { id } = req.params;
    const { stato, assegnata_a, note_internal } = req.body;
    
    await sequelize.query(
      `UPDATE richieste_form 
       SET stato = COALESCE(:stato, stato),
           assegnata_a = COALESCE(:assegnataA, assegnata_a),
           note_internal = COALESCE(:noteInternal, note_internal),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :id`,
      {
        replacements: {
          id,
          stato,
          assegnataA: assegnata_a,
          noteInternal: note_internal
        },
        type: sequelize.QueryTypes.UPDATE
      }
    );
    
    res.json({ message: 'Richiesta aggiornata con successo' });
  } catch (error) {
    logger.error('Errore aggiornamento richiesta:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento' });
  }
};

module.exports = {
  getRichieste,
  getRichiestaById,
  createRichiesta,
  updateRichiesta
};

