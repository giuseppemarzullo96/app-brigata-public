const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');
const logger = require('../utils/logger');
const { calcolaRisultati } = require('../utils/scrutinio');
const { CARICHE } = require('../utils/direttivo');

/**
 * Registro delle cariche sociali (Consiglio direttivo).
 * La composizione del Consiglio e' un'informazione che ogni socio ha diritto
 * di conoscere (art. 4 dello Statuto): la lettura e' aperta, la scrittura no.
 */

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Data odierna (o di un istante) nel fuso italiano, come AAAA-MM-GG. */
function giornoItaliano(valore = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date(valore));
}

/**
 * GET /api/v1/cariche?tutte=1
 * Di default solo le cariche in corso; con tutte=1 anche lo storico.
 */
const getCariche = async (req, res) => {
  try {
    const tutte = req.query.tutte === '1' || req.query.tutte === 'true';
    const cariche = await sequelize.query(
      `SELECT cs.id, cs.user_id, cs.organo, cs.carica, cs.dal, cs.al, cs.votazione_id, cs.note,
              u.nome, u.cognome, v.titolo AS votazione_titolo,
              (cs.dal <= CURRENT_DATE AND (cs.al IS NULL OR cs.al >= CURRENT_DATE)) AS in_carica
         FROM cariche_sociali cs
         JOIN users u ON u.id = cs.user_id
         LEFT JOIN votazioni v ON v.id = cs.votazione_id
        WHERE ${tutte ? 'TRUE' : '(cs.al IS NULL OR cs.al >= CURRENT_DATE)'}
        ORDER BY in_carica DESC,
                 array_position(ARRAY['presidente','vicepresidente','segretario','consigliere']::varchar[], cs.carica),
                 u.cognome, u.nome, cs.dal DESC`,
      { type: QueryTypes.SELECT }
    );
    res.json({ cariche });
  } catch (error) {
    logger.error('Errore recupero cariche:', error);
    res.status(500).json({ error: 'Errore durante il recupero delle cariche' });
  }
};

function validaCarica(body, { parziale = false } = {}) {
  const { carica, dal, al } = body;
  if (!parziale || carica !== undefined) {
    if (!CARICHE.includes(carica)) return 'Carica non valida';
  }
  if (!parziale || dal !== undefined) {
    if (!DATA.test(dal || '')) return 'Data di inizio obbligatoria (AAAA-MM-GG)';
  }
  if (al !== undefined && al !== null && al !== '' && !DATA.test(al)) {
    return 'Data di fine non valida (AAAA-MM-GG)';
  }
  if (dal && al && al < dal) return 'La fine del mandato non puo\' precedere l\'inizio';
  return null;
}

/**
 * POST /api/v1/cariche (solo admin)
 * Body: { user_id, carica, dal, al?, note? }
 */
const createCarica = async (req, res) => {
  try {
    const { user_id: userId, carica, dal, al, note } = req.body;
    const errore = validaCarica(req.body);
    if (errore) return res.status(400).json({ error: errore });

    const [utente] = await sequelize.query(
      `SELECT id FROM users WHERE id = :id AND COALESCE(fittizio, false) = false AND ruolo <> 'esterno'`,
      { replacements: { id: userId || null }, type: QueryTypes.SELECT }
    );
    // Art. 10.1: gli amministratori sono scelti tra le persone fisiche associate.
    if (!utente) return res.status(400).json({ error: 'Il consigliere deve essere un socio persona fisica' });

    const [righe] = await sequelize.query(
      `INSERT INTO cariche_sociali (user_id, carica, dal, al, note, created_by)
       VALUES (:userId, :carica, :dal, :al, :note, :createdBy)
       RETURNING *`,
      {
        replacements: {
          userId, carica, dal, al: al || null, note: note || null, createdBy: req.user.id,
        },
        type: QueryTypes.INSERT,
      }
    );
    res.status(201).json({ carica: righe[0] });
  } catch (error) {
    logger.error('Errore creazione carica:', error);
    res.status(500).json({ error: 'Errore durante la creazione della carica' });
  }
};

/**
 * PUT /api/v1/cariche/:id (solo admin)
 * Tipicamente per chiudere un mandato: { al: 'AAAA-MM-GG' }.
 */
const updateCarica = async (req, res) => {
  try {
    const [attuale] = await sequelize.query(
      'SELECT * FROM cariche_sociali WHERE id = :id',
      { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
    );
    if (!attuale) return res.status(404).json({ error: 'Carica non trovata' });

    const unita = {
      carica: req.body.carica ?? attuale.carica,
      dal: req.body.dal ?? giornoItaliano(attuale.dal),
      al: req.body.al !== undefined ? (req.body.al || null) : (attuale.al ? giornoItaliano(attuale.al) : null),
      note: req.body.note !== undefined ? (req.body.note || null) : attuale.note,
    };
    const errore = validaCarica(unita);
    if (errore) return res.status(400).json({ error: errore });

    await sequelize.query(
      `UPDATE cariche_sociali
          SET carica = :carica, dal = :dal, al = :al, note = :note, updated_at = CURRENT_TIMESTAMP
        WHERE id = :id`,
      { replacements: { ...unita, id: attuale.id } }
    );
    res.json({ message: 'Carica aggiornata' });
  } catch (error) {
    logger.error('Errore aggiornamento carica:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento della carica' });
  }
};

/**
 * DELETE /api/v1/cariche/:id (solo admin)
 * Solo per correggere un inserimento sbagliato: un mandato concluso si chiude
 * con la data di fine, non si cancella, altrimenti se ne perde la storia.
 */
const deleteCarica = async (req, res) => {
  try {
    const [righe, meta] = await sequelize.query(
      'DELETE FROM cariche_sociali WHERE id = :id RETURNING id',
      { replacements: { id: req.params.id } }
    );
    if (!righe.length && !meta?.rowCount) return res.status(404).json({ error: 'Carica non trovata' });
    res.json({ message: 'Carica eliminata' });
  } catch (error) {
    logger.error('Errore eliminazione carica:', error);
    res.status(500).json({ error: 'Errore durante l\'eliminazione della carica' });
  }
};

/**
 * POST /api/v1/cariche/da-votazione/:votazioneId (solo admin)
 * Registra come consiglieri gli eletti di una votazione chiusa, dal giorno
 * della chiusura delle urne. Chi e' gia' consigliere in carica non viene
 * duplicato; gli eletti senza account e i seggi al ballottaggio si segnalano.
 */
const registraEletti = async (req, res) => {
  try {
    // Import qui per evitare un ciclo fra i due controller.
    const { raccogliDatiScrutinio } = require('./votazioni.controller');

    const [votazione] = await sequelize.query(
      'SELECT * FROM votazioni WHERE id = :id',
      { replacements: { id: req.params.votazioneId }, type: QueryTypes.SELECT }
    );
    if (!votazione) return res.status(404).json({ error: 'Votazione non trovata' });
    if (votazione.stato !== 'chiusa') {
      return res.status(409).json({ error: 'Gli eletti si registrano a urne chiuse' });
    }

    const dati = await raccogliDatiScrutinio(votazione.id);
    const esito = calcolaRisultati({
      seggi: votazione.seggi_da_eleggere,
      candidati: dati.candidati,
      conteggi: dati.conteggi,
      aventiDiritto: dati.aventiDiritto,
      votanti: dati.votanti,
      schedeBianche: dati.schedeBianche,
    });

    const dal = DATA.test(req.body?.dal || '') ? req.body.dal : giornoItaliano(votazione.chiusa_at);
    const registrati = [];
    const saltati = [];

    await sequelize.transaction(async (t) => {
      for (const eletto of esito.eletti) {
        const nome = `${eletto.cognome} ${eletto.nome}`;
        if (!eletto.user_id) {
          saltati.push({ nome, motivo: 'senza account nell\'app: va aggiunto a mano' });
          continue;
        }
        const [gia] = await sequelize.query(
          `SELECT id FROM cariche_sociali
            WHERE user_id = :userId AND organo = 'consiglio_direttivo'
              AND dal <= CAST(:dal AS DATE) AND (al IS NULL OR al >= CAST(:dal AS DATE))`,
          { replacements: { userId: eletto.user_id, dal }, type: QueryTypes.SELECT, transaction: t }
        );
        if (gia) {
          saltati.push({ nome, motivo: 'gia\' in carica' });
          continue;
        }
        await sequelize.query(
          `INSERT INTO cariche_sociali (user_id, carica, dal, votazione_id, created_by)
           VALUES (:userId, 'consigliere', :dal, :votazioneId, :createdBy)`,
          {
            replacements: {
              userId: eletto.user_id, dal, votazioneId: votazione.id, createdBy: req.user.id,
            },
            transaction: t,
          }
        );
        registrati.push({ nome });
      }
    });

    if (esito.ballottaggio_necessario) {
      saltati.push({
        nome: esito.candidati_ballottaggio.map((c) => `${c.cognome} ${c.nome}`).join(', '),
        motivo: 'al ballottaggio: la decisione spetta all\'assemblea',
      });
    }

    res.json({ registrati, saltati, dal });
  } catch (error) {
    logger.error('Errore registrazione eletti:', error);
    res.status(500).json({ error: 'Errore durante la registrazione degli eletti' });
  }
};

module.exports = {
  getCariche,
  createCarica,
  updateCarica,
  deleteCarica,
  registraEletti,
  giornoItaliano,
};
