const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');
const logger = require('../utils/logger');
const { linkVotazione, rigaWhatsapp, rigaEmail } = require('../utils/link');
const { calcolaRisultati } = require('../utils/scrutinio');
const { generaVerbalePdf } = require('../utils/verbaleVotazione');
const {
  normalizzaDatiVerbale,
  validaRegistroPresenze,
  calcolaPresenze,
} = require('../utils/datiVerbale');
const { notificaDestinatari } = require('../utils/notifiche');

// Categorie escluse d'ufficio dall'elettorato: gli enti esterni non sono soci.
const CATEGORIE_NON_VOTANTI = ['esterno'];

/**
 * Elettori ammessi in base alle categorie destinatarie.
 * Esclude sospesi, archiviati, disattivati ed enti fittizi.
 */
async function getElettoriAmmessi(destinatari) {
  const tutti = !destinatari || destinatari.length === 0 || destinatari.includes('tutti');

  let query = `
    SELECT id FROM users
    WHERE attivo = true
      AND archiviato = false
      AND COALESCE(sospeso, false) = false
      AND COALESCE(fittizio, false) = false
      AND ruolo <> 'esterno'
  `;
  const replacements = {};

  if (tutti) {
    // NOT IN (:lista): Sequelize espande correttamente l'array. Con
    // "<> ALL(:lista)" verrebbe invece inlineata una stringa e Postgres
    // fallirebbe con "malformed array literal".
    query += ' AND categoria_socio NOT IN (:escluse)';
    replacements.escluse = CATEGORIE_NON_VOTANTI;
  } else {
    // Stesso motivo di sopra: IN (:lista), non = ANY(:lista).
    query += ' AND categoria_socio IN (:categorie)';
    replacements.categorie = destinatari;
  }

  return sequelize.query(query, { replacements, type: QueryTypes.SELECT });
}

/** Carica una votazione o restituisce null. */
async function caricaVotazione(id) {
  const [votazione] = await sequelize.query(
    `SELECT v.*, a.titolo AS assemblea_titolo, a.data_assemblea,
            a.luogo AS assemblea_luogo, a.ordine_del_giorno AS assemblea_ordine_del_giorno,
            u.nome AS creatore_nome, u.cognome AS creatore_cognome
       FROM votazioni v
       LEFT JOIN assemblee a ON v.assemblea_id = a.id
       LEFT JOIN users u ON v.created_by = u.id
      WHERE v.id = :id`,
    { replacements: { id }, type: QueryTypes.SELECT }
  );
  return votazione || null;
}

/** Conteggi, schede e affluenza necessari allo scrutinio. */
async function raccogliDatiScrutinio(votazioneId) {
  const [candidati, conteggiRaw, [schede], [affluenza]] = await Promise.all([
    sequelize.query(
      `SELECT id, user_id, nome, cognome, note, ordine, ritirato
         FROM candidati_votazione WHERE votazione_id = :id ORDER BY ordine, cognome`,
      { replacements: { id: votazioneId }, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT c.id AS candidato_id, COUNT(vv.id)::int AS voti
         FROM candidati_votazione c
         LEFT JOIN voti_votazione vv ON vv.candidato_id = c.id
        WHERE c.votazione_id = :id
        GROUP BY c.id`,
      { replacements: { id: votazioneId }, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT COUNT(*)::int AS totale,
              COUNT(*) FILTER (WHERE scheda_bianca)::int AS bianche
         FROM schede_votazione WHERE votazione_id = :id`,
      { replacements: { id: votazioneId }, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT COUNT(*)::int AS aventi_diritto,
              COUNT(*) FILTER (WHERE ha_votato)::int AS votanti
         FROM aventi_diritto_votazione WHERE votazione_id = :id`,
      { replacements: { id: votazioneId }, type: QueryTypes.SELECT }
    ),
  ]);

  const conteggi = {};
  conteggiRaw.forEach((r) => {
    conteggi[r.candidato_id] = r.voti;
  });

  return {
    candidati,
    conteggi,
    schedeTotali: schede.totale,
    schedeBianche: schede.bianche,
    aventiDiritto: affluenza.aventi_diritto,
    votanti: affluenza.votanti,
  };
}

/**
 * GET /api/v1/votazioni
 */
const getVotazioni = async (req, res) => {
  try {
    const { stato } = req.query;

    let query = `
      SELECT v.id, v.titolo, v.descrizione, v.stato, v.seggi_da_eleggere,
             v.preferenze_max, v.aperta_at, v.chiusa_at, v.created_at,
             v.assemblea_id, a.titolo AS assemblea_titolo,
             (SELECT COUNT(*)::int FROM candidati_votazione c
               WHERE c.votazione_id = v.id AND c.ritirato = false) AS totale_candidati,
             (SELECT COUNT(*)::int FROM aventi_diritto_votazione ad
               WHERE ad.votazione_id = v.id) AS aventi_diritto,
             (SELECT COUNT(*)::int FROM aventi_diritto_votazione ad
               WHERE ad.votazione_id = v.id AND ad.ha_votato) AS votanti,
             EXISTS (SELECT 1 FROM aventi_diritto_votazione ad
                      WHERE ad.votazione_id = v.id AND ad.user_id = :userId) AS sono_avente_diritto,
             EXISTS (SELECT 1 FROM aventi_diritto_votazione ad
                      WHERE ad.votazione_id = v.id AND ad.user_id = :userId AND ad.ha_votato) AS ho_votato
        FROM votazioni v
        LEFT JOIN assemblee a ON v.assemblea_id = a.id
       WHERE 1 = 1
    `;
    const replacements = { userId: req.user.id };

    if (stato) {
      query += ' AND v.stato = :stato';
      replacements.stato = stato;
    }

    // I non admin non vedono le bozze: una votazione e' pubblica solo da aperta in poi.
    if (req.user.ruolo !== 'admin') {
      query += " AND v.stato <> 'bozza'";
    }

    query += ' ORDER BY v.created_at DESC';

    const votazioni = await sequelize.query(query, { replacements, type: QueryTypes.SELECT });
    res.json({ votazioni });
  } catch (error) {
    logger.error('Errore recupero votazioni:', error);
    res.status(500).json({ error: 'Errore durante il recupero delle votazioni' });
  }
};

/**
 * GET /api/v1/votazioni/:id
 * Dettaglio: mai i risultati parziali, solo stato e affluenza.
 */
const getVotazioneById = async (req, res) => {
  try {
    const votazione = await caricaVotazione(req.params.id);
    if (!votazione) return res.status(404).json({ error: 'Votazione non trovata' });

    if (votazione.stato === 'bozza' && req.user.ruolo !== 'admin') {
      return res.status(404).json({ error: 'Votazione non trovata' });
    }

    const candidati = await sequelize.query(
      `SELECT id, user_id, nome, cognome, note, ordine, ritirato
         FROM candidati_votazione WHERE votazione_id = :id
        ORDER BY ordine, cognome, nome`,
      { replacements: { id: votazione.id }, type: QueryTypes.SELECT }
    );

    const [statoElettore] = await sequelize.query(
      `SELECT ha_votato, votato_at FROM aventi_diritto_votazione
        WHERE votazione_id = :id AND user_id = :userId`,
      { replacements: { id: votazione.id, userId: req.user.id }, type: QueryTypes.SELECT }
    );

    const [affluenza] = await sequelize.query(
      `SELECT COUNT(*)::int AS aventi_diritto,
              COUNT(*) FILTER (WHERE ha_votato)::int AS votanti
         FROM aventi_diritto_votazione WHERE votazione_id = :id`,
      { replacements: { id: votazione.id }, type: QueryTypes.SELECT }
    );

    res.json({
      votazione,
      candidati,
      sono_avente_diritto: Boolean(statoElettore),
      ho_votato: Boolean(statoElettore?.ha_votato),
      votato_at: statoElettore?.votato_at || null,
      affluenza,
    });
  } catch (error) {
    logger.error('Errore recupero votazione:', error);
    res.status(500).json({ error: 'Errore durante il recupero della votazione' });
  }
};

/**
 * POST /api/v1/votazioni
 */
const createVotazione = async (req, res) => {
  try {
    const {
      titolo,
      descrizione,
      assemblea_id,
      seggi_da_eleggere,
      preferenze_max,
      destinatari,
      candidati,
    } = req.body;

    if (!titolo || !String(titolo).trim()) {
      return res.status(400).json({ error: 'Il titolo e\' obbligatorio' });
    }

    const seggi = Number(seggi_da_eleggere);
    if (!Number.isInteger(seggi) || seggi < 1) {
      return res.status(400).json({ error: 'Il numero di membri da eleggere deve essere almeno 1' });
    }

    const preferenze = preferenze_max === undefined || preferenze_max === null
      ? seggi
      : Number(preferenze_max);
    if (!Number.isInteger(preferenze) || preferenze < 1) {
      return res.status(400).json({ error: 'Il numero di preferenze deve essere almeno 1' });
    }
    if (preferenze > seggi) {
      return res.status(400).json({
        error: 'Le preferenze esprimibili non possono superare i membri da eleggere',
      });
    }

    const result = await sequelize.transaction(async (t) => {
      const [votazione] = await sequelize.query(
        `INSERT INTO votazioni
           (titolo, descrizione, assemblea_id, seggi_da_eleggere, preferenze_max, destinatari, created_by)
         VALUES (:titolo, :descrizione, :assembleaId, :seggi, :preferenze, :destinatari, :createdBy)
         RETURNING *`,
        {
          replacements: {
            titolo: String(titolo).trim(),
            descrizione: descrizione || null,
            assembleaId: assemblea_id || null,
            seggi,
            preferenze,
            destinatari: destinatari ? JSON.stringify(destinatari) : null,
            createdBy: req.user.id,
          },
          type: QueryTypes.SELECT,
          transaction: t,
        }
      );

      if (Array.isArray(candidati) && candidati.length > 0) {
        for (let i = 0; i < candidati.length; i += 1) {
          const c = candidati[i];
          if (!c?.nome || !c?.cognome) continue;
          await sequelize.query(
            `INSERT INTO candidati_votazione (votazione_id, user_id, nome, cognome, note, ordine)
             VALUES (:votazioneId, :userId, :nome, :cognome, :note, :ordine)`,
            {
              replacements: {
                votazioneId: votazione.id,
                userId: c.user_id || null,
                nome: String(c.nome).trim(),
                cognome: String(c.cognome).trim(),
                note: c.note || null,
                ordine: i,
              },
              type: QueryTypes.INSERT,
              transaction: t,
            }
          );
        }
      }

      return votazione;
    });

    res.status(201).json({ votazione: result });
  } catch (error) {
    logger.error('Errore creazione votazione:', error);
    res.status(500).json({ error: 'Errore durante la creazione della votazione' });
  }
};

/**
 * PUT /api/v1/votazioni/:id
 * Modificabile solo finche' e' in bozza: una volta aperta, le regole del voto
 * non possono piu' cambiare.
 */
const updateVotazione = async (req, res) => {
  try {
    const votazione = await caricaVotazione(req.params.id);
    if (!votazione) return res.status(404).json({ error: 'Votazione non trovata' });
    if (votazione.stato !== 'bozza') {
      return res.status(409).json({
        error: 'La votazione non e\' piu\' in bozza: non puo\' essere modificata',
      });
    }

    const seggi = req.body.seggi_da_eleggere !== undefined
      ? Number(req.body.seggi_da_eleggere)
      : votazione.seggi_da_eleggere;
    const preferenze = req.body.preferenze_max !== undefined
      ? Number(req.body.preferenze_max)
      : votazione.preferenze_max;

    if (!Number.isInteger(seggi) || seggi < 1) {
      return res.status(400).json({ error: 'Il numero di membri da eleggere deve essere almeno 1' });
    }
    if (!Number.isInteger(preferenze) || preferenze < 1 || preferenze > seggi) {
      return res.status(400).json({
        error: 'Le preferenze esprimibili non possono superare i membri da eleggere',
      });
    }

    const [aggiornata] = await sequelize.query(
      `UPDATE votazioni SET
          titolo = COALESCE(:titolo, titolo),
          descrizione = COALESCE(:descrizione, descrizione),
          assemblea_id = COALESCE(:assembleaId, assemblea_id),
          seggi_da_eleggere = :seggi,
          preferenze_max = :preferenze,
          destinatari = COALESCE(:destinatari, destinatari),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = :id RETURNING *`,
      {
        replacements: {
          id: votazione.id,
          titolo: req.body.titolo ?? null,
          descrizione: req.body.descrizione ?? null,
          assembleaId: req.body.assemblea_id ?? null,
          seggi,
          preferenze,
          destinatari: req.body.destinatari ? JSON.stringify(req.body.destinatari) : null,
        },
        type: QueryTypes.SELECT,
      }
    );

    res.json({ votazione: aggiornata });
  } catch (error) {
    logger.error('Errore modifica votazione:', error);
    res.status(500).json({ error: 'Errore durante la modifica della votazione' });
  }
};

/**
 * DELETE /api/v1/votazioni/:id
 * Eliminabile solo in bozza: una votazione aperta o conclusa e' un atto
 * dell'associazione e non puo' sparire dall'archivio.
 */
const deleteVotazione = async (req, res) => {
  try {
    const votazione = await caricaVotazione(req.params.id);
    if (!votazione) return res.status(404).json({ error: 'Votazione non trovata' });
    if (votazione.stato !== 'bozza') {
      return res.status(409).json({
        error: 'Solo una votazione in bozza puo\' essere eliminata',
      });
    }

    await sequelize.query('DELETE FROM votazioni WHERE id = :id', {
      replacements: { id: votazione.id },
      type: QueryTypes.DELETE,
    });

    res.json({ message: 'Votazione eliminata' });
  } catch (error) {
    logger.error('Errore eliminazione votazione:', error);
    res.status(500).json({ error: 'Errore durante l\'eliminazione della votazione' });
  }
};

/**
 * POST /api/v1/votazioni/:id/candidati
 */
const addCandidato = async (req, res) => {
  try {
    const votazione = await caricaVotazione(req.params.id);
    if (!votazione) return res.status(404).json({ error: 'Votazione non trovata' });
    if (votazione.stato !== 'bozza') {
      return res.status(409).json({
        error: 'Non si possono aggiungere candidati a votazione gia\' aperta',
      });
    }

    const { user_id, nome, cognome, note } = req.body;
    if (!nome || !cognome) {
      return res.status(400).json({ error: 'Nome e cognome del candidato sono obbligatori' });
    }

    const [{ prossimo }] = await sequelize.query(
      `SELECT COALESCE(MAX(ordine) + 1, 0) AS prossimo
         FROM candidati_votazione WHERE votazione_id = :id`,
      { replacements: { id: votazione.id }, type: QueryTypes.SELECT }
    );

    const [candidato] = await sequelize.query(
      `INSERT INTO candidati_votazione (votazione_id, user_id, nome, cognome, note, ordine)
       VALUES (:votazioneId, :userId, :nome, :cognome, :note, :ordine) RETURNING *`,
      {
        replacements: {
          votazioneId: votazione.id,
          userId: user_id || null,
          nome: String(nome).trim(),
          cognome: String(cognome).trim(),
          note: note || null,
          ordine: prossimo,
        },
        type: QueryTypes.SELECT,
      }
    );

    res.status(201).json({ candidato });
  } catch (error) {
    if (error?.parent?.code === '23505') {
      return res.status(409).json({ error: 'Questo socio e\' gia\' candidato in questa votazione' });
    }
    logger.error('Errore aggiunta candidato:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiunta del candidato' });
  }
};

/**
 * DELETE /api/v1/votazioni/:id/candidati/:candidatoId
 */
const deleteCandidato = async (req, res) => {
  try {
    const votazione = await caricaVotazione(req.params.id);
    if (!votazione) return res.status(404).json({ error: 'Votazione non trovata' });
    if (votazione.stato !== 'bozza') {
      return res.status(409).json({
        error: 'Non si possono rimuovere candidati a votazione gia\' aperta',
      });
    }

    const eliminati = await sequelize.query(
      `DELETE FROM candidati_votazione
        WHERE id = :candidatoId AND votazione_id = :votazioneId RETURNING id`,
      {
        replacements: { candidatoId: req.params.candidatoId, votazioneId: votazione.id },
        type: QueryTypes.SELECT,
      }
    );

    if (eliminati.length === 0) {
      return res.status(404).json({ error: 'Candidato non trovato' });
    }

    res.json({ message: 'Candidato rimosso' });
  } catch (error) {
    logger.error('Errore rimozione candidato:', error);
    res.status(500).json({ error: 'Errore durante la rimozione del candidato' });
  }
};

/**
 * POST /api/v1/votazioni/:id/apri
 * Congela l'elettorato e apre le urne.
 */
const apriVotazione = async (req, res) => {
  try {
    const votazione = await caricaVotazione(req.params.id);
    if (!votazione) return res.status(404).json({ error: 'Votazione non trovata' });
    if (votazione.stato !== 'bozza') {
      return res.status(409).json({ error: 'La votazione non e\' in bozza' });
    }

    const [{ totale: numCandidati }] = await sequelize.query(
      `SELECT COUNT(*)::int AS totale FROM candidati_votazione
        WHERE votazione_id = :id AND ritirato = false`,
      { replacements: { id: votazione.id }, type: QueryTypes.SELECT }
    );

    if (numCandidati === 0) {
      return res.status(400).json({ error: 'Non ci sono candidati: la votazione non puo\' essere aperta' });
    }
    if (numCandidati < votazione.seggi_da_eleggere) {
      return res.status(400).json({
        error: `I candidati (${numCandidati}) sono meno dei seggi da assegnare (${votazione.seggi_da_eleggere})`,
      });
    }

    const destinatari = votazione.destinatari || null;
    const elettori = await getElettoriAmmessi(destinatari);

    if (elettori.length === 0) {
      return res.status(400).json({ error: 'Nessun socio avente diritto: la votazione non puo\' essere aperta' });
    }

    await sequelize.transaction(async (t) => {
      for (const elettore of elettori) {
        await sequelize.query(
          `INSERT INTO aventi_diritto_votazione (votazione_id, user_id)
           VALUES (:votazioneId, :userId)
           ON CONFLICT (votazione_id, user_id) DO NOTHING`,
          {
            replacements: { votazioneId: votazione.id, userId: elettore.id },
            type: QueryTypes.INSERT,
            transaction: t,
          }
        );
      }

      await sequelize.query(
        `UPDATE votazioni
            SET stato = 'aperta', aperta_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = :id`,
        { replacements: { id: votazione.id }, type: QueryTypes.UPDATE, transaction: t }
      );
    });

    // La notifica non deve mai far fallire l'apertura delle urne.
    notificaDestinatari(destinatari, {
      subject: `Votazione aperta: ${votazione.titolo}`,
      titolo: votazione.titolo,
      corpoHtml: `<p>La votazione <strong>${votazione.titolo}</strong> e' aperta.</p>
                  <p>Puoi esprimere fino a ${votazione.preferenze_max} preferenze.</p>`
                  + rigaEmail(linkVotazione(votazione.id), 'Vai alla scheda di voto'),
      testoWhatsapp: `🗳️ *${votazione.titolo}*\n\nLa votazione e' aperta: puoi esprimere fino a ${votazione.preferenze_max} preferenze.`
                  + rigaWhatsapp(linkVotazione(votazione.id), 'Vai alla scheda di voto'),
    }).catch((err) => logger.error('Errore notifica apertura votazione:', err));

    res.json({
      message: 'Votazione aperta',
      aventi_diritto: elettori.length,
      candidati: numCandidati,
    });
  } catch (error) {
    logger.error('Errore apertura votazione:', error);
    res.status(500).json({ error: 'Errore durante l\'apertura della votazione' });
  }
};

/**
 * POST /api/v1/votazioni/:id/vota
 *
 * Il cuore del modulo. Tutto dentro una transazione con lock sulla riga
 * dell'elettore: e' cio' che impedisce il doppio voto anche con due
 * dispositivi che inviano nello stesso istante.
 */
const vota = async (req, res) => {
  try {
    const { candidati = [], scheda_bianca = false } = req.body;
    const votazioneId = req.params.id;

    if (!Array.isArray(candidati)) {
      return res.status(400).json({ error: 'Formato delle preferenze non valido' });
    }

    const esito = await sequelize.transaction(async (t) => {
      const [votazione] = await sequelize.query(
        'SELECT * FROM votazioni WHERE id = :id',
        { replacements: { id: votazioneId }, type: QueryTypes.SELECT, transaction: t }
      );
      if (!votazione) return { status: 404, body: { error: 'Votazione non trovata' } };
      if (votazione.stato !== 'aperta') {
        return { status: 409, body: { error: 'La votazione non e\' aperta' } };
      }

      // Lock sulla riga dell'elettore per tutta la durata della transazione.
      const [elettore] = await sequelize.query(
        `SELECT id, ha_votato FROM aventi_diritto_votazione
          WHERE votazione_id = :votazioneId AND user_id = :userId
          FOR UPDATE`,
        {
          replacements: { votazioneId, userId: req.user.id },
          type: QueryTypes.SELECT,
          transaction: t,
        }
      );

      if (!elettore) {
        return { status: 403, body: { error: 'Non risulti fra gli aventi diritto di questa votazione' } };
      }
      if (elettore.ha_votato) {
        return { status: 409, body: { error: 'Hai gia\' votato in questa votazione' } };
      }

      const preferenze = scheda_bianca ? [] : [...new Set(candidati.map(String))];

      if (!scheda_bianca && preferenze.length === 0) {
        return {
          status: 400,
          body: { error: 'Seleziona almeno una preferenza oppure scegli la scheda bianca' },
        };
      }
      if (preferenze.length !== candidati.length && !scheda_bianca) {
        return {
          status: 400,
          body: { error: 'Non puoi esprimere due volte la stessa preferenza' },
        };
      }
      if (preferenze.length > votazione.preferenze_max) {
        return {
          status: 400,
          body: { error: `Puoi esprimere al massimo ${votazione.preferenze_max} preferenze` },
        };
      }

      if (preferenze.length > 0) {
        const validi = await sequelize.query(
          `SELECT id FROM candidati_votazione
            WHERE votazione_id = :votazioneId AND ritirato = false AND id IN (:ids)`,
          {
            replacements: { votazioneId, ids: preferenze },
            type: QueryTypes.SELECT,
            transaction: t,
          }
        );
        if (validi.length !== preferenze.length) {
          return {
            status: 400,
            body: { error: 'Una o piu\' preferenze non corrispondono a candidati validi' },
          };
        }
      }

      const [scheda] = await sequelize.query(
        `INSERT INTO schede_votazione (votazione_id, scheda_bianca, num_preferenze)
         VALUES (:votazioneId, :bianca, :num) RETURNING id`,
        {
          replacements: {
            votazioneId,
            bianca: Boolean(scheda_bianca) || preferenze.length === 0,
            num: preferenze.length,
          },
          type: QueryTypes.SELECT,
          transaction: t,
        }
      );

      for (const candidatoId of preferenze) {
        await sequelize.query(
          `INSERT INTO voti_votazione (scheda_id, candidato_id)
           VALUES (:schedaId, :candidatoId)`,
          {
            replacements: { schedaId: scheda.id, candidatoId },
            type: QueryTypes.INSERT,
            transaction: t,
          }
        );
      }

      await sequelize.query(
        `UPDATE aventi_diritto_votazione
            SET ha_votato = true, votato_at = CURRENT_TIMESTAMP
          WHERE id = :id`,
        { replacements: { id: elettore.id }, type: QueryTypes.UPDATE, transaction: t }
      );

      return { status: 200, body: { message: 'Voto registrato', preferenze_espresse: preferenze.length } };
    });

    res.status(esito.status).json(esito.body);
  } catch (error) {
    logger.error('Errore registrazione voto:', error);
    res.status(500).json({ error: 'Errore durante la registrazione del voto' });
  }
};

/**
 * GET /api/v1/votazioni/:id/affluenza
 * Solo numeri di partecipazione: nessun conteggio per candidato, nemmeno per
 * l'admin, finche' le urne sono aperte.
 */
const getAffluenza = async (req, res) => {
  try {
    const votazione = await caricaVotazione(req.params.id);
    if (!votazione) return res.status(404).json({ error: 'Votazione non trovata' });

    const [affluenza] = await sequelize.query(
      `SELECT COUNT(*)::int AS aventi_diritto,
              COUNT(*) FILTER (WHERE ha_votato)::int AS votanti
         FROM aventi_diritto_votazione WHERE votazione_id = :id`,
      { replacements: { id: votazione.id }, type: QueryTypes.SELECT }
    );

    // Elenco di chi non ha ancora votato: utile in assemblea per sollecitare,
    // e non rivela nulla sul contenuto delle schede.
    const mancanti = await sequelize.query(
      `SELECT u.id, u.nome, u.cognome
         FROM aventi_diritto_votazione ad
         JOIN users u ON u.id = ad.user_id
        WHERE ad.votazione_id = :id AND ad.ha_votato = false
        ORDER BY u.cognome, u.nome`,
      { replacements: { id: votazione.id }, type: QueryTypes.SELECT }
    );

    res.json({
      stato: votazione.stato,
      ...affluenza,
      percentuale:
        affluenza.aventi_diritto > 0
          ? Math.round((affluenza.votanti / affluenza.aventi_diritto) * 1000) / 10
          : 0,
      non_votanti: mancanti,
    });
  } catch (error) {
    logger.error('Errore recupero affluenza:', error);
    res.status(500).json({ error: 'Errore durante il recupero dell\'affluenza' });
  }
};

/**
 * POST /api/v1/votazioni/:id/chiudi
 */
const chiudiVotazione = async (req, res) => {
  try {
    const votazione = await caricaVotazione(req.params.id);
    if (!votazione) return res.status(404).json({ error: 'Votazione non trovata' });
    if (votazione.stato !== 'aperta') {
      return res.status(409).json({ error: 'La votazione non e\' aperta' });
    }

    await sequelize.query(
      `UPDATE votazioni
          SET stato = 'chiusa', chiusa_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = :id`,
      { replacements: { id: votazione.id }, type: QueryTypes.UPDATE }
    );

    const dati = await raccogliDatiScrutinio(votazione.id);
    const esito = calcolaRisultati({
      seggi: votazione.seggi_da_eleggere,
      candidati: dati.candidati,
      conteggi: dati.conteggi,
      aventiDiritto: dati.aventiDiritto,
      votanti: dati.votanti,
      schedeBianche: dati.schedeBianche,
    });

    res.json({ message: 'Votazione chiusa', esito });
  } catch (error) {
    logger.error('Errore chiusura votazione:', error);
    res.status(500).json({ error: 'Errore durante la chiusura della votazione' });
  }
};

/**
 * GET /api/v1/votazioni/:id/risultati
 * Disponibili solo a urne chiuse: nessuna eccezione, nemmeno per l'admin.
 */
const getRisultati = async (req, res) => {
  try {
    const votazione = await caricaVotazione(req.params.id);
    if (!votazione) return res.status(404).json({ error: 'Votazione non trovata' });

    if (votazione.stato !== 'chiusa') {
      return res.status(403).json({
        error: 'I risultati sono disponibili solo a votazione chiusa',
        stato: votazione.stato,
      });
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

    res.json({ votazione, esito });
  } catch (error) {
    logger.error('Errore recupero risultati:', error);
    res.status(500).json({ error: 'Errore durante il recupero dei risultati' });
  }
};

/**
 * Registro presenze: l'elettorato congelato con presenza, delega, quota
 * dell'anno della votazione e partecipazione al voto. Mai il contenuto delle
 * schede, che non e' ricollegabile agli elettori.
 */
async function caricaRegistroPresenze(votazione) {
  const riferimento = votazione.aperta_at || votazione.data_assemblea || new Date();
  const anno = Number(new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', year: 'numeric' })
    .format(new Date(riferimento)));
  return sequelize.query(
    `SELECT ad.user_id, u.cognome, u.nome, ad.presenza, ad.delegato_user_id, ad.ha_votato,
            TRIM(CONCAT(dl.cognome, ' ', dl.nome)) AS delegato_nome,
            EXISTS (SELECT 1 FROM quote_associative q
                     WHERE q.user_id = ad.user_id AND q.anno = :anno AND q.pagata) AS quota_in_regola
       FROM aventi_diritto_votazione ad
       JOIN users u ON u.id = ad.user_id
       LEFT JOIN users dl ON dl.id = ad.delegato_user_id
      WHERE ad.votazione_id = :id
      ORDER BY u.cognome, u.nome`,
    { replacements: { id: votazione.id, anno }, type: QueryTypes.SELECT }
  );
}

/**
 * GET /api/v1/votazioni/:id/dati-verbale (solo admin)
 * Dati della seduta e registro presenze da completare prima del verbale.
 */
const getDatiVerbale = async (req, res) => {
  try {
    const votazione = await caricaVotazione(req.params.id);
    if (!votazione) return res.status(404).json({ error: 'Votazione non trovata' });
    if (votazione.stato === 'bozza') {
      return res.status(409).json({ error: 'Il registro esiste solo dopo l\'apertura delle urne' });
    }

    const registro = await caricaRegistroPresenze(votazione);
    const dati = votazione.dati_verbale || {};
    res.json({
      dati,
      assemblea: {
        id: votazione.assemblea_id,
        titolo: votazione.assemblea_titolo,
        data: votazione.data_assemblea,
        luogo: votazione.assemblea_luogo,
      },
      registro,
      presenze: calcolaPresenze(registro, dati.convocazione),
    });
  } catch (error) {
    logger.error('Errore recupero dati verbale:', error);
    res.status(500).json({ error: 'Errore durante il recupero dei dati del verbale' });
  }
};

/**
 * PUT /api/v1/votazioni/:id/dati-verbale (solo admin)
 * Body: { dati: {...}, registro: [{ user_id, presenza, delegato_user_id }] }
 * I dati di scrutinio non si toccano: qui si descrive solo la seduta.
 */
const salvaDatiVerbale = async (req, res) => {
  try {
    const votazione = await caricaVotazione(req.params.id);
    if (!votazione) return res.status(404).json({ error: 'Votazione non trovata' });
    if (!['aperta', 'chiusa'].includes(votazione.stato)) {
      return res.status(409).json({ error: 'I dati del verbale si compilano a urne aperte o chiuse' });
    }

    const { dati, errore } = normalizzaDatiVerbale(req.body.dati || {});
    if (errore) return res.status(400).json({ error: errore });

    let righe = null;
    if (req.body.registro !== undefined) {
      const elettorato = await sequelize.query(
        'SELECT user_id FROM aventi_diritto_votazione WHERE votazione_id = :id',
        { replacements: { id: votazione.id }, type: QueryTypes.SELECT }
      );
      const esito = validaRegistroPresenze(req.body.registro, new Set(elettorato.map((e) => e.user_id)));
      if (esito.errore) return res.status(400).json({ error: esito.errore });
      righe = esito.righe;
    }

    await sequelize.transaction(async (t) => {
      await sequelize.query(
        `UPDATE votazioni SET dati_verbale = CAST(:dati AS JSONB), updated_at = CURRENT_TIMESTAMP
          WHERE id = :id`,
        { replacements: { id: votazione.id, dati: JSON.stringify(dati) }, transaction: t }
      );
      if (righe) {
        // Il registro inviato sostituisce quello salvato: chi non vi compare
        // torna "non registrato".
        await sequelize.query(
          `UPDATE aventi_diritto_votazione SET presenza = NULL, delegato_user_id = NULL
            WHERE votazione_id = :id`,
          { replacements: { id: votazione.id }, transaction: t }
        );
        for (const r of righe) {
          await sequelize.query(
            `UPDATE aventi_diritto_votazione
                SET presenza = :presenza, delegato_user_id = :delegato
              WHERE votazione_id = :id AND user_id = :userId`,
            {
              replacements: {
                id: votazione.id,
                userId: r.user_id,
                presenza: r.presenza,
                delegato: r.delegato_user_id,
              },
              transaction: t,
            }
          );
        }
      }
    });

    const registro = await caricaRegistroPresenze(votazione);
    res.json({
      message: 'Dati del verbale salvati',
      dati,
      registro,
      presenze: calcolaPresenze(registro, dati.convocazione),
    });
  } catch (error) {
    logger.error('Errore salvataggio dati verbale:', error);
    res.status(500).json({ error: 'Errore durante il salvataggio dei dati del verbale' });
  }
};

/**
 * GET /api/v1/votazioni/:id/verbale
 * Genera al volo il PDF del verbale d'assemblea, con il registro presenze.
 */
const getVerbale = async (req, res) => {
  try {
    const votazione = await caricaVotazione(req.params.id);
    if (!votazione) return res.status(404).json({ error: 'Votazione non trovata' });
    if (votazione.stato !== 'chiusa') {
      return res.status(403).json({ error: 'Il verbale e\' disponibile solo a votazione chiusa' });
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

    const nomeFile = `verbale-votazione-${votazione.id}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeFile}"`);
    const datiVerbale = votazione.dati_verbale || {};
    const registro = await caricaRegistroPresenze(votazione);
    const presenze = calcolaPresenze(registro, datiVerbale.convocazione);
    // Gli allegati del verbale stanno sull'assemblea collegata alla votazione.
    const { allegatiVerbale } = require('./assemblee.controller');
    const allegati = await allegatiVerbale(votazione.assemblea_id);
    const { caricaCartaIntestata } = require('../utils/cartaIntestata');
    const cartaIntestata = await caricaCartaIntestata();
    generaVerbalePdf({ votazione, esito, dati: datiVerbale, registro, presenze, allegati }, res, { cartaIntestata });
  } catch (error) {
    logger.error('Errore generazione verbale:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Errore durante la generazione del verbale' });
    }
  }
};

/**
 * GET /api/v1/votazioni/:id/export
 */
const exportRisultati = async (req, res) => {
  try {
    const votazione = await caricaVotazione(req.params.id);
    if (!votazione) return res.status(404).json({ error: 'Votazione non trovata' });
    if (votazione.stato !== 'chiusa') {
      return res.status(403).json({ error: 'L\'export e\' disponibile solo a votazione chiusa' });
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

    const righe = [
      '"Posizione","Cognome","Nome","Voti","% votanti","Eletto","Ballottaggio"',
      ...esito.risultati.map((r) =>
        [
          r.posizione,
          `"${(r.cognome || '').replace(/"/g, '""')}"`,
          `"${(r.nome || '').replace(/"/g, '""')}"`,
          r.voti,
          r.percentuale_votanti,
          r.eletto ? 'SI' : 'NO',
          r.ballottaggio ? 'SI' : 'NO',
        ].join(',')
      ),
    ];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="risultati-votazione-${votazione.id}.csv"`);
    res.send(`﻿${righe.join('\n')}`);
  } catch (error) {
    logger.error('Errore export risultati:', error);
    res.status(500).json({ error: 'Errore durante l\'export dei risultati' });
  }
};

module.exports = {
  getVotazioni,
  getVotazioneById,
  createVotazione,
  updateVotazione,
  deleteVotazione,
  addCandidato,
  deleteCandidato,
  apriVotazione,
  vota,
  getAffluenza,
  chiudiVotazione,
  getRisultati,
  getVerbale,
  getDatiVerbale,
  salvaDatiVerbale,
  exportRisultati,
  // esportati per i test
  getElettoriAmmessi,
  raccogliDatiScrutinio,
};
