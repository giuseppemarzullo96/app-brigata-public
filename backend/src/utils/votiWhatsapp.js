/**
 * Lettura dei voti ai sondaggi che arrivano dal webhook di Evolution.
 *
 * Questo modulo non tocca il database e non parla con nessuno: prende il
 * pacchetto grezzo e ne estrae i quattro dati che servono. E' isolato apposta,
 * perche' e' l'unico punto che dipende dalla forma del payload di WhatsApp: se
 * un domani Evolution cambia struttura, si riscrive qui dentro e il resto del
 * meccanismo non se ne accorge.
 *
 * Forma reale osservata sul campo (istanza Evolution 2.3.7, voto da iOS):
 *
 *   key.id                -> id di QUESTO messaggio di voto
 *   key.participant       -> "44160971190503@lid"          identificativo stabile
 *   key.participantAlt    -> "393330000000@s.whatsapp.net" numero, puo' mancare
 *   pushName              -> "Marzullo"                    nome WhatsApp
 *   message.pollUpdateMessage.vote.selectedOptions
 *                         -> ["1° posto - 20 mele"]        gia' in chiaro
 *   message.pollUpdateMessage.pollCreationMessageKey.id
 *                         -> id del sondaggio votato
 *
 * ATTENZIONE, e' la cosa che cambia tutto: `selectedOptions` NON e' "cosa ha
 * appena aggiunto", e' l'elenco COMPLETO delle opzioni che quella persona ha
 * spuntate in quel momento. Chi toglie una spunta manda un messaggio con una
 * opzione in meno, e chi le toglie tutte ne manda uno con la lista vuota.
 * Trattarlo come un evento "prenota" moltiplicherebbe le assegnazioni a ogni
 * ripensamento, senza liberarne mai nessuna.
 */

/** Toglie il suffisso del JID: "393330000000@s.whatsapp.net" -> "393330000000". */
function soloIdentificativo(jid) {
  if (!jid) return null;
  return String(jid).split('@')[0] || null;
}

/**
 * Estrae il voto da un evento del webhook.
 *
 * Accetta sia il pacchetto completo di Evolution ({ event, instance, data })
 * sia il solo messaggio, perche' a seconda della configurazione arriva in una
 * forma o nell'altra.
 *
 * @returns {object|null} null se l'evento non e' un voto a un sondaggio.
 *   Altrimenti: { waMessageId, lid, telefono, pushName, etichette, gruppoJid }
 */
function estraiVoto(evento) {
  if (!evento || typeof evento !== 'object') return null;

  const dati = evento.data && typeof evento.data === 'object' ? evento.data : evento;

  const aggiornamento = dati?.message?.pollUpdateMessage;
  if (!aggiornamento) return null;

  const waMessageId = aggiornamento?.pollCreationMessageKey?.id || null;
  if (!waMessageId) return null;

  // Un voto puo' arrivare senza opzioni: vuol dire che la persona ha tolto
  // tutte le spunte. E' un caso legittimo, non un pacchetto malformato.
  const selezionate = aggiornamento?.vote?.selectedOptions;
  const etichette = Array.isArray(selezionate)
    ? selezionate.map((o) => (typeof o === 'string' ? o : o?.optionName)).filter(Boolean)
    : [];

  const chiave = dati.key || {};

  // Un messaggio mandato da noi stessi non e' un voto di nessuno.
  if (chiave.fromMe === true) return null;

  const lid = soloIdentificativo(chiave.participant);
  const telefono = soloIdentificativo(chiave.participantAlt);

  // Senza un modo di identificare chi ha votato non si puo' assegnare niente.
  if (!lid && !telefono) return null;

  return {
    waMessageId,
    lid,
    telefono,
    pushName: dati.pushName || null,
    etichette,
    gruppoJid: chiave.remoteJid || null,
  };
}

module.exports = { estraiVoto, soloIdentificativo };
