const { sequelize } = require('../config/database');
const logger = require('../utils/logger');

/**
 * GET /api/v1/magazzino/categorie
 * Lista categorie
 */
const getCategorie = async (req, res) => {
  try {
    const categorie = await sequelize.query(
      'SELECT * FROM magazzino_categorie ORDER BY nome',
      { type: sequelize.QueryTypes.SELECT }
    );
    
    res.json({ categorie });
  } catch (error) {
    logger.error('Errore recupero categorie:', error);
    res.status(500).json({ error: 'Errore durante il recupero delle categorie' });
  }
};

/**
 * GET /api/v1/magazzino/beni
 * Lista beni
 */
const getBeni = async (req, res) => {
  try {
    const { categoria_id, alert } = req.query;
    
    let query = `
      SELECT 
        b.*,
        c.nome as categoria_nome,
        c.unita_misura as categoria_unita
      FROM magazzino_beni b
      JOIN magazzino_categorie c ON b.categoria_id = c.id
      WHERE 1=1
    `;
    
    const replacements = {};
    
    if (categoria_id) {
      query += ' AND b.categoria_id = :categoriaId';
      replacements.categoriaId = categoria_id;
    }
    
    if (alert === 'true') {
      query += ' AND b.quantita_disponibile <= b.quantita_minima';
    }
    
    query += ' ORDER BY c.nome, b.nome';
    
    const beni = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });
    
    res.json({ beni });
  } catch (error) {
    logger.error('Errore recupero beni:', error);
    res.status(500).json({ error: 'Errore durante il recupero dei beni' });
  }
};

/**
 * GET /api/v1/magazzino/beni/:id
 * Dettaglio bene
 */
const getBeneById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [bene] = await sequelize.query(
      `SELECT b.*, c.nome as categoria_nome
       FROM magazzino_beni b
       JOIN magazzino_categorie c ON b.categoria_id = c.id
       WHERE b.id = :id`,
      {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (!bene) {
      return res.status(404).json({ error: 'Bene non trovato' });
    }
    
    res.json({ bene });
  } catch (error) {
    logger.error('Errore recupero bene:', error);
    res.status(500).json({ error: 'Errore durante il recupero del bene' });
  }
};

/**
 * POST /api/v1/magazzino/beni
 * Crea bene
 */
const createBene = async (req, res) => {
  try {
    const {
      categoria_id,
      nome,
      descrizione,
      quantita_disponibile,
      quantita_minima,
      unita_misura,
      ubicazione,
      note
    } = req.body;
    
    if (!categoria_id || !nome) {
      return res.status(400).json({ error: 'Categoria e nome obbligatori' });
    }
    
    const [result] = await sequelize.query(
      `INSERT INTO magazzino_beni (
        categoria_id, nome, descrizione, quantita_disponibile, quantita_minima,
        unita_misura, ubicazione, note
      ) VALUES (
        :categoriaId, :nome, :descrizione, :quantitaDisponibile, :quantitaMinima,
        :unitaMisura, :ubicazione, :note
      ) RETURNING *`,
      {
        replacements: {
          categoriaId: categoria_id,
          nome,
          descrizione: descrizione || null,
          quantitaDisponibile: quantita_disponibile || 0,
          quantitaMinima: quantita_minima || 0,
          unitaMisura: unita_misura || null,
          ubicazione: ubicazione || null,
          note: note || null
        },
        type: sequelize.QueryTypes.INSERT
      }
    );
    
    res.status(201).json({ bene: result[0] });
  } catch (error) {
    logger.error('Errore creazione bene:', error);
    res.status(500).json({ error: 'Errore durante la creazione del bene' });
  }
};

/**
 * PUT /api/v1/magazzino/beni/:id
 * Aggiorna bene
 */
const updateBene = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nome,
      descrizione,
      quantita_disponibile,
      quantita_minima,
      ubicazione,
      note
    } = req.body;
    
    await sequelize.query(
      `UPDATE magazzino_beni 
       SET nome = COALESCE(:nome, nome),
           descrizione = COALESCE(:descrizione, descrizione),
           quantita_disponibile = COALESCE(:quantitaDisponibile, quantita_disponibile),
           quantita_minima = COALESCE(:quantitaMinima, quantita_minima),
           ubicazione = COALESCE(:ubicazione, ubicazione),
           note = COALESCE(:note, note),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :id`,
      {
        replacements: {
          id,
          nome,
          descrizione,
          quantitaDisponibile: quantita_disponibile,
          quantitaMinima: quantita_minima,
          ubicazione,
          note
        },
        type: sequelize.QueryTypes.UPDATE
      }
    );
    
    res.json({ message: 'Bene aggiornato con successo' });
  } catch (error) {
    logger.error('Errore aggiornamento bene:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento del bene' });
  }
};

/**
 * DELETE /api/v1/magazzino/beni/:id
 * Elimina bene
 */
const deleteBene = async (req, res) => {
  try {
    const { id } = req.params;
    
    await sequelize.query(
      'DELETE FROM magazzino_beni WHERE id = :id',
      {
        replacements: { id },
        type: sequelize.QueryTypes.DELETE
      }
    );
    
    res.json({ message: 'Bene eliminato con successo' });
  } catch (error) {
    logger.error('Errore eliminazione bene:', error);
    res.status(500).json({ error: 'Errore durante l\'eliminazione del bene' });
  }
};

/**
 * GET /api/v1/magazzino/beni/:id/movimenti
 * Movimenti bene
 */
const getMovimenti = async (req, res) => {
  try {
    const { id } = req.params;
    
    const movimenti = await sequelize.query(
      `SELECT m.*, u.nome as operatore_nome, u.cognome as operatore_cognome
       FROM movimenti_magazzino m
       LEFT JOIN users u ON m.user_id = u.id
       WHERE m.bene_id = :id
       ORDER BY m.created_at DESC`,
      {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    res.json({ movimenti });
  } catch (error) {
    logger.error('Errore recupero movimenti:', error);
    res.status(500).json({ error: 'Errore durante il recupero dei movimenti' });
  }
};

/**
 * POST /api/v1/magazzino/beni/:id/movimenti
 * Registra movimento
 */
const registraMovimento = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      tipo_movimento,
      quantita,
      motivo,
      riferimento_esterno
    } = req.body;
    
    if (!tipo_movimento || !quantita) {
      return res.status(400).json({ error: 'Tipo movimento e quantità obbligatori' });
    }
    
    // Registra movimento
    await sequelize.query(
      `INSERT INTO movimenti_magazzino (
        bene_id, tipo_movimento, quantita, motivo, riferimento_esterno, user_id
      ) VALUES (
        :beneId, :tipoMovimento, :quantita, :motivo, :riferimentoEsterno, :userId
      )`,
      {
        replacements: {
          beneId: id,
          tipoMovimento: tipo_movimento,
          quantita: quantita,
          motivo: motivo || null,
          riferimentoEsterno: riferimento_esterno || null,
          userId: req.user.id
        },
        type: sequelize.QueryTypes.INSERT
      }
    );
    
    // Aggiorna quantità disponibile
    if (tipo_movimento === 'entrata') {
      await sequelize.query(
        `UPDATE magazzino_beni 
         SET quantita_disponibile = quantita_disponibile + :quantita,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = :id`,
        {
          replacements: { id, quantita },
          type: sequelize.QueryTypes.UPDATE
        }
      );
    } else if (tipo_movimento === 'uscita') {
      await sequelize.query(
        `UPDATE magazzino_beni 
         SET quantita_disponibile = GREATEST(0, quantita_disponibile - :quantita),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = :id`,
        {
          replacements: { id, quantita },
          type: sequelize.QueryTypes.UPDATE
        }
      );
    }
    
    res.json({ message: 'Movimento registrato con successo' });
  } catch (error) {
    logger.error('Errore registrazione movimento:', error);
    res.status(500).json({ error: 'Errore durante la registrazione del movimento' });
  }
};

/**
 * GET /api/v1/magazzino/alert
 * Alert scorte basse
 */
const getAlertScorte = async (req, res) => {
  try {
    const alert = await sequelize.query(
      `SELECT 
        b.*,
        c.nome as categoria_nome,
        (b.quantita_minima - b.quantita_disponibile) as quantita_mancante
       FROM magazzino_beni b
       JOIN magazzino_categorie c ON b.categoria_id = c.id
       WHERE b.quantita_disponibile <= b.quantita_minima
       ORDER BY (b.quantita_minima - b.quantita_disponibile) DESC`,
      { type: sequelize.QueryTypes.SELECT }
    );
    
    res.json({ alert });
  } catch (error) {
    logger.error('Errore recupero alert:', error);
    res.status(500).json({ error: 'Errore durante il recupero degli alert' });
  }
};

/**
 * GET /api/v1/magazzino/donazioni
 * Lista donazioni
 */
const getDonazioni = async (req, res) => {
  try {
    const { tipo, dataInizio, dataFine } = req.query;
    
    let query = `
      SELECT 
        d.*,
        u.nome as registratore_nome,
        u.cognome as registratore_cognome
      FROM donazioni d
      LEFT JOIN users u ON d.registrato_da = u.id
      WHERE 1=1
    `;
    
    const replacements = {};
    
    if (tipo) {
      query += ' AND d.tipo_donazione = :tipo';
      replacements.tipo = tipo;
    }
    
    if (dataInizio) {
      query += ' AND d.data_donazione >= :dataInizio';
      replacements.dataInizio = dataInizio;
    }
    
    if (dataFine) {
      query += ' AND d.data_donazione <= :dataFine';
      replacements.dataFine = dataFine;
    }
    
    query += ' ORDER BY d.data_donazione DESC';
    
    const donazioni = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });
    
    res.json({ donazioni });
  } catch (error) {
    logger.error('Errore recupero donazioni:', error);
    res.status(500).json({ error: 'Errore durante il recupero delle donazioni' });
  }
};

/**
 * POST /api/v1/magazzino/donazioni
 * Registra donazione
 */
const registraDonazione = async (req, res) => {
  try {
    const {
      tipo_donazione,
      importo,
      descrizione,
      donatore_nome,
      donatore_email,
      donatore_telefono,
      anonima,
      data_donazione,
      beni_materiali
    } = req.body;
    
    if (!tipo_donazione || !data_donazione) {
      return res.status(400).json({ error: 'Tipo donazione e data obbligatori' });
    }
    
    // Crea donazione
    const [donazioneResult] = await sequelize.query(
      `INSERT INTO donazioni (
        tipo_donazione, importo, descrizione, donatore_nome, donatore_email,
        donatore_telefono, anonima, data_donazione, registrato_da
      ) VALUES (
        :tipoDonazione, :importo, :descrizione, :donatoreNome, :donatoreEmail,
        :donatoreTelefono, :anonima, :dataDonazione, :registratoDa
      ) RETURNING *`,
      {
        replacements: {
          tipoDonazione: tipo_donazione,
          importo: importo || null,
          descrizione: descrizione || null,
          donatoreNome: donatore_nome || null,
          donatoreEmail: donatore_email || null,
          donatoreTelefono: donatore_telefono || null,
          anonima: anonima || false,
          dataDonazione: data_donazione,
          registratoDa: req.user.id
        },
        type: sequelize.QueryTypes.INSERT
      }
    );
    
    const donazioneId = donazioneResult[0].id;
    
    // Se donazione materiale, crea collegamenti con beni
    if (tipo_donazione === 'materiale' && beni_materiali && Array.isArray(beni_materiali)) {
      for (const bene of beni_materiali) {
        await sequelize.query(
          `INSERT INTO donazioni_materiali (donazione_id, bene_id, quantita, descrizione)
           VALUES (:donazioneId, :beneId, :quantita, :descrizione)`,
          {
            replacements: {
              donazioneId,
              beneId: bene.bene_id || null,
              quantita: bene.quantita || null,
              descrizione: bene.descrizione || null
            },
            type: sequelize.QueryTypes.INSERT
          }
        );
      }
    }
    
    res.status(201).json({ donazione: donazioneResult[0] });
  } catch (error) {
    logger.error('Errore registrazione donazione:', error);
    res.status(500).json({ error: 'Errore durante la registrazione della donazione' });
  }
};

module.exports = {
  getCategorie,
  getBeni,
  getBeneById,
  createBene,
  updateBene,
  deleteBene,
  getMovimenti,
  registraMovimento,
  getAlertScorte,
  getDonazioni,
  registraDonazione
};
