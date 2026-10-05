const logger = require('./logger');

/**
 * Normalizza un numero italiano in formato E.164 senza '+' (formato richiesto da Evolution API).
 * Accetta input come "333 1234567", "+39 333 1234567", "0039333...".
 */
function normalizzaNumero(telefono) {
  if (!telefono) return null;
  let n = telefono.replace(/[^\d]/g, '');
  if (n.startsWith('0039')) n = n.slice(2);
  if (!n.startsWith('39')) n = `39${n.replace(/^0+/, '')}`;
  return n;
}

/**
 * Destinatario pronto per Evolution API.
 * Un gruppo si indirizza con un JID (es. "120363...@g.us") che va passato
 * intatto: normalizzarlo come fosse un cellulare lo distruggerebbe.
 */
function destinatario(valore) {
  if (!valore) return null;
  if (String(valore).includes('@')) return String(valore);
  return normalizzaNumero(valore);
}

/** Configurazione dell'istanza, o null se ne manca un pezzo. */
function configurazione() {
  const baseUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;
  if (!baseUrl || !apiKey || !instance) return null;
  return { baseUrl, apiKey, instance };
}

/**
 * Pubblica un sondaggio, tipicamente su un gruppo.
 *
 * `opzioni` sono le etichette: vanno spedite identiche a come sono state
 * salvate, perche' al ritorno WhatsApp ci ridA' il testo dell'opzione votata e
 * non un identificativo. E' quella stringa a ricondurre il voto allo slot.
 *
 * `selectableCount` di default e' il numero di opzioni: cosi' una stessa
 * persona puo' prendersi piu' di un posto nello stesso sondaggio.
 */
async function sendPoll(a, domanda, opzioni, selectableCount = null) {
  const numero = destinatario(a);
  if (!numero) return { sent: false, reason: 'no-number' };
  if (!Array.isArray(opzioni) || opzioni.length < 2) {
    return { sent: false, reason: 'servono-almeno-due-opzioni' };
  }
  if (opzioni.length > 12) return { sent: false, reason: 'troppe-opzioni' };
  if (new Set(opzioni).size !== opzioni.length) {
    // Due etichette uguali renderebbero il voto impossibile da attribuire.
    return { sent: false, reason: 'etichette-duplicate' };
  }

  const config = configurazione();
  if (!config) return { sent: false, reason: 'evolution-not-configured' };

  try {
    const response = await fetch(`${config.baseUrl}/message/sendPoll/${config.instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.apiKey },
      body: JSON.stringify({
        number: numero,
        name: domanda,
        selectableCount: selectableCount || opzioni.length,
        values: opzioni,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error(`Errore invio sondaggio a ${numero}: ${response.status} ${body}`);
      return { sent: false, reason: `http-${response.status}` };
    }

    const dati = await response.json();
    // L'id del messaggio e' l'aggancio dei voti futuri: senza, il sondaggio
    // sarebbe pubblicato ma nessun voto potrebbe essere ricondotto a esso.
    const messageId = dati?.key?.id || null;
    if (!messageId) {
      logger.error('Sondaggio inviato ma senza id messaggio nella risposta');
      return { sent: false, reason: 'no-message-id' };
    }

    return { sent: true, messageId };
  } catch (error) {
    logger.error(`Errore invio sondaggio a ${numero}:`, error.message);
    return { sent: false, reason: error.message };
  }
}

/**
 * Invia un messaggio WhatsApp tramite l'istanza Evolution API "brigata".
 * Non lancia mai eccezioni: un fallimento non deve interrompere il flusso applicativo.
 */
async function sendWhatsApp(telefono, testo) {
  const numero = normalizzaNumero(telefono);
  if (!numero) return { sent: false, reason: 'no-number' };

  const baseUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;

  if (!baseUrl || !apiKey || !instance) {
    return { sent: false, reason: 'evolution-not-configured' };
  }

  try {
    const response = await fetch(`${baseUrl}/message/sendText/${instance}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify({
        number: numero,
        text: testo,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error(`Errore invio WhatsApp a ${numero}: ${response.status} ${body}`);
      return { sent: false, reason: `http-${response.status}` };
    }

    return { sent: true };
  } catch (error) {
    logger.error(`Errore invio WhatsApp a ${numero}:`, error.message);
    return { sent: false, reason: error.message };
  }
}

/**
 * Invia lo stesso messaggio a più numeri in sequenza, senza bloccarsi sui fallimenti singoli.
 */
async function sendWhatsAppBulk(numeri, testo) {
  let inviati = 0;
  for (const numero of numeri) {
    const result = await sendWhatsApp(numero, testo);
    if (result.sent) inviati++;
  }
  return inviati;
}

module.exports = { sendWhatsApp, sendWhatsAppBulk, sendPoll, normalizzaNumero, destinatario };
