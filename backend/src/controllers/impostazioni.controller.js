const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');
const logger = require('../utils/logger');
const {
  chiaveValida,
  validaValore,
  getTutteImpostazioni,
  setImpostazione,
} = require('../utils/impostazioni');

/**
 * GET /api/v1/impostazioni
 * Leggibile da ogni socio autenticato: la quota associativa non e' un dato
 * riservato, e il frontend la mostra prima ancora che la quota venga creata.
 */
const getImpostazioni = async (req, res) => {
  try {
    res.json({ impostazioni: await getTutteImpostazioni() });
  } catch (error) {
    logger.error('Errore lettura impostazioni:', error);
    res.status(500).json({ error: 'Errore durante la lettura delle impostazioni' });
  }
};

/**
 * PUT /api/v1/impostazioni/:chiave
 * Solo admin.
 *
 * Con aggiorna_quote_non_pagate le quote gia' create per l'anno in corso e non
 * ancora pagate vengono allineate al nuovo importo. Le quote gia' pagate non si
 * toccano mai: sono incassi registrati, non preventivi.
 */
const updateImpostazione = async (req, res) => {
  try {
    const { chiave } = req.params;
    const { valore, aggiorna_quote_non_pagate } = req.body;

    if (!chiaveValida(chiave)) {
      return res.status(404).json({ error: 'Impostazione non riconosciuta' });
    }
    if (valore === undefined || valore === null || String(valore).trim() === '') {
      return res.status(400).json({ error: 'Il valore e\' obbligatorio' });
    }

    const validazione = validaValore(chiave, valore);
    if (!validazione.ok) {
      return res.status(400).json({ error: validazione.errore });
    }

    const esito = await setImpostazione(chiave, validazione.valore, req.user.id);

    let quoteAggiornate = 0;
    if (chiave === 'quota_annuale' && aggiorna_quote_non_pagate) {
      const righe = await sequelize.query(
        `UPDATE quote_associative
            SET importo = :importo, updated_at = CURRENT_TIMESTAMP
          WHERE anno = :anno
            AND COALESCE(pagata, false) = false
            AND COALESCE(stato_validazione, '') <> 'in_attesa'
          RETURNING id`,
        {
          replacements: {
            importo: validazione.valore,
            anno: new Date().getFullYear(),
          },
          type: QueryTypes.SELECT,
        }
      );
      quoteAggiornate = righe.length;
    }

    logger.info(
      `Impostazione ${chiave}: ${esito.precedente} -> ${esito.valore} (${req.user.email})`
    );

    res.json({
      message: 'Impostazione aggiornata',
      chiave,
      valore: esito.valore,
      valore_precedente: esito.precedente,
      quote_aggiornate: quoteAggiornate,
    });
  } catch (error) {
    logger.error('Errore aggiornamento impostazione:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento dell\'impostazione' });
  }
};

/**
 * GET /api/v1/impostazioni/:chiave/storico
 * Chi ha cambiato cosa e quando. Solo admin.
 */
const getStorico = async (req, res) => {
  try {
    const { chiave } = req.params;
    if (!chiaveValida(chiave)) {
      return res.status(404).json({ error: 'Impostazione non riconosciuta' });
    }

    const storico = await sequelize.query(
      `SELECT s.valore_precedente, s.valore_nuovo, s.created_at,
              u.nome, u.cognome
         FROM impostazioni_storico s
         LEFT JOIN users u ON u.id = s.modificato_da
        WHERE s.chiave = :chiave
        ORDER BY s.created_at DESC
        LIMIT 50`,
      { replacements: { chiave }, type: QueryTypes.SELECT }
    );

    res.json({ storico });
  } catch (error) {
    logger.error('Errore lettura storico impostazioni:', error);
    res.status(500).json({ error: 'Errore durante la lettura dello storico' });
  }
};

module.exports = { getImpostazioni, updateImpostazione, getStorico };
