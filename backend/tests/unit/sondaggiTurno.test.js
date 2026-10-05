const {
  NON_POSSO,
  unitaPerTipo,
  intestazioneData,
  domandaSondaggio,
  etichettaOpzione,
  componiSondaggio,
  componiSondaggiTurno,
} = require('../../src/utils/sondaggiTurno');

/**
 * Le etichette non sono decorazione: WhatsApp rimanda indietro il testo
 * dell'opzione votata, non un identificativo, e il voto viene ricondotto allo
 * slot confrontando quella stringa. Se due opzioni dello stesso sondaggio
 * coincidono, il voto diventa ambiguo e il posto finisce alla persona
 * sbagliata. Questi test presidiano soprattutto quell'unicita'.
 */

describe('Come si contano le cose in tavola', () => {
  test('primi e dolci si contano in porzioni', () => {
    expect(unitaPerTipo('primi')).toBe('porzioni');
    expect(unitaPerTipo('dolci')).toBe('porzioni');
  });

  test("l'acqua si conta in bottigliette", () => {
    expect(unitaPerTipo('acqua')).toBe('bottigliette');
  });

  test('la frutta prende il nome dalla ricetta: 20 mele, non 20 porzioni', () => {
    expect(unitaPerTipo('frutta', 'Mele')).toBe('mele');
    expect(unitaPerTipo('frutta', 'Arance')).toBe('arance');
  });

  test('senza ricetta la frutta ripiega su un conteggio generico', () => {
    expect(unitaPerTipo('frutta')).toBe('pezzi');
    expect(unitaPerTipo('frutta', '   ')).toBe('pezzi');
  });
});

describe('Intestazione della data', () => {
  test('il 26 settembre 2026 e un sabato', () => {
    expect(intestazioneData('2026-09-26')).toBe('SABATO 26 SETTEMBRE');
  });

  test('regge anche un timestamp completo senza scivolare di un giorno', () => {
    expect(intestazioneData('2026-11-07T00:00:00.000Z')).toBe('SABATO 7 NOVEMBRE');
  });
});

describe('La domanda del sondaggio', () => {
  test('nomina giorno e pietanza', () => {
    expect(domandaSondaggio('2026-09-26', 'frutta'))
      .toBe("SABATO 26 SETTEMBRE - FRUTTA: chi puo' dare una mano?");
  });

  test('sui primi aggiunge il piatto, cosi si sa cosa si cucina', () => {
    expect(domandaSondaggio('2026-11-07', 'primi', 'Pasta al pomodoro'))
      .toBe("SABATO 7 NOVEMBRE - PRIMI (Pasta al pomodoro): chi puo' dare una mano?");
  });
});

describe("L'etichetta del singolo posto", () => {
  test('porta ordinale e quantita', () => {
    expect(etichettaOpzione(1, 20, 'mele')).toBe('1° posto - 20 mele');
    expect(etichettaOpzione(4, 10, 'porzioni')).toBe('4° posto - 10 porzioni');
  });

  test('senza numero di porzioni non inventa una quantita', () => {
    expect(etichettaOpzione(2, null, 'porzioni')).toBe('2° posto - da concordare');
  });
});

describe('Composizione di un sondaggio', () => {
  const treSlotUguali = [
    { id: 'a', numero_porzioni: 20, nome_ricetta: 'Mele' },
    { id: 'b', numero_porzioni: 20, nome_ricetta: 'Mele' },
    { id: 'c', numero_porzioni: 20, nome_ricetta: 'Mele' },
  ];

  test('una opzione per ogni posto libero, agganciata al suo slot', () => {
    const s = componiSondaggio({ dataTurno: '2026-09-26', tipoSlot: 'frutta', slot: treSlotUguali });
    expect(s.opzioni).toHaveLength(3);
    expect(s.opzioni.map((o) => o.slotId)).toEqual(['a', 'b', 'c']);
  });

  test('tre posti identici producono comunque tre etichette diverse', () => {
    const s = componiSondaggio({ dataTurno: '2026-09-26', tipoSlot: 'frutta', slot: treSlotUguali });
    const etichette = s.opzioni.map((o) => o.etichetta);
    expect(new Set(etichette).size).toBe(3);
    expect(etichette).toEqual(['1° posto - 20 mele', '2° posto - 20 mele', '3° posto - 20 mele']);
  });

  test('in fondo c e sempre «Questa volta non posso», anche con tutti i posti liberi', () => {
    const s = componiSondaggio({ dataTurno: '2026-09-26', tipoSlot: 'frutta', slot: treSlotUguali });
    expect(s.etichette).toEqual([
      '1° posto - 20 mele', '2° posto - 20 mele', '3° posto - 20 mele', NON_POSSO,
    ]);
  });

  test('«non posso» non e legato a nessuno slot: fra le opzioni ci sono solo i posti', () => {
    const s = componiSondaggio({ dataTurno: '2026-09-26', tipoSlot: 'frutta', slot: treSlotUguali });
    expect(s.opzioni.map((o) => o.etichetta)).not.toContain(NON_POSSO);
  });

  test('con un posto solo il sondaggio parte lo stesso: le opzioni sono due', () => {
    const s = componiSondaggio({
      dataTurno: '2026-09-26', tipoSlot: 'frutta', slot: [treSlotUguali[0]],
    });
    expect(s.scartato).toBeUndefined();
    expect(s.opzioni).toHaveLength(1);
    expect(s.etichette).toEqual(['1° posto - 20 mele', NON_POSSO]);
  });

  test('undici posti piu «non posso» fanno dodici opzioni: il massimo, ma passa', () => {
    const undici = Array.from({ length: 11 }, (_, i) => ({ id: `s${i}`, numero_porzioni: 15 }));
    const s = componiSondaggio({ dataTurno: '2026-09-26', tipoSlot: 'primi', slot: undici });
    expect(s.etichette).toHaveLength(12);
  });

  test('dodici posti piu «non posso» sarebbero tredici: il sondaggio viene scartato', () => {
    const dodici = Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, numero_porzioni: 15 }));
    const s = componiSondaggio({ dataTurno: '2026-09-26', tipoSlot: 'primi', slot: dodici });
    expect(s.scartato).toBe('troppi-posti');
  });

  test('senza posti liberi non si manda niente', () => {
    expect(componiSondaggio({ dataTurno: '2026-09-26', tipoSlot: 'primi', slot: [] })).toBeNull();
  });
});

describe('Un sondaggio per ogni pietanza scoperta', () => {
  const slotLiberi = [
    { id: 'f1', tipo_slot: 'frutta', numero_porzioni: 20, nome_ricetta: 'Arance' },
    { id: 'p1', tipo_slot: 'primi', numero_porzioni: 15, nome_ricetta: 'Pasta e piselli' },
    { id: 'a1', tipo_slot: 'acqua', numero_porzioni: 20 },
    { id: 'p2', tipo_slot: 'primi', numero_porzioni: 10, nome_ricetta: 'Pasta e piselli' },
    { id: 'f2', tipo_slot: 'frutta', numero_porzioni: 20, nome_ricetta: 'Arance' },
    { id: 'a2', tipo_slot: 'acqua', numero_porzioni: 20 },
  ];

  test('un messaggio per pietanza, non uno solo per tutto il turno', () => {
    const sondaggi = componiSondaggiTurno({ dataTurno: '2026-10-31', slotLiberi });
    expect(sondaggi).toHaveLength(3);
  });

  test('seguono l ordine delle portate: prima i primi, l acqua e la frutta in fondo', () => {
    const sondaggi = componiSondaggiTurno({ dataTurno: '2026-10-31', slotLiberi });
    expect(sondaggi.map((s) => s.tipoSlot)).toEqual(['primi', 'acqua', 'frutta']);
  });

  test('ogni sondaggio contiene solo i posti della sua pietanza', () => {
    const sondaggi = componiSondaggiTurno({ dataTurno: '2026-10-31', slotLiberi });
    const primi = sondaggi.find((s) => s.tipoSlot === 'primi');
    expect(primi.opzioni.map((o) => o.slotId)).toEqual(['p1', 'p2']);
    expect(primi.opzioni.map((o) => o.etichetta))
      .toEqual(['1° posto - 15 porzioni', '2° posto - 10 porzioni']);
  });

  test('le etichette restano uniche dentro ogni singolo sondaggio', () => {
    const sondaggi = componiSondaggiTurno({ dataTurno: '2026-10-31', slotLiberi });
    for (const s of sondaggi) {
      expect(new Set(s.etichette).size).toBe(s.etichette.length);
    }
  });
});
