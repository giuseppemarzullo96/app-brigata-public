/**
 * Dati del verbale d'assemblea e registro presenze di una votazione.
 *
 * Qui stanno le regole che derivano dallo statuto, separate dal controller per
 * poterle testare senza database:
 *   - art. 9.3  deleghe scritte, al massimo due per ciascun delegato;
 *   - art. 9.5  quorum: in prima convocazione almeno la meta' dei soci in
 *               regola, presenti in proprio o per delega; in seconda
 *               qualunque sia il numero dei presenti;
 *   - art. 10.1 il consiglio direttivo ha da tre a sette componenti.
 */

const MAX_DELEGHE_PER_SOCIO = 2;
const COMPONENTI_MIN = 3;
const COMPONENTI_MAX = 7;
const PRESENZE = ['in_sala', 'collegato', 'delega', 'assente'];
const PRESENZE_IN_PROPRIO = ['in_sala', 'collegato'];

const CAMPI_TESTO = {
  numero_verbale: 20,
  codice_fiscale: 20,
  mezzo_convocazione: 200,
  luogo: 255,
  presidente: 120,
  segretario: 120,
  scadenza_mandato: 60,
  note: 4000,
};

function testo(valore, max) {
  if (valore === undefined || valore === null) return null;
  const pulito = String(valore).trim();
  return pulito ? pulito.slice(0, max) : null;
}

/**
 * Normalizza i dati descrittivi inviati dall'admin.
 * @returns {{ dati?: object, errore?: string }}
 */
function normalizzaDatiVerbale(input = {}) {
  const dati = {};

  Object.entries(CAMPI_TESTO).forEach(([campo, max]) => {
    dati[campo] = testo(input[campo], max);
  });

  // Per convenzione dell'associazione le assemblee sono in seconda convocazione.
  const convocazione = testo(input.convocazione, 10) || 'seconda';
  if (!['prima', 'seconda'].includes(convocazione)) {
    return { errore: 'La convocazione deve essere "prima" o "seconda"' };
  }
  dati.convocazione = convocazione;

  const dataConvocazione = testo(input.data_convocazione, 10);
  if (dataConvocazione && !/^\d{4}-\d{2}-\d{2}$/.test(dataConvocazione)) {
    return { errore: 'Data della convocazione non valida (formato AAAA-MM-GG)' };
  }
  dati.data_convocazione = dataConvocazione;

  for (const campo of ['ora_inizio', 'ora_chiusura']) {
    const ora = testo(input[campo], 5);
    if (ora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(ora)) {
      return { errore: `Orario non valido in ${campo} (formato HH:MM)` };
    }
    dati[campo] = ora;
  }

  if (input.componenti_consiglio === undefined || input.componenti_consiglio === null
      || input.componenti_consiglio === '') {
    dati.componenti_consiglio = null;
  } else {
    const n = Number(input.componenti_consiglio);
    if (!Number.isInteger(n) || n < COMPONENTI_MIN || n > COMPONENTI_MAX) {
      return {
        errore: `Il consiglio direttivo ha da ${COMPONENTI_MIN} a ${COMPONENTI_MAX} componenti (art. 10.1 dello Statuto)`,
      };
    }
    dati.componenti_consiglio = n;
  }

  dati.rinnovo_parziale = Boolean(input.rinnovo_parziale);

  const modalita = testo(input.approvazione_voto_app, 20);
  if (modalita && !['unanimita', 'maggioranza'].includes(modalita)) {
    return { errore: 'Approvazione del voto tramite app non valida' };
  }
  dati.approvazione_voto_app = modalita;

  const scrutatori = Array.isArray(input.scrutatori) ? input.scrutatori : [];
  dati.scrutatori = scrutatori.map((s) => testo(s, 120)).filter(Boolean).slice(0, 5);

  return { dati };
}

/**
 * Verifica il registro presenze inviato dall'admin rispetto all'elettorato.
 * @param {Array} righe      [{ user_id, presenza, delegato_user_id }]
 * @param {Set}   elettorato id degli aventi diritto della votazione
 * @returns {{ righe?: Array, errore?: string }}
 */
function validaRegistroPresenze(righe, elettorato) {
  if (!Array.isArray(righe)) return { errore: 'Registro presenze non valido' };

  const perSocio = new Map();
  for (const r of righe) {
    const userId = r && r.user_id ? String(r.user_id) : null;
    if (!userId || !elettorato.has(userId)) {
      return { errore: 'Il registro contiene un socio che non e\' fra gli aventi diritto' };
    }
    const presenza = r.presenza || null;
    if (presenza !== null && !PRESENZE.includes(presenza)) {
      return { errore: 'Tipo di presenza non valido' };
    }
    const delegato = presenza === 'delega' ? String(r.delegato_user_id || '') : null;
    if (presenza === 'delega' && !delegato) {
      return { errore: 'Per una delega va indicato il socio delegato' };
    }
    perSocio.set(userId, { user_id: userId, presenza, delegato_user_id: delegato });
  }

  const delegheRicevute = new Map();
  for (const r of perSocio.values()) {
    if (r.presenza !== 'delega') continue;
    if (r.delegato_user_id === r.user_id) {
      return { errore: 'Un socio non puo\' delegare se stesso' };
    }
    const delegato = perSocio.get(r.delegato_user_id);
    if (!elettorato.has(r.delegato_user_id)) {
      return { errore: 'Il delegato deve essere un socio avente diritto (art. 9.3 dello Statuto)' };
    }
    if (!delegato || !PRESENZE_IN_PROPRIO.includes(delegato.presenza)) {
      return { errore: 'Il delegato deve risultare presente in proprio (art. 9.3 dello Statuto)' };
    }
    const n = (delegheRicevute.get(r.delegato_user_id) || 0) + 1;
    if (n > MAX_DELEGHE_PER_SOCIO) {
      return {
        errore: `Ogni socio puo' rappresentare al massimo ${MAX_DELEGHE_PER_SOCIO} associati (art. 9.3 dello Statuto)`,
      };
    }
    delegheRicevute.set(r.delegato_user_id, n);
  }

  return { righe: [...perSocio.values()] };
}

/**
 * Conteggi del registro e verifica del quorum costitutivo (art. 9.5).
 * @param {Array}  registro     [{ presenza, quota_in_regola, ha_votato }]
 * @param {string} convocazione 'prima' | 'seconda' | null
 */
function calcolaPresenze(registro, convocazione = 'seconda') {
  const conta = (fn) => registro.filter(fn).length;
  const registrato = registro.some((r) => r.presenza);

  const inSala = conta((r) => r.presenza === 'in_sala');
  const collegati = conta((r) => r.presenza === 'collegato');
  const perDelega = conta((r) => r.presenza === 'delega');
  const presenti = inSala + collegati + perDelega;
  const inRegola = conta((r) => r.quota_in_regola);
  const presentiInRegola = conta(
    (r) => r.quota_in_regola && ['in_sala', 'collegato', 'delega'].includes(r.presenza)
  );

  let quorum = null; // null = non verificabile (presenze non registrate o convocazione ignota)
  if (convocazione === 'seconda') {
    quorum = true;
  } else if (convocazione === 'prima' && registrato) {
    quorum = inRegola > 0 && presentiInRegola * 2 >= inRegola;
  }

  return {
    registrato,
    aventi_diritto: registro.length,
    in_regola: inRegola,
    in_sala: inSala,
    collegati,
    per_delega: perDelega,
    presenti,
    presenti_in_regola: presentiInRegola,
    votanti: conta((r) => r.ha_votato),
    votanti_non_in_regola: conta((r) => r.ha_votato && !r.quota_in_regola),
    quorum_raggiunto: quorum,
  };
}

/**
 * Dati del verbale di una riunione del Consiglio direttivo (art. 10.2):
 * valida con la maggioranza dei componenti, delibere a maggioranza dei
 * presenti, nessuna delega.
 * @param {object} input
 * @param {Array}  consiglieriAmmessi [{ user_id, cognome, nome, carica }] in carica alla data
 * @returns {{ dati?: object, errore?: string }}
 */
function normalizzaDatiVerbaleConsiglio(input = {}, consiglieriAmmessi = []) {
  const dati = {};
  const campi = {
    numero_verbale: 20, luogo: 255, presidente: 120, segretario: 120,
    mezzo_convocazione: 200, invitati: 500, note: 4000,
  };
  Object.entries(campi).forEach(([campo, max]) => { dati[campo] = testo(input[campo], max); });

  const dataConvocazione = testo(input.data_convocazione, 10);
  if (dataConvocazione && !/^\d{4}-\d{2}-\d{2}$/.test(dataConvocazione)) {
    return { errore: 'Data della convocazione non valida (formato AAAA-MM-GG)' };
  }
  dati.data_convocazione = dataConvocazione;
  for (const campo of ['ora_inizio', 'ora_chiusura']) {
    const ora = testo(input[campo], 5);
    if (ora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(ora)) {
      return { errore: `Orario non valido in ${campo} (formato HH:MM)` };
    }
    dati[campo] = ora;
  }

  // I consiglieri sono quelli in carica alla data della riunione: il nome e la
  // carica si fotografano qui, cosi' il verbale non cambia se poi cambiano.
  const ammessi = new Map(consiglieriAmmessi.map((c) => [String(c.user_id), c]));
  const presenti = new Set(
    (Array.isArray(input.presenti) ? input.presenti : []).map(String)
  );
  for (const id of presenti) {
    if (!ammessi.has(id)) {
      return { errore: 'Fra i presenti c\'e\' chi non era consigliere in carica alla data della riunione' };
    }
  }
  dati.consiglieri = consiglieriAmmessi.map((c) => ({
    user_id: String(c.user_id),
    cognome: c.cognome,
    nome: c.nome,
    carica: c.carica,
    presente: presenti.has(String(c.user_id)),
  }));
  const numPresenti = dati.consiglieri.filter((c) => c.presente).length;

  const delibere = Array.isArray(input.delibere) ? input.delibere : [];
  if (delibere.length > 30) return { errore: 'Troppe delibere in un solo verbale' };
  dati.delibere = [];
  for (const [i, d] of delibere.entries()) {
    const oggetto = testo(d?.oggetto, 300);
    if (!oggetto) return { errore: `La delibera n. ${i + 1} non ha un oggetto` };
    const voti = {};
    for (const campo of ['favorevoli', 'contrari', 'astenuti']) {
      const n = d?.[campo] === undefined || d?.[campo] === '' || d?.[campo] === null ? 0 : Number(d[campo]);
      if (!Number.isInteger(n) || n < 0) return { errore: `Voti non validi nella delibera n. ${i + 1}` };
      voti[campo] = n;
    }
    // Art. 10.2: niente deleghe, quindi votano solo i presenti.
    if (voti.favorevoli + voti.contrari + voti.astenuti > numPresenti) {
      return {
        errore: `Nella delibera n. ${i + 1} i voti superano i consiglieri presenti (${numPresenti}): nel Consiglio non sono ammesse deleghe`,
      };
    }
    dati.delibere.push({ oggetto, testo: testo(d?.testo, 4000), ...voti });
  }

  return { dati };
}

/** Quorum costitutivo del Consiglio e esito delle delibere (art. 10.2). */
function esitoConsiglio(dati) {
  const consiglieri = dati?.consiglieri || [];
  const componenti = consiglieri.length;
  const presenti = consiglieri.filter((c) => c.presente).length;
  return {
    componenti,
    presenti,
    valido: componenti > 0 && presenti * 2 > componenti,
    delibere: (dati?.delibere || []).map((d) => ({
      ...d,
      // Maggioranza dei presenti: gli astenuti contano come presenti.
      approvata: d.favorevoli * 2 > presenti,
      unanimita: presenti > 0 && d.favorevoli === presenti,
    })),
  };
}

module.exports = {
  normalizzaDatiVerbaleConsiglio,
  esitoConsiglio,
  normalizzaDatiVerbale,
  validaRegistroPresenze,
  calcolaPresenze,
  MAX_DELEGHE_PER_SOCIO,
  PRESENZE,
};
