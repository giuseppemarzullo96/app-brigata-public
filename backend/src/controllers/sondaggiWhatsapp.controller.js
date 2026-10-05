const crypto = require('crypto');
const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');
const logger = require('../utils/logger');
const { sendPoll } = require('../utils/whatsapp');
const { componiSondaggiTurno } = require('../utils/sondaggiTurno');
const { estraiVoto } = require('../utils/votiWhatsapp');
const { registraVoto } = require('../services/sondaggiWhatsapp.service');
const { getImpostazione } = require('../utils/impostazioni');

/**
 * Sondaggi WhatsApp per coprire gli slot liberi di un turno.
 *
 * Si pubblica un sondaggio per ogni pietanza scoperta, con una opzione per
 * ogni singolo posto. I voti tornano dal webhook e vengono applicati dal
 * servizio, che assegna e libera.
 */

/** Confronto a tempo costante, per non far indovinare il token un carattere alla volta. */
function tokenValido(ricevuto) {
  const atteso = process.env.WHATSAPP_WEBHOOK_TOKEN;
  if (!atteso || !ricevuto) return false;
  const a = Buffer.from(String(atteso));
  const b = Buffer.from(String(ricevuto));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * POST /api/v1/turni/:turnoId/sondaggi-whatsapp
 * Pubblica sul gruppo un sondaggio per ogni pietanza ancora scoperta.
 */
const pubblicaSondaggi = async (req, res) => {
  try {
    const { turnoId } = req.params;

    const [turno] = await sequelize.query(
      'SELECT id, data_turno FROM turni_cucina WHERE id = :turnoId',
      { replacements: { turnoId }, type: QueryTypes.SELECT }
    );
    if (!turno) return res.status(404).json({ error: 'Turno non trovato' });

    const gruppo = await getImpostazione('gruppo_whatsapp_cucine');
    if (!gruppo) {
      return res.status(400).json({
        error: 'Nessun gruppo WhatsApp configurato: impostalo prima di pubblicare i sondaggi',
      });
    }

    const slotLiberi = await sequelize.query(
      `SELECT s.id, s.tipo_slot, s.numero_porzioni, r.nome_ricetta
         FROM slot_turno s
         LEFT JOIN ricettari r ON r.id = s.ricettario_id
        WHERE s.turno_id = :turnoId AND s.stato = 'libero'
        ORDER BY s.tipo_slot, s.numero_porzioni DESC, s.created_at`,
      { replacements: { turnoId }, type: QueryTypes.SELECT }
    );

    if (slotLiberi.length === 0) {
      return res.status(400).json({ error: 'Questo turno non ha slot scoperti' });
    }

    const composti = componiSondaggiTurno({ dataTurno: turno.data_turno, slotLiberi });
    const pubblicati = [];
    const scartati = [];

    for (const sondaggio of composti) {
      if (!sondaggio.domanda || sondaggio.opzioni.length === 0) {
        scartati.push({ tipoSlot: sondaggio.tipoSlot, motivo: sondaggio.scartato || 'non-inviabile' });
        continue;
      }

      const esito = await sendPoll(
        gruppo,
        sondaggio.domanda,
        // I posti e, in fondo, «Questa volta non posso»: quest'ultima non va
        // fra le opzioni salvate qui sotto, perche' non e' legata a uno slot.
        sondaggio.etichette
      );

      if (!esito.sent) {
        scartati.push({ tipoSlot: sondaggio.tipoSlot, motivo: esito.reason });
        continue;
      }

      await sequelize.transaction(async (transaction) => {
        // Un sondaggio precedente sulla stessa pietanza va chiuso: due
        // sondaggi vivi sugli stessi posti si darebbero contro a vicenda.
        await sequelize.query(
          `UPDATE sondaggi_whatsapp SET stato = 'chiuso', updated_at = CURRENT_TIMESTAMP
            WHERE turno_id = :turnoId AND tipo_slot = :tipo AND stato = 'aperto'`,
          {
            replacements: { turnoId, tipo: sondaggio.tipoSlot },
            type: QueryTypes.UPDATE,
            transaction,
          }
        );

        const [creato] = await sequelize.query(
          `INSERT INTO sondaggi_whatsapp
             (turno_id, tipo_slot, gruppo_jid, wa_message_id, domanda, stato, created_by)
           VALUES (:turnoId, :tipo, :gruppo, :messageId, :domanda, 'aperto', :userId)
           RETURNING id`,
          {
            replacements: {
              turnoId,
              tipo: sondaggio.tipoSlot,
              gruppo,
              messageId: esito.messageId,
              domanda: sondaggio.domanda,
              userId: req.user.id,
            },
            type: QueryTypes.SELECT,
            transaction,
          }
        );

        for (const opzione of sondaggio.opzioni) {
          await sequelize.query(
            `INSERT INTO opzioni_sondaggio_whatsapp (sondaggio_id, slot_id, etichetta)
             VALUES (:sondaggioId, :slotId, :etichetta)`,
            {
              replacements: {
                sondaggioId: creato.id,
                slotId: opzione.slotId,
                etichetta: opzione.etichetta,
              },
              type: QueryTypes.INSERT,
              transaction,
            }
          );
        }

        pubblicati.push({
          id: creato.id,
          tipoSlot: sondaggio.tipoSlot,
          opzioni: sondaggio.opzioni.length,
        });
      });
    }

    logger.info(`Sondaggi WhatsApp per il turno ${turnoId}: ${pubblicati.length} pubblicati da ${req.user.email}`);
    res.status(pubblicati.length > 0 ? 201 : 502).json({ pubblicati, scartati });
  } catch (error) {
    logger.error('Errore pubblicazione sondaggi WhatsApp:', error);
    res.status(500).json({ error: 'Errore durante la pubblicazione dei sondaggi' });
  }
};

/**
 * GET /api/v1/turni/:turnoId/sondaggi-whatsapp
 * Sondaggi pubblicati per il turno, con quanti posti hanno coperto.
 */
const getSondaggiTurno = async (req, res) => {
  try {
    const { turnoId } = req.params;
    const sondaggi = await sequelize.query(
      `SELECT sw.id, sw.tipo_slot, sw.domanda, sw.stato, sw.created_at,
              (SELECT count(*) FROM opzioni_sondaggio_whatsapp o WHERE o.sondaggio_id = sw.id) AS opzioni,
              (SELECT count(*) FROM prenotazioni_sondaggio_whatsapp p WHERE p.sondaggio_id = sw.id) AS coperti
         FROM sondaggi_whatsapp sw
        WHERE sw.turno_id = :turnoId
        ORDER BY sw.created_at DESC`,
      { replacements: { turnoId }, type: QueryTypes.SELECT }
    );
    res.json({ sondaggi });
  } catch (error) {
    logger.error('Errore lettura sondaggi WhatsApp:', error);
    res.status(500).json({ error: 'Errore durante il recupero dei sondaggi' });
  }
};

/**
 * POST /api/v1/webhook/whatsapp/:token
 * Riceve gli eventi da Evolution. Non e' autenticato come il resto dell'API,
 * perche' a chiamarlo e' un servizio e non una persona: al posto del token di
 * sessione c'e' un segreto nel percorso.
 *
 * Risponde 200 anche quando non c'e' niente da fare: un errore farebbe
 * riprovare Evolution all'infinito su un evento che comunque ignoriamo.
 */
const riceviEvento = async (req, res) => {
  if (!tokenValido(req.params.token)) {
    logger.warn(`Webhook WhatsApp: token non valido da ${req.ip}`);
    return res.status(404).json({ error: 'Non trovato' });
  }

  try {
    const voto = estraiVoto(req.body);
    if (!voto) return res.json({ ok: true, ignorato: 'non-e-un-voto' });

    const esito = await registraVoto(sequelize, voto);

    if (esito.ignorato) {
      logger.info(`Webhook WhatsApp: voto ignorato (${esito.ignorato})`);
    } else {
      logger.info(
        `Webhook WhatsApp: ${esito.assegnati.length} posti assegnati, ` +
        `${esito.liberati.length} liberati, ${esito.occupati.length} gia' presi`
      );
    }

    res.json({ ok: true, esito });
  } catch (error) {
    // Nemmeno un errore interno deve innescare il rinvio all'infinito.
    logger.error('Errore elaborazione voto WhatsApp:', error);
    res.json({ ok: false });
  }
};

module.exports = { pubblicaSondaggi, getSondaggiTurno, riceviEvento, tokenValido };
