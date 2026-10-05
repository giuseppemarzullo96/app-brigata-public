const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');
const logger = require('../utils/logger');

/**
 * GET /api/v1/ricettario
 * Lista ricette globali (archiviate)
 */
const getRicettarioGlobale = async (req, res) => {
  try {
    const { tipo_ricetta, archiviato, search } = req.query;
    
    let query = `
      SELECT r.*, 
             u.nome || ' ' || u.cognome as creatore_nome
      FROM ricettari r
      LEFT JOIN users u ON r.created_by = u.id
      WHERE r.globale = true
    `;
    
    const replacements = {};
    
    if (tipo_ricetta) {
      query += ' AND r.tipo_ricetta = :tipoRicetta';
      replacements.tipoRicetta = tipo_ricetta;
    }
    
    if (archiviato !== undefined) {
      query += ' AND r.archiviato = :archiviato';
      replacements.archiviato = archiviato === 'true';
    } else {
      // Di default mostra solo non archiviate
      query += ' AND r.archiviato = false';
    }
    
    if (search) {
      query += ' AND (r.nome_ricetta ILIKE :search OR r.descrizione ILIKE :search)';
      replacements.search = `%${search}%`;
    }
    
    query += ' ORDER BY r.tipo_ricetta, r.nome_ricetta';
    
    const ricette = await sequelize.query(query, {
      replacements,
      type: QueryTypes.SELECT
    });
    
    res.json({ ricette });
  } catch (error) {
    logger.error('Errore recupero ricettario globale:', error);
    res.status(500).json({ error: 'Errore durante il recupero del ricettario' });
  }
};

/**
 * GET /api/v1/ricettario/:id
 * Dettaglio ricetta
 */
const getRicettaById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [ricetta] = await sequelize.query(
      `SELECT r.*, 
              u.nome || ' ' || u.cognome as creatore_nome
       FROM ricettari r
       LEFT JOIN users u ON r.created_by = u.id
       WHERE r.id = :id`,
      {
        replacements: { id },
        type: QueryTypes.SELECT
      }
    );
    
    if (!ricetta) {
      return res.status(404).json({ error: 'Ricetta non trovata' });
    }
    
    res.json({ ricetta });
  } catch (error) {
    logger.error('Errore recupero ricetta:', error);
    res.status(500).json({ error: 'Errore durante il recupero della ricetta' });
  }
};

/**
 * POST /api/v1/ricettario
 * Crea nuova ricetta globale
 */
const createRicetta = async (req, res) => {
  try {
    logger.info('Creazione ricetta - Body ricevuto:', req.body);
    
    const { 
      nome_ricetta, 
      descrizione, 
      tipo_ricetta,
      ingredienti, 
      istruzioni, 
      porzioni, 
      note_alimentari,
      globale = true,
      archiviato = false
    } = req.body;
    
    if (!nome_ricetta || nome_ricetta.trim() === '') {
      logger.warn('Creazione ricetta fallita: nome_ricetta mancante');
      return res.status(400).json({ error: 'Nome ricetta obbligatorio' });
    }
    
    if (!tipo_ricetta || tipo_ricetta.trim() === '') {
      logger.warn('Creazione ricetta fallita: tipo_ricetta mancante');
      return res.status(400).json({ error: 'Tipo ricetta obbligatorio' });
    }
    
    const result = await sequelize.query(
      `INSERT INTO ricettari (
        nome_ricetta, descrizione, tipo_ricetta, ingredienti, istruzioni, 
        porzioni, note_alimentari, globale, archiviato, created_by, 
        created_at, updated_at
      )
      VALUES (
        :nomeRicetta, :descrizione, :tipoRicetta, :ingredienti, :istruzioni,
        :porzioni, :noteAlimentari, :globale, :archiviato, :createdBy,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      RETURNING *`,
      {
        replacements: {
          nomeRicetta: nome_ricetta.trim(),
          descrizione: descrizione ? descrizione.trim() : null,
          tipoRicetta: tipo_ricetta,
          ingredienti: ingredienti 
            ? (Array.isArray(ingredienti) ? JSON.stringify(ingredienti) : ingredienti)
            : null,
          istruzioni: istruzioni ? istruzioni.trim() : null,
          porzioni: porzioni ? parseInt(porzioni) : null,
          noteAlimentari: note_alimentari ? note_alimentari.trim() : null,
          globale: globale,
          archiviato: archiviato,
          createdBy: req.user.id
        },
        type: QueryTypes.SELECT
      }
    );
    
    if (!result || result.length === 0) {
      return res.status(500).json({ error: 'Errore durante la creazione della ricetta' });
    }
    
    res.status(201).json({ ricetta: result[0] });
  } catch (error) {
    logger.error('Errore creazione ricetta:', error);
    res.status(500).json({ error: 'Errore durante la creazione della ricetta' });
  }
};

/**
 * PUT /api/v1/ricettario/:id
 * Aggiorna ricetta
 */
const updateRicetta = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      nome_ricetta, 
      descrizione, 
      tipo_ricetta,
      ingredienti, 
      istruzioni, 
      porzioni, 
      note_alimentari,
      archiviato
    } = req.body;
    
    // Verifica che la ricetta esista
    const [ricetta] = await sequelize.query(
      'SELECT id FROM ricettari WHERE id = :id',
      {
        replacements: { id },
        type: QueryTypes.SELECT
      }
    );
    
    if (!ricetta) {
      return res.status(404).json({ error: 'Ricetta non trovata' });
    }
    
    const updates = [];
    const replacements = { id };
    
    if (nome_ricetta !== undefined) {
      updates.push('nome_ricetta = :nomeRicetta');
      replacements.nomeRicetta = nome_ricetta;
    }
    if (descrizione !== undefined) {
      updates.push('descrizione = :descrizione');
      replacements.descrizione = descrizione;
    }
    if (tipo_ricetta !== undefined) {
      updates.push('tipo_ricetta = :tipoRicetta');
      replacements.tipoRicetta = tipo_ricetta;
    }
    if (ingredienti !== undefined) {
      updates.push('ingredienti = :ingredienti');
      replacements.ingredienti = ingredienti ? JSON.stringify(ingredienti) : null;
    }
    if (istruzioni !== undefined) {
      updates.push('istruzioni = :istruzioni');
      replacements.istruzioni = istruzioni;
    }
    if (porzioni !== undefined) {
      updates.push('porzioni = :porzioni');
      replacements.porzioni = porzioni;
    }
    if (note_alimentari !== undefined) {
      updates.push('note_alimentari = :noteAlimentari');
      replacements.noteAlimentari = note_alimentari;
    }
    if (archiviato !== undefined) {
      updates.push('archiviato = :archiviato');
      replacements.archiviato = archiviato;
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nessun campo da aggiornare' });
    }
    
    updates.push('updated_at = CURRENT_TIMESTAMP');
    
    const result = await sequelize.query(
      `UPDATE ricettari 
       SET ${updates.join(', ')}
       WHERE id = :id
       RETURNING *`,
      {
        replacements,
        type: QueryTypes.SELECT
      }
    );
    
    res.json({ ricetta: result[0] });
  } catch (error) {
    logger.error('Errore aggiornamento ricetta:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento della ricetta' });
  }
};

/**
 * DELETE /api/v1/ricettario/:id
 * Elimina ricetta (solo se non utilizzata in slot)
 */
const deleteRicetta = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verifica se la ricetta è utilizzata in qualche slot
    const [slotUsato] = await sequelize.query(
      'SELECT id FROM slot_turno WHERE ricettario_id = :id LIMIT 1',
      {
        replacements: { id },
        type: QueryTypes.SELECT
      }
    );
    
    if (slotUsato) {
      return res.status(400).json({ 
        error: 'Impossibile eliminare: la ricetta è associata a uno o più slot' 
      });
    }
    
    // Elimina la ricetta
    await sequelize.query(
      'DELETE FROM ricettari WHERE id = :id',
      {
        replacements: { id },
        type: QueryTypes.DELETE
      }
    );
    
    res.json({ message: 'Ricetta eliminata con successo' });
  } catch (error) {
    logger.error('Errore eliminazione ricetta:', error);
    res.status(500).json({ error: 'Errore durante l\'eliminazione della ricetta' });
  }
};

/**
 * POST /api/v1/ricettario/:id/archivia
 * Archivia/disarchivia ricetta
 */
const archiviaRicetta = async (req, res) => {
  try {
    const { id } = req.params;
    const { archiviato = true } = req.body;
    
    const result = await sequelize.query(
      `UPDATE ricettari 
       SET archiviato = :archiviato, updated_at = CURRENT_TIMESTAMP
       WHERE id = :id
       RETURNING *`,
      {
        replacements: { id, archiviato },
        type: QueryTypes.SELECT
      }
    );
    
    if (!result || result.length === 0) {
      return res.status(404).json({ error: 'Ricetta non trovata' });
    }
    
    res.json({ ricetta: result[0] });
  } catch (error) {
    logger.error('Errore archiviazione ricetta:', error);
    res.status(500).json({ error: 'Errore durante l\'archiviazione della ricetta' });
  }
};

module.exports = {
  getRicettarioGlobale,
  getRicettaById,
  createRicetta,
  updateRicetta,
  deleteRicetta,
  archiviaRicetta
};

