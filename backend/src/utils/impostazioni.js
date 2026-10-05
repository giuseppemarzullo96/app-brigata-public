const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');
const logger = require('./logger');

/**
 * Impostazioni configurabili dagli amministratori.
 *
 * Solo le chiavi elencate qui sono leggibili e scrivibili dalle API: cosi' un
 * admin non puo' introdurre nel database chiavi arbitrarie che nessuna parte
 * del codice legge, e il significato di ogni valore resta documentato.
 */
const CHIAVI = {
  quota_annuale: {
    descrizione: 'Importo in euro della quota associativa annuale',
    tipo: 'decimale',
    predefinito: '15.00',
    min: 0,
    max: 10000,
  },
  chat_attiva: {
    descrizione: 'Messaggi interni fra soci attivi (spegnendoli la sezione sparisce dal menu)',
    tipo: 'booleano',
    predefinito: 'true',
  },
  gruppo_whatsapp_cucine: {
    descrizione: 'Gruppo WhatsApp su cui pubblicare i sondaggi per coprire gli slot liberi',
    tipo: 'gruppo_whatsapp',
    predefinito: '',
  },
  // Carta intestata di verbali e convocazioni: HTML semplice, vedi utils/cartaIntestata.js.
  carta_intestata_intestazione: {
    descrizione: 'Intestazione di verbali e convocazioni (HTML semplice)',
    tipo: 'html',
    predefinito: '',
  },
  carta_intestata_piepagina: {
    descrizione: 'Piè di pagina di verbali e convocazioni (HTML semplice)',
    tipo: 'html',
    predefinito: '',
  },
  // Si imposta caricando il file (POST /impostazioni/carta-intestata/logo);
  // da qui si puo' solo svuotare.
  carta_intestata_logo: {
    descrizione: 'Logo della carta intestata',
    tipo: 'logo',
    predefinito: '',
  },
};

const chiaveValida = (chiave) => Object.prototype.hasOwnProperty.call(CHIAVI, chiave);

/**
 * Valida e normalizza un valore in base al tipo della chiave.
 * @returns {{ok: true, valore: string} | {ok: false, errore: string}}
 */
function validaValore(chiave, valoreGrezzo) {
  const definizione = CHIAVI[chiave];
  if (!definizione) return { ok: false, errore: 'Impostazione non riconosciuta' };

  if (definizione.tipo === 'decimale') {
    const numero = Number(String(valoreGrezzo).replace(',', '.').trim());
    if (!Number.isFinite(numero)) {
      return { ok: false, errore: 'Il valore deve essere un numero' };
    }
    if (numero < definizione.min || numero > definizione.max) {
      return {
        ok: false,
        errore: `Il valore deve essere compreso fra ${definizione.min} e ${definizione.max}`,
      };
    }
    // Due decimali: e' un importo in euro.
    return { ok: true, valore: numero.toFixed(2) };
  }

  if (definizione.tipo === 'booleano') {
    const testo = String(valoreGrezzo).trim().toLowerCase();
    if (['true', '1', 'si', 'sì'].includes(testo)) return { ok: true, valore: 'true' };
    if (['false', '0', 'no'].includes(testo)) return { ok: true, valore: 'false' };
    return { ok: false, errore: 'Il valore deve essere vero o falso' };
  }

  if (definizione.tipo === 'gruppo_whatsapp') {
    const testo = String(valoreGrezzo).trim();
    // Svuotare la casella e' legittimo: spegne la pubblicazione dei sondaggi.
    if (testo === '') return { ok: true, valore: '' };
    // Un gruppo finisce sempre per "@g.us". Senza questo controllo, incollando
    // per sbaglio un numero di cellulare i sondaggi partirebbero in privato a
    // una persona invece che al gruppo.
    if (!/^[0-9-]+@g\.us$/.test(testo)) {
      return { ok: false, errore: 'Deve essere l\'identificativo di un gruppo WhatsApp, che finisce per @g.us' };
    }
    return { ok: true, valore: testo };
  }

  if (definizione.tipo === 'html') {
    const testo = String(valoreGrezzo ?? '');
    if (testo.length > 5000) return { ok: false, errore: 'Testo troppo lungo (massimo 5000 caratteri)' };
    return { ok: true, valore: testo };
  }

  if (definizione.tipo === 'logo') {
    const testo = String(valoreGrezzo ?? '').trim();
    if (testo === '') return { ok: true, valore: '' };
    return { ok: false, errore: 'Il logo si imposta caricando un\'immagine' };
  }

  return { ok: true, valore: String(valoreGrezzo) };
}

/** Legge una impostazione, con ritorno al valore predefinito se assente. */
async function getImpostazione(chiave) {
  if (!chiaveValida(chiave)) return null;

  try {
    const [riga] = await sequelize.query(
      'SELECT valore FROM impostazioni WHERE chiave = :chiave',
      { replacements: { chiave }, type: QueryTypes.SELECT }
    );
    return riga ? riga.valore : CHIAVI[chiave].predefinito;
  } catch (error) {
    // Un problema nel leggere le impostazioni non deve bloccare il flusso
    // principale: si prosegue con il valore predefinito.
    logger.error(`Errore lettura impostazione ${chiave}:`, error);
    return CHIAVI[chiave].predefinito;
  }
}

/**
 * Importo della quota associativa annuale, come numero.
 * Sostituisce il valore che prima era scritto nel codice.
 */
async function getQuotaAnnuale() {
  const valore = await getImpostazione('quota_annuale');
  const numero = Number(valore);
  return Number.isFinite(numero) ? numero : Number(CHIAVI.quota_annuale.predefinito);
}

/**
 * I messaggi interni sono attivi?
 * In caso di problemi nel leggere l'impostazione si risponde true: un guasto
 * alle impostazioni non deve spegnere una sezione che gli admin non hanno
 * chiesto di spegnere.
 */
async function getChatAttiva() {
  return (await getImpostazione('chat_attiva')) !== 'false';
}

/** Tutte le impostazioni note, con i valori correnti. */
async function getTutteImpostazioni() {
  const righe = await sequelize.query(
    'SELECT chiave, valore, updated_at FROM impostazioni',
    { type: QueryTypes.SELECT }
  );
  const perChiave = Object.fromEntries(righe.map((r) => [r.chiave, r]));

  return Object.entries(CHIAVI).map(([chiave, def]) => ({
    chiave,
    valore: perChiave[chiave]?.valore ?? def.predefinito,
    descrizione: def.descrizione,
    tipo: def.tipo,
    updated_at: perChiave[chiave]?.updated_at ?? null,
  }));
}

/** Scrive una impostazione e ne registra la variazione nello storico. */
async function setImpostazione(chiave, valore, userId) {
  const precedente = await getImpostazione(chiave);

  await sequelize.query(
    `INSERT INTO impostazioni (chiave, valore, descrizione, updated_by, updated_at)
     VALUES (:chiave, :valore, :descrizione, :userId, CURRENT_TIMESTAMP)
     ON CONFLICT (chiave) DO UPDATE
        SET valore = EXCLUDED.valore,
            updated_by = EXCLUDED.updated_by,
            updated_at = CURRENT_TIMESTAMP`,
    {
      replacements: {
        chiave,
        valore,
        descrizione: CHIAVI[chiave].descrizione,
        userId: userId || null,
      },
      type: QueryTypes.INSERT,
    }
  );

  await sequelize.query(
    `INSERT INTO impostazioni_storico (chiave, valore_precedente, valore_nuovo, modificato_da)
     VALUES (:chiave, :precedente, :valore, :userId)`,
    {
      replacements: { chiave, precedente, valore, userId: userId || null },
      type: QueryTypes.INSERT,
    }
  );

  return { chiave, valore, precedente };
}

module.exports = {
  CHIAVI,
  chiaveValida,
  validaValore,
  getImpostazione,
  getQuotaAnnuale,
  getChatAttiva,
  getTutteImpostazioni,
  setImpostazione,
};
