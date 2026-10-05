const { Writable } = require('stream');
const {
  generaVerbalePdf,
  calcolaHashScrutinio,
  formattaDataOra,
} = require('../../src/utils/verbaleVotazione');
const { calcolaRisultati } = require('../../src/utils/scrutinio');
const { estraiTestoNormalizzato } = require('../helpers/pdf');

/** Raccoglie il PDF in memoria invece di scriverlo su disco. */
function raccogliPdf(dati, opzioni = {}) {
  return new Promise((resolve, reject) => {
    const pezzi = [];
    const sink = new Writable({
      write(chunk, _enc, cb) { pezzi.push(chunk); cb(); },
    });
    sink.on('finish', () => resolve(Buffer.concat(pezzi)));
    sink.on('error', reject);
    generaVerbalePdf(dati, sink, opzioni);
  });
}

const VOTAZIONE = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  titolo: 'Rinnovo del consiglio direttivo',
  descrizione: 'Elezione di tre membri del consiglio direttivo.',
  assemblea_titolo: 'Assemblea ordinaria dei soci',
  preferenze_max: 3,
  // Il database salva in UTC: 17:00Z sono le 19:00 in Italia.
  aperta_at: '2026-09-23T17:00:00Z',
  chiusa_at: '2026-09-23T18:30:00Z',
};

const CANDIDATI = [
  { id: 'c1', nome: 'Anna', cognome: 'Alfieri' },
  { id: 'c2', nome: 'Bruno', cognome: 'Bianchi' },
  { id: 'c3', nome: 'Carla', cognome: 'Conti' },
  { id: 'c4', nome: 'Dario', cognome: 'Desiderio' },
];

function esitoDiProva(conteggi = { c1: 9, c2: 7, c3: 5, c4: 2 }) {
  return calcolaRisultati({
    seggi: 3,
    candidati: CANDIDATI,
    conteggi,
    aventiDiritto: 20,
    votanti: 14,
    schedeBianche: 1,
  });
}

describe('calcolaHashScrutinio', () => {
  test('e\' deterministico: stesso scrutinio, stessa impronta', () => {
    const esito = esitoDiProva();
    expect(calcolaHashScrutinio(VOTAZIONE, esito)).toBe(calcolaHashScrutinio(VOTAZIONE, esito));
  });

  test('cambia se cambia anche un solo voto', () => {
    const a = calcolaHashScrutinio(VOTAZIONE, esitoDiProva());
    const b = calcolaHashScrutinio(VOTAZIONE, esitoDiProva({ c1: 9, c2: 7, c3: 5, c4: 3 }));
    expect(a).not.toBe(b);
  });

  test('cambia se cambia l\'affluenza', () => {
    const base = esitoDiProva();
    const alterato = { ...base, votanti: base.votanti + 1 };
    expect(calcolaHashScrutinio(VOTAZIONE, base)).not.toBe(
      calcolaHashScrutinio(VOTAZIONE, alterato)
    );
  });

  test('e\' uno SHA-256 in esadecimale', () => {
    expect(calcolaHashScrutinio(VOTAZIONE, esitoDiProva())).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('formattaDataOra', () => {
  test('formatta in italiano con l\'ora italiana, non quella del server', () => {
    expect(formattaDataOra('2026-09-23T17:05:00Z')).toBe('23 settembre 2026 alle ore 19:05');
    // D'inverno lo scarto e' di un'ora sola.
    expect(formattaDataOra('2026-01-15T18:00:00Z')).toBe('15 gennaio 2026 alle ore 19:00');
  });

  test('gestisce valori assenti o non validi', () => {
    expect(formattaDataOra(null)).toBe('—');
    expect(formattaDataOra(undefined)).toBe('—');
    expect(formattaDataOra('non-una-data')).toBe('—');
  });
});

describe('generaVerbalePdf', () => {
  test('produce un PDF valido e non vuoto', async () => {
    const pdf = await raccogliPdf({ votazione: VOTAZIONE, esito: esitoDiProva() });
    expect(pdf.slice(0, 5).toString()).toBe('%PDF-');
    expect(pdf.toString('latin1')).toContain('%%EOF');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  test('riporta titolo, eletti, quorum e impronta', async () => {
    const esito = esitoDiProva();
    const pdf = await raccogliPdf({ votazione: VOTAZIONE, esito }, { compress: false });
    const testo = estraiTestoNormalizzato(pdf);

    expect(testo).toContain('UNITÀ DI STRADA ODV');
    expect(testo).toContain('VERBALE DI ASSEMBLEA ORDINARIA DEI SOCI');
    expect(testo).toContain('Rinnovo del consiglio direttivo');
    // Gli eletti compaiono nella proclamazione.
    expect(testo).toContain('Alfieri');
    expect(testo).toContain('Bianchi');
    expect(testo).toContain('Conti');
    // Quorum.
    expect(testo).toContain('Aventi diritto al voto: 20');
    expect(testo).toContain('Schede bianche: 1');
    // Impronta di integrita'.
    expect(testo).toContain(calcolaHashScrutinio(VOTAZIONE, esito));
  });

  test('segnala esplicitamente il ballottaggio', async () => {
    const esito = esitoDiProva({ c1: 9, c2: 4, c3: 4, c4: 4 });
    expect(esito.ballottaggio_necessario).toBe(true);

    const pdf = await raccogliPdf({ votazione: VOTAZIONE, esito }, { compress: false });
    const testo = estraiTestoNormalizzato(pdf);

    expect(testo).toContain('BALLOTTAGGIO NECESSARIO');
    expect(testo).toContain('Si rimette all');
  });

  test('segnala i seggi rimasti scoperti', async () => {
    const esito = esitoDiProva({ c1: 5, c2: 0, c3: 0, c4: 0 });
    const pdf = await raccogliPdf({ votazione: VOTAZIONE, esito }, { compress: false });
    expect(estraiTestoNormalizzato(pdf)).toContain('Restano scoperti');
  });

  test('gestisce il caso senza alcun voto', async () => {
    const esito = calcolaRisultati({
      seggi: 3, candidati: CANDIDATI, conteggi: {}, aventiDiritto: 20, votanti: 0,
    });
    const pdf = await raccogliPdf({ votazione: VOTAZIONE, esito }, { compress: false });
    const testo = estraiTestoNormalizzato(pdf);

    expect(testo).toContain('Nessun candidato ha riportato preferenze');
    expect(pdf.slice(0, 5).toString()).toBe('%PDF-');
  });

  test('con molti candidati impagina su piu\' pagine senza errori', async () => {
    const molti = Array.from({ length: 60 }, (_, i) => ({
      id: `m${i}`, nome: `Nome${i}`, cognome: `Cognome${i}`,
    }));
    const conteggi = Object.fromEntries(molti.map((c, i) => [c.id, 60 - i]));

    const pdf = await raccogliPdf({
      votazione: VOTAZIONE,
      esito: calcolaRisultati({ seggi: 3, candidati: molti, conteggi, aventiDiritto: 70, votanti: 60 }),
    });

    expect(pdf.slice(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(3000);
  });

  test('restituisce la stessa impronta che stampa nel documento', async () => {
    const esito = esitoDiProva();
    const sink = new Writable({ write(_c, _e, cb) { cb(); } });
    const restituito = generaVerbalePdf({ votazione: VOTAZIONE, esito }, sink);
    expect(restituito).toBe(calcolaHashScrutinio(VOTAZIONE, esito));
  });
});

describe('generaVerbalePdf — schema del verbale d\'assemblea', () => {
  const DATI = {
    numero_verbale: '3/2026',
    convocazione: 'seconda',
    data_convocazione: '2026-09-15',
    mezzo_convocazione: 'WhatsApp ed email',
    luogo: 'sede sociale, via Dionisio Martino 6, Salerno',
    ora_inizio: '18:30',
    ora_chiusura: '20:45',
    presidente: 'Giuseppe Marzullo',
    segretario: 'Alfredo Micoloni',
    componenti_consiglio: 5,
    rinnovo_parziale: true,
    approvazione_voto_app: 'unanimita',
    scrutatori: [],
  };
  const REGISTRO = [
    { cognome: 'Alfieri', nome: 'Anna', quota_in_regola: true, presenza: 'in_sala', ha_votato: true },
    { cognome: 'Bianchi', nome: 'Bruno', quota_in_regola: true, presenza: 'delega', delegato_nome: 'Alfieri Anna', ha_votato: false },
    { cognome: 'Conti', nome: 'Carla', quota_in_regola: false, presenza: 'assente', ha_votato: false },
  ];

  // Il testo giustificato perde gli spazi fra le parole nell'estrazione:
  // i confronti avvengono senza spazi.
  const compatto = (t) => t.replace(/\s+/g, '');
  async function testoDi(extra) {
    const esito = esitoDiProva();
    const pdf = await raccogliPdf({ votazione: VOTAZIONE, esito, ...extra }, { compress: false });
    const testo = compatto(estraiTestoNormalizzato(pdf));
    return {
      toContain: (atteso) => expect(testo).toContain(compatto(atteso)),
      notToContain: (atteso) => expect(testo).not.toContain(compatto(atteso)),
    };
  }

  test('riporta presidente, segretario, convocazione, quorum e chiusura', async () => {
    const { calcolaPresenze } = require('../../src/utils/datiVerbale');
    const testo = await testoDi({ dati: DATI, registro: REGISTRO, presenze: calcolaPresenze(REGISTRO, 'seconda') });

    testo.toContain('N. 3/2026');
    testo.toContain('seconda convocazione');
    testo.toContain('Giuseppe Marzullo');
    testo.toContain('Alfredo Micoloni');
    testo.toContain('15 settembre 2026');
    testo.toContain('qualunque sia il numero dei presenti');
    testo.toContain('alle ore 20:45');
    testo.toContain('art. 17 dello Statuto');
  });

  test('rinnovo parziale: conferma il numero dei consiglieri e la scadenza del mandato in corso', async () => {
    const testo = await testoDi({ dati: DATI });
    testo.toContain('conferma in n. 5 il numero dei componenti');
    testo.toContain('rinnovo parziale di 3 componenti');
    testo.toContain('art. 8.5 dello Statuto');
    testo.notToContain('saranno eletti dal Consiglio direttivo nella sua prima seduta');
  });

  test('rinnovo integrale: rinvia al consiglio l\'elezione del presidente', async () => {
    const testo = await testoDi({ dati: { ...DATI, rinnovo_parziale: false } });
    testo.toContain('determina in n. 5 il numero dei componenti');
    testo.toContain('saranno eletti dal Consiglio direttivo nella sua prima seduta');
  });

  test('riporta candidature, voto tramite app approvato e schede nulle', async () => {
    const testo = await testoDi({ dati: DATI });
    testo.toContain('CANDIDATURE');
    testo.toContain('Desiderio Dario');
    testo.toContain('app.labrigataodv.it');
    testo.toContain('approva all\'unanimità dei presenti');
    testo.toContain('Schede nulle: 0');
  });

  test('allega il registro presenze con quota, presenza, delega e voto', async () => {
    const { calcolaPresenze } = require('../../src/utils/datiVerbale');
    const testo = await testoDi({ dati: DATI, registro: REGISTRO, presenze: calcolaPresenze(REGISTRO, 'seconda') });

    testo.toContain('ALLEGATO A');
    testo.toContain('REGISTRO PRESENZE');
    testo.toContain('per delega a Alfieri Anna');
    testo.toContain('di persona');
    testo.toContain('deleghe scritte e firmate (n. 1)');
    testo.toContain('sono presenti 2 soci');
  });

  test('il registro non riporta ne\' la quota ne\' la firma', async () => {
    const { calcolaPresenze } = require('../../src/utils/datiVerbale');
    const testo = await testoDi({ dati: DATI, registro: REGISTRO, presenze: calcolaPresenze(REGISTRO, 'seconda') });
    testo.notToContain('in regola');
    testo.notToContain('Firma');
  });

  test('elenca gli allegati caricati dopo il registro presenze', async () => {
    const testo = await testoDi({ dati: DATI, allegati: [{ titolo: 'Foglio firme' }, { titolo: 'Relazione del Presidente' }] });
    testo.toContain('Allegati: A) registro presenze; B) Foglio firme; C) Relazione del Presidente.');
  });

  test('senza dati della seduta lascia le righe da completare a mano', async () => {
    const testo = await testoDi({});
    // Per convenzione, senza indicazioni, seconda convocazione.
    testo.toContain('in seconda convocazione');
    testo.toContain('____________________');
    testo.toContain('ALLEGATO A');
  });

  test('in prima convocazione senza quorum lo dichiara', async () => {
    const { calcolaPresenze } = require('../../src/utils/datiVerbale');
    const registro = [
      { cognome: 'A', nome: 'A', quota_in_regola: true, presenza: 'in_sala', ha_votato: true },
      { cognome: 'B', nome: 'B', quota_in_regola: true, presenza: 'assente', ha_votato: false },
      { cognome: 'C', nome: 'C', quota_in_regola: true, presenza: 'assente', ha_votato: false },
    ];
    const testo = await testoDi({
      dati: { ...DATI, convocazione: 'prima' }, registro, presenze: calcolaPresenze(registro, 'prima'),
    });
    testo.toContain('non è raggiunta la metà richiesta in prima convocazione');
  });
});
