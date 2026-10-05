const { calcolaRisultati, ordinaGraduatoria } = require('../../src/utils/scrutinio');

/** Helper: costruisce i candidati con id prevedibili (c1, c2, ...). */
function candidati(...nomi) {
  return nomi.map((n, i) => ({
    id: `c${i + 1}`,
    nome: n.nome,
    cognome: n.cognome,
    ritirato: n.ritirato || false,
  }));
}

const CINQUE = candidati(
  { nome: 'Anna', cognome: 'Alfieri' },
  { nome: 'Bruno', cognome: 'Bianchi' },
  { nome: 'Carla', cognome: 'Conti' },
  { nome: 'Dario', cognome: 'De Luca' },
  { nome: 'Elena', cognome: 'Esposito' }
);

describe('calcolaRisultati - casi ordinari', () => {
  test('3 seggi con vincitori netti: i primi 3 sono eletti', () => {
    const esito = calcolaRisultati({
      seggi: 3,
      candidati: CINQUE,
      conteggi: { c1: 10, c2: 8, c3: 6, c4: 3, c5: 1 },
      aventiDiritto: 20,
      votanti: 15,
    });

    expect(esito.eletti.map((e) => e.id)).toEqual(['c1', 'c2', 'c3']);
    expect(esito.ballottaggio_necessario).toBe(false);
    expect(esito.seggi_assegnati).toBe(3);
    expect(esito.seggi_scoperti).toBe(0);
  });

  test('la graduatoria e\' ordinata per voti decrescenti con posizione progressiva', () => {
    const esito = calcolaRisultati({
      seggi: 3,
      candidati: CINQUE,
      conteggi: { c1: 1, c2: 9, c3: 5, c4: 7, c5: 3 },
      aventiDiritto: 10,
      votanti: 10,
    });

    expect(esito.risultati.map((r) => r.id)).toEqual(['c2', 'c4', 'c3', 'c5', 'c1']);
    expect(esito.risultati.map((r) => r.posizione)).toEqual([1, 2, 3, 4, 5]);
  });

  test('i candidati ritirati sono esclusi dallo scrutinio', () => {
    const conRitirato = [...CINQUE];
    conRitirato[0] = { ...conRitirato[0], ritirato: true };

    const esito = calcolaRisultati({
      seggi: 3,
      candidati: conRitirato,
      conteggi: { c1: 99, c2: 8, c3: 6, c4: 3, c5: 1 },
      aventiDiritto: 10,
      votanti: 10,
    });

    expect(esito.risultati.map((r) => r.id)).not.toContain('c1');
    expect(esito.eletti.map((e) => e.id)).toEqual(['c2', 'c3', 'c4']);
  });
});

describe('calcolaRisultati - parita\' e ballottaggio', () => {
  test('parita\' sull\'ultimo seggio: ballottaggio, nessuna proclamazione d\'ufficio', () => {
    const esito = calcolaRisultati({
      seggi: 3,
      candidati: CINQUE,
      conteggi: { c1: 10, c2: 8, c3: 5, c4: 5, c5: 1 },
      aventiDiritto: 20,
      votanti: 15,
    });

    expect(esito.ballottaggio_necessario).toBe(true);
    expect(esito.eletti.map((e) => e.id)).toEqual(['c1', 'c2']);
    expect(esito.candidati_ballottaggio.map((c) => c.id).sort()).toEqual(['c3', 'c4']);
    expect(esito.seggi_al_ballottaggio).toBe(1);
    // Il seggio conteso non va contato fra quelli scoperti.
    expect(esito.seggi_scoperti).toBe(0);
  });

  test('parita\' sopra l\'ultimo seggio non genera ballottaggio', () => {
    const esito = calcolaRisultati({
      seggi: 3,
      candidati: CINQUE,
      conteggi: { c1: 9, c2: 9, c3: 7, c4: 2, c5: 1 },
      aventiDiritto: 20,
      votanti: 15,
    });

    expect(esito.ballottaggio_necessario).toBe(false);
    expect(esito.eletti.map((e) => e.id)).toEqual(['c1', 'c2', 'c3']);
  });

  test('parita\' che riempie esattamente i seggi residui: tutti eletti', () => {
    const esito = calcolaRisultati({
      seggi: 3,
      candidati: CINQUE,
      conteggi: { c1: 10, c2: 4, c3: 4, c4: 1, c5: 0 },
      aventiDiritto: 20,
      votanti: 15,
    });

    expect(esito.ballottaggio_necessario).toBe(false);
    expect(esito.eletti.map((e) => e.id).sort()).toEqual(['c1', 'c2', 'c3']);
  });

  test('tutti i candidati a pari merito con piu\' candidati che seggi: ballottaggio totale', () => {
    const esito = calcolaRisultati({
      seggi: 3,
      candidati: CINQUE,
      conteggi: { c1: 5, c2: 5, c3: 5, c4: 5, c5: 5 },
      aventiDiritto: 20,
      votanti: 15,
    });

    expect(esito.ballottaggio_necessario).toBe(true);
    expect(esito.eletti).toHaveLength(0);
    expect(esito.candidati_ballottaggio).toHaveLength(5);
    expect(esito.seggi_al_ballottaggio).toBe(3);
  });
});

describe('calcolaRisultati - casi limite', () => {
  test('nessun votante: nessun eletto, nessuna divisione per zero', () => {
    const esito = calcolaRisultati({
      seggi: 3,
      candidati: CINQUE,
      conteggi: {},
      aventiDiritto: 20,
      votanti: 0,
    });

    expect(esito.eletti).toHaveLength(0);
    expect(esito.affluenza_percentuale).toBe(0);
    expect(esito.risultati.every((r) => r.percentuale_votanti === 0)).toBe(true);
    expect(esito.seggi_scoperti).toBe(3);
  });

  test('un candidato con zero preferenze non occupa un seggio libero', () => {
    const esito = calcolaRisultati({
      seggi: 3,
      candidati: CINQUE,
      conteggi: { c1: 4, c2: 2, c3: 0, c4: 0, c5: 0 },
      aventiDiritto: 10,
      votanti: 6,
    });

    expect(esito.eletti.map((e) => e.id)).toEqual(['c1', 'c2']);
    expect(esito.seggi_scoperti).toBe(1);
    expect(esito.ballottaggio_necessario).toBe(false);
  });

  test('schede bianche entrano nell\'affluenza ma non nelle preferenze', () => {
    const esito = calcolaRisultati({
      seggi: 3,
      candidati: CINQUE,
      conteggi: { c1: 5, c2: 4, c3: 3, c4: 0, c5: 0 },
      aventiDiritto: 20,
      votanti: 10,
      schedeBianche: 4,
    });

    expect(esito.votanti).toBe(10);
    expect(esito.schede_bianche).toBe(4);
    expect(esito.schede_valide).toBe(6);
    expect(esito.preferenze_espresse).toBe(12);
    expect(esito.affluenza_percentuale).toBe(50);
  });

  test('elettori che esprimono meno preferenze del massimo restano validi', () => {
    // 6 votanti, 3 preferenze consentite ma solo 10 preferenze totali espresse.
    const esito = calcolaRisultati({
      seggi: 3,
      candidati: CINQUE,
      conteggi: { c1: 4, c2: 3, c3: 2, c4: 1, c5: 0 },
      aventiDiritto: 6,
      votanti: 6,
    });

    expect(esito.preferenze_espresse).toBe(10);
    expect(esito.preferenze_espresse).toBeLessThan(6 * 3);
    expect(esito.eletti).toHaveLength(3);
  });

  test('un solo seggio e un solo candidato', () => {
    const esito = calcolaRisultati({
      seggi: 1,
      candidati: candidati({ nome: 'Unico', cognome: 'Candidato' }),
      conteggi: { c1: 3 },
      aventiDiritto: 5,
      votanti: 3,
    });

    expect(esito.eletti.map((e) => e.id)).toEqual(['c1']);
    expect(esito.affluenza_percentuale).toBe(60);
  });

  test('affluenza e percentuali sono arrotondate a un decimale', () => {
    const esito = calcolaRisultati({
      seggi: 3,
      candidati: CINQUE,
      conteggi: { c1: 1, c2: 0, c3: 0, c4: 0, c5: 0 },
      aventiDiritto: 3,
      votanti: 1,
    });

    expect(esito.affluenza_percentuale).toBe(33.3);
    expect(esito.risultati[0].percentuale_votanti).toBe(100);
  });

  test('non_votanti non diventa mai negativo', () => {
    const esito = calcolaRisultati({
      seggi: 1,
      candidati: CINQUE,
      conteggi: {},
      aventiDiritto: 0,
      votanti: 5,
    });

    expect(esito.non_votanti).toBe(0);
  });
});

describe('ordinaGraduatoria', () => {
  test('a parita\' di voti ordina alfabeticamente per cognome: esito riproducibile', () => {
    const a = ordinaGraduatoria([
      { id: 'x', nome: 'Zeno', cognome: 'Zeta', voti: 5 },
      { id: 'y', nome: 'Aldo', cognome: 'Alfa', voti: 5 },
    ]);
    const b = ordinaGraduatoria([
      { id: 'y', nome: 'Aldo', cognome: 'Alfa', voti: 5 },
      { id: 'x', nome: 'Zeno', cognome: 'Zeta', voti: 5 },
    ]);

    expect(a.map((c) => c.id)).toEqual(['y', 'x']);
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
  });

  test('non muta l\'array ricevuto', () => {
    const originale = [
      { id: 'a', cognome: 'B', nome: 'B', voti: 1 },
      { id: 'b', cognome: 'A', nome: 'A', voti: 9 },
    ];
    const copia = [...originale];
    ordinaGraduatoria(originale);
    expect(originale).toEqual(copia);
  });
});
