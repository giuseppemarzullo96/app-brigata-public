/**
 * Composizione dei sondaggi WhatsApp che chiedono aiuto sugli slot scoperti.
 *
 * Si manda un sondaggio per ogni pietanza ancora da coprire, e dentro ci va una
 * opzione per ogni singolo posto libero: chi vota sceglie quel posto preciso,
 * non "i primi" in generale.
 *
 * Qui dentro non si tocca il database: sono funzioni pure, cosi' le etichette
 * si possono verificare con dei test senza mandare niente a nessuno. Ed e'
 * importante che siano verificate, perche' l'etichetta NON e' decorazione: al
 * ritorno WhatsApp ci ridA' il testo dell'opzione, non un identificativo, e il
 * voto viene ricondotto allo slot confrontando proprio quella stringa.
 */

const MESI = [
  'GENNAIO', 'FEBBRAIO', 'MARZO', 'APRILE', 'MAGGIO', 'GIUGNO',
  'LUGLIO', 'AGOSTO', 'SETTEMBRE', 'OTTOBRE', 'NOVEMBRE', 'DICEMBRE',
];

const ORDINE_PIETANZE = ['primi', 'secondi', 'contorni', 'dolci', 'pane', 'acqua', 'frutta'];

/**
 * L'ultima opzione di ogni sondaggio. Serve due volte: a chi non puo' per
 * rispondere comunque, invece di restare fra quelli che non hanno letto; e a
 * rendere possibile il sondaggio anche con un posto solo, perche' WhatsApp
 * vuole almeno due opzioni. Non corrisponde a nessuno slot: chi la vota non
 * prende niente, e chi passa da un posto a questa lo libera.
 */
const NON_POSSO = 'Questa volta non posso';

/** WhatsApp non regge sondaggi con piu' di dodici opzioni, «non posso» compreso. */
const MAX_POSTI = 11;

/**
 * Come si contano le cose di quella pietanza. L'acqua si conta in bottigliette
 * e la frutta a pezzi: scrivere "20 porzioni di mele" non vuol dire niente a
 * chi legge sul telefono.
 */
function unitaPerTipo(tipoSlot, nomeRicetta = null) {
  if (tipoSlot === 'acqua') return 'bottigliette';
  if (tipoSlot === 'frutta') {
    const nome = (nomeRicetta || '').trim().toLowerCase();
    return nome || 'pezzi';
  }
  return 'porzioni';
}

/** "SABATO 26 SETTEMBRE" a partire da una data ISO, senza sorprese di fuso. */
function intestazioneData(dataTurno) {
  const iso = String(dataTurno).slice(0, 10);
  const [anno, mese, giorno] = iso.split('-').map(Number);
  const giorni = ['DOMENICA', 'LUNEDI', 'MARTEDI', 'MERCOLEDI', 'GIOVEDI', 'VENERDI', 'SABATO'];
  const nomeGiorno = giorni[new Date(Date.UTC(anno, mese - 1, giorno)).getUTCDay()];
  return `${nomeGiorno} ${giorno} ${MESI[mese - 1]}`;
}

/** Il testo della domanda del sondaggio. */
function domandaSondaggio(dataTurno, tipoSlot, nomeRicetta = null) {
  const pietanza = tipoSlot.toUpperCase();
  const piatto = nomeRicetta ? ` (${nomeRicetta})` : '';
  return `${intestazioneData(dataTurno)} - ${pietanza}${piatto}: chi puo' dare una mano?`;
}

/**
 * Etichetta di un singolo posto.
 *
 * Deve essere unica dentro al sondaggio: tre posti da 20 mele con la stessa
 * scritta tornerebbero indietro identici e non sapremmo quale slot assegnare.
 * L'ordinale garantisce l'unicita' anche quando le porzioni coincidono.
 */
function etichettaOpzione(posizione, numeroPorzioni, unita) {
  const quantita = numeroPorzioni ? `${numeroPorzioni} ${unita}` : 'da concordare';
  return `${posizione}° posto - ${quantita}`;
}

/**
 * Compone il sondaggio di una singola pietanza.
 *
 * @param {object} dati
 * @param {string} dati.dataTurno data del turno (ISO)
 * @param {string} dati.tipoSlot pietanza
 * @param {Array} dati.slot slot liberi: { id, numero_porzioni, nome_ricetta }
 * @returns {object|null} { tipoSlot, domanda, opzioni: [{ slotId, etichetta }], etichette }
 *   oppure null se non ci sono posti liberi. `opzioni` sono i posti, ognuno
 *   con il suo slot; `etichette` e' cio' che si spedisce: i posti e, in
 *   fondo, «Questa volta non posso».
 */
function componiSondaggio({ dataTurno, tipoSlot, slot }) {
  if (!Array.isArray(slot) || slot.length === 0) return null;
  if (slot.length > MAX_POSTI) {
    return { tipoSlot, domanda: null, opzioni: [], etichette: [], scartato: 'troppi-posti' };
  }

  const nomeRicetta = slot.map((s) => s.nome_ricetta).find(Boolean) || null;
  const unita = unitaPerTipo(tipoSlot, nomeRicetta);

  const opzioni = slot.map((s, i) => ({
    slotId: s.id,
    etichetta: etichettaOpzione(i + 1, s.numero_porzioni, unita),
  }));

  return {
    tipoSlot,
    domanda: domandaSondaggio(dataTurno, tipoSlot, tipoSlot === 'frutta' ? null : nomeRicetta),
    opzioni,
    etichette: [...opzioni.map((o) => o.etichetta), NON_POSSO],
  };
}

/**
 * Raggruppa gli slot liberi di un turno per pietanza e compone un sondaggio
 * per ciascuna, nell'ordine in cui le portate arrivano in tavola.
 */
function componiSondaggiTurno({ dataTurno, slotLiberi }) {
  const perTipo = new Map();
  for (const s of slotLiberi) {
    if (!perTipo.has(s.tipo_slot)) perTipo.set(s.tipo_slot, []);
    perTipo.get(s.tipo_slot).push(s);
  }

  const tipi = [...perTipo.keys()].sort((a, b) => {
    const ia = ORDINE_PIETANZE.indexOf(a);
    const ib = ORDINE_PIETANZE.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  return tipi
    .map((tipo) => componiSondaggio({ dataTurno, tipoSlot: tipo, slot: perTipo.get(tipo) }))
    .filter(Boolean);
}

module.exports = {
  NON_POSSO,
  MAX_POSTI,
  unitaPerTipo,
  intestazioneData,
  domandaSondaggio,
  etichettaOpzione,
  componiSondaggio,
  componiSondaggiTurno,
};
