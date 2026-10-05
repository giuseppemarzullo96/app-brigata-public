const crypto = require('crypto');
const { QueryTypes } = require('sequelize');
const logger = require('../utils/logger');
const { normalizzaNumero } = require('../utils/whatsapp');

/**
 * Dal voto su WhatsApp al posto assegnato nel turno.
 *
 * Il principio da tenere a mente e' che un voto NON e' un evento ("prenoto
 * questo"), e' uno stato ("in questo momento ho spuntato queste opzioni").
 * Per questo qui non si "aggiunge" e basta: si riconcilia. Si confronta cio'
 * che la persona ha spuntato adesso con cio' che le era gia' stato dato
 * tramite questo sondaggio, si assegna la differenza in piu' e si libera la
 * differenza in meno.
 */

/** Uno slot preso dal sondaggio e' tracciato: cosi' non si tocca mai un posto
 *  che il gestore ha assegnato a mano. */
const TIPO_ATTIVITA = 'cucina';

/**
 * Trova chi ha votato, o gli crea un'anagrafica segnaposto.
 *
 * L'ordine di ricerca conta: prima il LID, che WhatsApp garantisce stabile,
 * poi il numero. I numeri in archivio sono scritti nei modi piu' vari
 * ("333 1234567", "+39 333 1234567"), quindi il confronto avviene sulla forma
 * normalizzata, non sulla stringa grezza.
 */
async function trovaOCreaVotante(sequelize, { lid, telefono, pushName }, opzioni = {}) {
  const transaction = opzioni.transaction;

  if (lid) {
    const [perLid] = await sequelize.query(
      'SELECT id, nome, cognome, ragione_sociale, telefono FROM users WHERE wa_lid = :lid AND archiviato = false',
      { replacements: { lid }, type: QueryTypes.SELECT, transaction }
    );
    if (perLid) return { utente: perLid, creato: false };
  }

  const numero = telefono ? normalizzaNumero(telefono) : null;
  if (numero) {
    const candidati = await sequelize.query(
      "SELECT id, nome, cognome, ragione_sociale, telefono, wa_lid FROM users WHERE telefono IS NOT NULL AND telefono <> '' AND archiviato = false",
      { type: QueryTypes.SELECT, transaction }
    );
    const trovato = candidati.find((u) => normalizzaNumero(u.telefono) === numero);
    if (trovato) {
      // Da ora in poi lo riconosceremo dal LID, che non cambia.
      if (lid && !trovato.wa_lid) {
        await sequelize.query(
          'UPDATE users SET wa_lid = :lid, updated_at = CURRENT_TIMESTAMP WHERE id = :id',
          { replacements: { lid, id: trovato.id }, type: QueryTypes.UPDATE, transaction }
        );
      }
      return { utente: trovato, creato: false };
    }
  }

  // Nessuno corrisponde: si crea un segnaposto, da rinominare dall'app.
  // Il nome WhatsApp e' molto meglio del numero nudo, ma puo' mancare.
  const etichetta = pushName || (numero ? `+${numero}` : lid);
  const riferimento = numero || lid;
  const email = `wa-${riferimento}@fittizio.labrigataodv.it`;
  // Nessuno entrera' mai con queste credenziali: e' un'anagrafica, non un accesso.
  const passwordCasuale = crypto.randomBytes(32).toString('hex');

  const [creato] = await sequelize.query(
    `INSERT INTO users
       (email, password_hash, nome, cognome, categoria_socio, ruolo, tipo_persona,
        telefono, wa_lid, attivo, archiviato, sospeso, fittizio, consenso_privacy)
     VALUES (:email, :password, :nome, '', 'esterno', 'esterno', 'fisica',
             :telefono, :lid, true, false, false, true, false)
     ON CONFLICT (email) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
     RETURNING id, nome, cognome, ragione_sociale, telefono`,
    {
      replacements: {
        email,
        password: passwordCasuale,
        nome: etichetta,
        telefono: numero || null,
        lid: lid || null,
      },
      type: QueryTypes.SELECT,
      transaction,
    }
  );

  logger.info(`Sondaggio WhatsApp: creata anagrafica segnaposto "${etichetta}"`);
  return { utente: creato, creato: true };
}

/** «Roberta Costantino», «Parrocchia San Luca». */
function nomeDi(u) {
  if (!u) return 'qualcuno';
  return u.ragione_sociale || `${u.nome || ''} ${u.cognome || ''}`.trim() || 'qualcuno';
}

/** «24/09 22:17», sempre all'ora italiana: il server gira in UTC. */
function adesso() {
  const parti = new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date());
  const v = (t) => parti.find((p) => p.type === t)?.value;
  return `${v('day')}/${v('month')} ${v('hour')}:${v('minute')}`;
}

/**
 * Aggiunge una riga in fondo alle note del posto, sotto quello che c'era.
 * Le note le legge il gestore nella scheda del posto: cosi' sa perche' quel
 * posto e' di chi e', senza dover chiedere sul gruppo.
 */
async function annota(sequelize, slotId, testo, transaction) {
  const riga = `${adesso()} · ${testo}`;
  await sequelize.query(
    `UPDATE slot_turno
        SET note = CASE WHEN note IS NULL OR note = '' THEN :riga ELSE note || E'\n' || :riga END,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = :slotId`,
    { replacements: { riga, slotId }, type: QueryTypes.UPDATE, transaction }
  );
}

/** Da' il posto a una persona e registra che l'ha avuto dal sondaggio. */
async function assegnaDaSondaggio(sequelize, { sondaggio, opzioneId, slotId, userId, lid, telefono }, transaction) {
  // "Se lo prende il primo che vota" sta tutto in questa condizione:
  // l'UPDATE riesce solo se il posto e' ancora libero. Due voti
  // simultanei sullo stesso slot non possono vincere entrambi.
  const preso = await sequelize.query(
    `UPDATE slot_turno SET user_id = :userId, stato = 'assegnato', updated_at = CURRENT_TIMESTAMP
      WHERE id = :slotId AND stato = 'libero' AND user_id IS NULL
      RETURNING id`,
    { replacements: { slotId, userId }, type: QueryTypes.SELECT, transaction }
  );
  if (preso.length === 0) return false;

  await sequelize.query(
    `INSERT INTO partecipazioni_attivita (user_id, tipo_attivita, data_attivita, turno_id, slot_id)
     SELECT :userId, :tipo, t.data_turno, t.id, :slotId
       FROM turni_cucina t WHERE t.id = :turnoId`,
    {
      replacements: { userId, tipo: TIPO_ATTIVITA, slotId, turnoId: sondaggio.turno_id },
      type: QueryTypes.INSERT,
      transaction,
    }
  );

  await sequelize.query(
    `INSERT INTO prenotazioni_sondaggio_whatsapp
       (sondaggio_id, opzione_id, slot_id, user_id, wa_lid, wa_telefono)
     VALUES (:sondaggioId, :opzioneId, :slotId, :userId, :lid, :telefono)`,
    {
      replacements: {
        sondaggioId: sondaggio.id, opzioneId, slotId, userId, lid: lid || null, telefono: telefono || null,
      },
      type: QueryTypes.INSERT,
      transaction,
    }
  );
  return true;
}

/**
 * Il posto appena liberato passa al primo in lista d'attesa, se c'e'.
 * @returns {object|null} chi l'ha avuto
 */
async function scalaAlProssimo(sequelize, { sondaggio, opzioneId, slotId }, transaction) {
  const attese = await sequelize.query(
    `SELECT a.id, a.user_id, a.wa_lid, a.wa_telefono, u.nome, u.cognome, u.ragione_sociale
       FROM attese_sondaggio_whatsapp a JOIN users u ON u.id = a.user_id
      WHERE a.opzione_id = :opzioneId
      ORDER BY a.created_at, a.id
      FOR UPDATE OF a`,
    { replacements: { opzioneId }, type: QueryTypes.SELECT, transaction }
  );

  for (const attesa of attese) {
    await sequelize.query('DELETE FROM attese_sondaggio_whatsapp WHERE id = :id', {
      replacements: { id: attesa.id }, type: QueryTypes.DELETE, transaction,
    });
    const ok = await assegnaDaSondaggio(sequelize, {
      sondaggio, opzioneId, slotId, userId: attesa.user_id, lid: attesa.wa_lid, telefono: attesa.wa_telefono,
    }, transaction);
    if (ok) return attesa;
  }
  return null;
}

/**
 * Applica un voto: assegna i posti appena spuntati, libera quelli tolti.
 *
 * Chi spunta un posto gia' preso entra in lista d'attesa per quel posto; chi
 * toglie il voto a un posto suo lo passa al primo della lista. Ogni passaggio
 * finisce in una riga delle note del posto.
 *
 * @returns {object} riepilogo di cosa e' cambiato, utile ai log e ai test.
 */
async function registraVoto(sequelize, voto) {
  const { waMessageId, lid, telefono, pushName, etichette } = voto;

  const [sondaggio] = await sequelize.query(
    "SELECT id, turno_id, tipo_slot, stato FROM sondaggi_whatsapp WHERE wa_message_id = :waMessageId",
    { replacements: { waMessageId }, type: QueryTypes.SELECT }
  );

  if (!sondaggio) return { ignorato: 'sondaggio-sconosciuto' };
  if (sondaggio.stato !== 'aperto') return { ignorato: 'sondaggio-chiuso' };

  const { utente, creato } = await trovaOCreaVotante(sequelize, { lid, telefono, pushName });
  const chi = nomeDi(utente);

  // Gestori e admin votano anche per conto di chi si offre a voce, poi
  // riassegnano il posto dall'app: quando tolgono il voto il posto si libera
  // comunque. Per tutti gli altri vale la protezione del posto riassegnato.
  const [ruolo] = await sequelize.query('SELECT ruolo FROM users WHERE id = :id', {
    replacements: { id: utente.id }, type: QueryTypes.SELECT,
  });
  const perContoDiAltri = ['admin', 'gestore_cucine'].includes(ruolo?.ruolo);

  // Le opzioni che questo sondaggio conosce davvero. Un'etichetta che non
  // corrisponde a nulla («Questa volta non posso», per esempio) viene
  // ignorata invece di far fallire tutto il voto.
  const opzioni = await sequelize.query(
    'SELECT id, slot_id, etichetta FROM opzioni_sondaggio_whatsapp WHERE sondaggio_id = :sondaggioId',
    { replacements: { sondaggioId: sondaggio.id }, type: QueryTypes.SELECT }
  );
  const perEtichetta = new Map(opzioni.map((o) => [o.etichetta, o]));

  const volute = (etichette || []).map((e) => perEtichetta.get(e)).filter(Boolean);
  const idVolute = new Set(volute.map((o) => o.id));

  const gia = await sequelize.query(
    `SELECT id, opzione_id, slot_id FROM prenotazioni_sondaggio_whatsapp
      WHERE sondaggio_id = :sondaggioId AND user_id = :userId`,
    { replacements: { sondaggioId: sondaggio.id, userId: utente.id }, type: QueryTypes.SELECT }
  );
  const inLista = await sequelize.query(
    `SELECT id, opzione_id, slot_id FROM attese_sondaggio_whatsapp
      WHERE sondaggio_id = :sondaggioId AND user_id = :userId`,
    { replacements: { sondaggioId: sondaggio.id, userId: utente.id }, type: QueryTypes.SELECT }
  );
  const idGia = new Set(gia.map((p) => p.opzione_id));
  const idInLista = new Set(inLista.map((a) => a.opzione_id));

  const daAggiungere = volute.filter((o) => !idGia.has(o.id) && !idInLista.has(o.id));
  const daTogliere = gia.filter((p) => !idVolute.has(p.opzione_id));
  const daTogliereDallaLista = inLista.filter((a) => !idVolute.has(a.opzione_id));

  const assegnati = [];
  const liberati = [];
  const occupati = [];
  const inAttesa = [];
  const scalati = [];

  // Prima si libera: se qualcuno cambia idea fra due posti, il primo torna
  // disponibile prima che si provi a prendere il secondo.
  for (const prenotazione of daTogliere) {
    await sequelize.transaction(async (transaction) => {
      // Si libera solo se il posto e' ancora di quella persona: se nel
      // frattempo il gestore lo ha riassegnato, il sondaggio non ci mette bocca.
      // Fa eccezione il gestore che aveva votato per conto di un altro.
      const [prima] = await sequelize.query(
        `SELECT s.user_id, u.nome, u.cognome, u.ragione_sociale
           FROM slot_turno s LEFT JOIN users u ON u.id = s.user_id WHERE s.id = :slotId`,
        { replacements: { slotId: prenotazione.slot_id }, type: QueryTypes.SELECT, transaction }
      );
      const liberato = await sequelize.query(
        `UPDATE slot_turno SET user_id = NULL, stato = 'libero', updated_at = CURRENT_TIMESTAMP
          WHERE id = :slotId AND (user_id = :userId OR (:perConto AND user_id IS NOT NULL))
          RETURNING id`,
        {
          replacements: { slotId: prenotazione.slot_id, userId: utente.id, perConto: perContoDiAltri },
          type: QueryTypes.SELECT,
          transaction,
        }
      );
      const eraDiUnAltro = prima && prima.user_id && prima.user_id !== utente.id;

      await sequelize.query(
        'DELETE FROM prenotazioni_sondaggio_whatsapp WHERE id = :id',
        { replacements: { id: prenotazione.id }, type: QueryTypes.DELETE, transaction }
      );

      if (liberato.length === 0) {
        await annota(sequelize, prenotazione.slot_id,
          `${chi} ha tolto il voto su WhatsApp, ma il posto era gia' stato riassegnato a mano: non cambia niente`,
          transaction);
        return;
      }

      await sequelize.query(
        'DELETE FROM partecipazioni_attivita WHERE slot_id = :slotId AND user_id = :userId',
        {
          replacements: { slotId: prenotazione.slot_id, userId: eraDiUnAltro ? prima.user_id : utente.id },
          type: QueryTypes.DELETE,
          transaction,
        }
      );
      liberati.push(prenotazione.slot_id);

      const prossimo = await scalaAlProssimo(sequelize, {
        sondaggio, opzioneId: prenotazione.opzione_id, slotId: prenotazione.slot_id,
      }, transaction);

      if (prossimo) {
        scalati.push({ slotId: prenotazione.slot_id, userId: prossimo.user_id });
        await annota(sequelize, prenotazione.slot_id,
          `${chi} ha tolto il voto su WhatsApp: il posto passa a ${nomeDi(prossimo)}, primo in lista d'attesa`,
          transaction);
      } else {
        await annota(sequelize, prenotazione.slot_id,
          eraDiUnAltro
            ? `${chi} ha tolto il voto su WhatsApp: il posto che aveva preso per ${nomeDi(prima)} torna libero`
            : `${chi} ha tolto il voto su WhatsApp: il posto torna libero`,
          transaction);
      }
    });
  }

  // Chi era in lista e non spunta piu' quel posto esce dalla lista.
  for (const attesa of daTogliereDallaLista) {
    await sequelize.transaction(async (transaction) => {
      await sequelize.query('DELETE FROM attese_sondaggio_whatsapp WHERE id = :id', {
        replacements: { id: attesa.id }, type: QueryTypes.DELETE, transaction,
      });
      await annota(sequelize, attesa.slot_id,
        `${chi} ha tolto il voto su WhatsApp: esce dalla lista d'attesa`, transaction);
    });
  }

  for (const opzione of daAggiungere) {
    try {
      await sequelize.transaction(async (transaction) => {
        const ok = await assegnaDaSondaggio(sequelize, {
          sondaggio, opzioneId: opzione.id, slotId: opzione.slot_id, userId: utente.id, lid, telefono,
        }, transaction);

        if (ok) {
          await annota(sequelize, opzione.slot_id, `Preso da ${chi} con il sondaggio WhatsApp`, transaction);
          assegnati.push(opzione.slot_id);
          return;
        }

        // Il posto e' gia' preso. Se e' gia' suo (glielo ha dato il gestore a
        // mano) non c'e' niente da fare; se e' di un altro, si entra in lista.
        const [ora] = await sequelize.query('SELECT user_id FROM slot_turno WHERE id = :id', {
          replacements: { id: opzione.slot_id }, type: QueryTypes.SELECT, transaction,
        });
        if (ora && ora.user_id === utente.id) return;
        occupati.push(opzione.slot_id);
        const messo = await sequelize.query(
          `INSERT INTO attese_sondaggio_whatsapp (sondaggio_id, opzione_id, slot_id, user_id, wa_lid, wa_telefono)
           VALUES (:sondaggioId, :opzioneId, :slotId, :userId, :lid, :telefono)
           ON CONFLICT (opzione_id, user_id) DO NOTHING
           RETURNING id`,
          {
            replacements: {
              sondaggioId: sondaggio.id, opzioneId: opzione.id, slotId: opzione.slot_id,
              userId: utente.id, lid: lid || null, telefono: telefono || null,
            },
            type: QueryTypes.SELECT,
            transaction,
          }
        );
        if (messo.length > 0) {
          inAttesa.push(opzione.slot_id);
          await annota(sequelize, opzione.slot_id,
            `Votato anche da ${chi} su WhatsApp: in lista d'attesa`, transaction);
        }
      });
    } catch (errore) {
      // UNIQUE(slot_id) su prenotazioni: qualcuno e' arrivato un istante prima.
      logger.warn(`Sondaggio WhatsApp: slot ${opzione.slot_id} gia' preso (${errore.message})`);
      occupati.push(opzione.slot_id);
    }
  }

  return {
    sondaggioId: sondaggio.id,
    utenteId: utente.id,
    anagraficaCreata: creato,
    assegnati,
    liberati,
    occupati,
    inAttesa,
    scalati,
  };
}

module.exports = { registraVoto, trovaOCreaVotante };
