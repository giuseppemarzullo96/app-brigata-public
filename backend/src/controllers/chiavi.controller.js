const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');
const logger = require('../utils/logger');

/**
 * POST /api/v1/chiavi/pubblica
 * Salva o aggiorna la chiave pubblica dell'utente
 */
const salvaChiavePubblica = async (req, res) => {
  try {
    const { chiave_pubblica, algoritmo = 'ECDH', curva = 'P-256' } = req.body;

    if (!chiave_pubblica) {
      return res.status(400).json({ error: 'Chiave pubblica richiesta' });
    }

    // Verifica che la chiave pubblica sia un JSON valido
    try {
      JSON.parse(chiave_pubblica);
    } catch (e) {
      return res.status(400).json({ error: 'Chiave pubblica non valida (deve essere JSON)' });
    }

    // Inserisci o aggiorna la chiave pubblica
    const result = await sequelize.query(
      `INSERT INTO chiavi_pubbliche (user_id, chiave_pubblica, algoritmo, curva, updated_at)
       VALUES (:userId, :chiavePubblica, :algoritmo, :curva, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) 
       DO UPDATE SET 
         chiave_pubblica = EXCLUDED.chiave_pubblica,
         algoritmo = EXCLUDED.algoritmo,
         curva = EXCLUDED.curva,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      {
        replacements: {
          userId: req.user.id,
          chiavePubblica: chiave_pubblica,
          algoritmo,
          curva
        },
        type: QueryTypes.SELECT
      }
    );

    logger.info(`Chiave pubblica salvata per utente ${req.user.email}`);

    res.json({
      success: true,
      chiave: result[0]
    });
  } catch (error) {
    logger.error('Errore salvataggio chiave pubblica:', error);
    res.status(500).json({ error: 'Errore durante il salvataggio della chiave pubblica' });
  }
};

/**
 * GET /api/v1/chiavi/pubblica/:userId
 * Recupera la chiave pubblica di un utente
 */
const getChiavePubblica = async (req, res) => {
  try {
    const { userId } = req.params;

    const [chiave] = await sequelize.query(
      `SELECT chiave_pubblica, algoritmo, curva, updated_at
       FROM chiavi_pubbliche
       WHERE user_id = :userId`,
      {
        replacements: { userId },
        type: QueryTypes.SELECT
      }
    );

    if (!chiave) {
      return res.status(404).json({ error: 'Chiave pubblica non trovata per questo utente' });
    }

    res.json({ chiave });
  } catch (error) {
    logger.error('Errore recupero chiave pubblica:', error);
    res.status(500).json({ error: 'Errore durante il recupero della chiave pubblica' });
  }
};

/**
 * GET /api/v1/chiavi/pubbliche
 * Recupera le chiavi pubbliche di più utenti (per gruppi)
 */
const getChiaviPubbliche = async (req, res) => {
  try {
    const { userIds } = req.query; // Array di user IDs separati da virgola

    if (!userIds) {
      return res.status(400).json({ error: 'userIds richiesto' });
    }

    const userIdArray = userIds.split(',').map(id => id.trim());

    const chiavi = await sequelize.query(
      `SELECT user_id, chiave_pubblica, algoritmo, curva
       FROM chiavi_pubbliche
       WHERE user_id = ANY(:userIdArray::uuid[])`,
      {
        replacements: { userIdArray },
        type: QueryTypes.SELECT
      }
    );

    res.json({ chiavi });
  } catch (error) {
    logger.error('Errore recupero chiavi pubbliche:', error);
    res.status(500).json({ error: 'Errore durante il recupero delle chiavi pubbliche' });
  }
};

/**
 * DELETE /api/v1/chiavi/pubblica
 * Elimina la chiave pubblica dell'utente (logout/disattivazione E2E)
 */
const eliminaChiavePubblica = async (req, res) => {
  try {
    await sequelize.query(
      `DELETE FROM chiavi_pubbliche WHERE user_id = :userId`,
      {
        replacements: { userId: req.user.id },
        type: QueryTypes.DELETE
      }
    );

    logger.info(`Chiave pubblica eliminata per utente ${req.user.email}`);

    res.json({ success: true });
  } catch (error) {
    logger.error('Errore eliminazione chiave pubblica:', error);
    res.status(500).json({ error: 'Errore durante l\'eliminazione della chiave pubblica' });
  }
};

/**
 * GET /api/v1/chiavi/utenti-senza-chiave
 * Recupera la lista di utenti che non hanno ancora generato la chiave pubblica
 * Solo admin può accedere
 */
const getUtentiSenzaChiave = async (req, res) => {
  try {
    // Solo admin può vedere questa lista
    if (req.user.ruolo !== 'admin') {
      return res.status(403).json({ error: 'Solo gli admin possono vedere questa lista' });
    }

    // Recupera tutti gli utenti che possono usare la chat (admin, volontario, ordinario)
    const utentiConChat = await sequelize.query(
      `SELECT u.id, u.nome, u.cognome, u.email, u.ruolo, u.categoria_socio
       FROM users u
       WHERE (u.ruolo = 'admin' OR u.categoria_socio IN ('volontario', 'ordinario'))
       AND u.attivo = true
       ORDER BY u.nome, u.cognome`,
      { type: QueryTypes.SELECT }
    );

    // Recupera tutti gli ID degli utenti che hanno una chiave pubblica
    const utentiConChiave = await sequelize.query(
      `SELECT DISTINCT user_id
       FROM chiavi_pubbliche`,
      { type: QueryTypes.SELECT }
    );

    const userIdsConChiave = new Set(utentiConChiave.map(u => u.user_id));

    // Filtra gli utenti che non hanno la chiave
    const utentiSenzaChiave = utentiConChat.filter(utente => 
      !userIdsConChiave.has(utente.id)
    );

    res.json({
      totale_utenti_con_chat: utentiConChat.length,
      utenti_con_chiave: utentiConChiave.length,
      utenti_senza_chiave: utentiSenzaChiave.length,
      utenti: utentiSenzaChiave
    });
  } catch (error) {
    logger.error('Errore recupero utenti senza chiave:', error);
    res.status(500).json({ error: 'Errore durante il recupero degli utenti senza chiave' });
  }
};

/**
 * DELETE /api/v1/chiavi/pubblica/:userId
 * Elimina la chiave pubblica di un utente specifico (solo admin)
 * Questo forzerà l'utente a rigenerare le chiavi al prossimo accesso
 */
const eliminaChiavePubblicaUtente = async (req, res) => {
  try {
    // Solo admin può eliminare chiavi di altri utenti
    if (req.user.ruolo !== 'admin') {
      return res.status(403).json({ error: 'Solo gli admin possono eliminare chiavi di altri utenti' });
    }

    const { userId } = req.params;

    // Verifica che l'utente esista
    const [utente] = await sequelize.query(
      `SELECT id, email, nome, cognome FROM users WHERE id = :userId`,
      {
        replacements: { userId },
        type: QueryTypes.SELECT
      }
    );

    if (!utente) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    // Elimina la chiave pubblica
    await sequelize.query(
      `DELETE FROM chiavi_pubbliche WHERE user_id = :userId`,
      {
        replacements: { userId },
        type: QueryTypes.DELETE
      }
    );

    logger.info(`Chiave pubblica eliminata per utente ${utente.email} da admin ${req.user.email}`);

    res.json({ 
      success: true,
      message: `Chiave pubblica eliminata per ${utente.nome} ${utente.cognome}. L'utente rigenererà le chiavi al prossimo accesso.`
    });
  } catch (error) {
    logger.error('Errore eliminazione chiave pubblica utente:', error);
    res.status(500).json({ error: 'Errore durante l\'eliminazione della chiave pubblica' });
  }
};

module.exports = {
  salvaChiavePubblica,
  getChiavePubblica,
  getChiaviPubbliche,
  eliminaChiavePubblica,
  getUtentiSenzaChiave,
  eliminaChiavePubblicaUtente
};

