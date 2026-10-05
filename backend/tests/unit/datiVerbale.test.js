const {
  normalizzaDatiVerbale,
  validaRegistroPresenze,
  calcolaPresenze,
} = require('../../src/utils/datiVerbale');

describe('normalizzaDatiVerbale', () => {
  test('pulisce i testi e accetta i valori previsti', () => {
    const { dati, errore } = normalizzaDatiVerbale({
      presidente: '  Giuseppe Marzullo ',
      segretario: 'Alfredo Micoloni',
      convocazione: 'seconda',
      data_convocazione: '2026-09-15',
      ora_inizio: '18:30',
      componenti_consiglio: '5',
      rinnovo_parziale: true,
      approvazione_voto_app: 'unanimita',
      scrutatori: ['  Rossi Mario ', '', null],
    });
    expect(errore).toBeUndefined();
    expect(dati.presidente).toBe('Giuseppe Marzullo');
    expect(dati.componenti_consiglio).toBe(5);
    expect(dati.scrutatori).toEqual(['Rossi Mario']);
    expect(dati.luogo).toBeNull();
  });

  test('il consiglio ha da 3 a 7 componenti (art. 10.1)', () => {
    expect(normalizzaDatiVerbale({ componenti_consiglio: 2 }).errore).toMatch(/art\. 10\.1/);
    expect(normalizzaDatiVerbale({ componenti_consiglio: 8 }).errore).toMatch(/art\. 10\.1/);
    expect(normalizzaDatiVerbale({ componenti_consiglio: 7 }).errore).toBeUndefined();
    expect(normalizzaDatiVerbale({ componenti_consiglio: '' }).dati.componenti_consiglio).toBeNull();
  });

  test('rifiuta convocazione, date e orari non validi', () => {
    expect(normalizzaDatiVerbale({ convocazione: 'terza' }).errore).toBeDefined();
    expect(normalizzaDatiVerbale({ data_convocazione: '15/09/2026' }).errore).toBeDefined();
    expect(normalizzaDatiVerbale({ ora_chiusura: '25:00' }).errore).toBeDefined();
    expect(normalizzaDatiVerbale({ approvazione_voto_app: 'forse' }).errore).toBeDefined();
  });
});

describe('validaRegistroPresenze', () => {
  const elettorato = new Set(['a', 'b', 'c', 'd']);

  test('accetta presenze e deleghe regolari', () => {
    const { righe, errore } = validaRegistroPresenze([
      { user_id: 'a', presenza: 'in_sala' },
      { user_id: 'b', presenza: 'delega', delegato_user_id: 'a' },
      { user_id: 'c', presenza: 'collegato' },
      { user_id: 'd', presenza: null },
    ], elettorato);
    expect(errore).toBeUndefined();
    expect(righe.find((r) => r.user_id === 'b').delegato_user_id).toBe('a');
    expect(righe.find((r) => r.user_id === 'a').delegato_user_id).toBeNull();
  });

  test('al massimo due deleghe per socio (art. 9.3)', () => {
    const { errore } = validaRegistroPresenze([
      { user_id: 'a', presenza: 'in_sala' },
      { user_id: 'b', presenza: 'delega', delegato_user_id: 'a' },
      { user_id: 'c', presenza: 'delega', delegato_user_id: 'a' },
      { user_id: 'd', presenza: 'delega', delegato_user_id: 'a' },
    ], elettorato);
    expect(errore).toMatch(/massimo 2/);
  });

  test('il delegato deve essere presente in proprio', () => {
    expect(validaRegistroPresenze([
      { user_id: 'a', presenza: 'assente' },
      { user_id: 'b', presenza: 'delega', delegato_user_id: 'a' },
    ], elettorato).errore).toMatch(/presente in proprio/);

    // Niente deleghe a catena.
    expect(validaRegistroPresenze([
      { user_id: 'a', presenza: 'in_sala' },
      { user_id: 'b', presenza: 'delega', delegato_user_id: 'a' },
      { user_id: 'c', presenza: 'delega', delegato_user_id: 'b' },
    ], elettorato).errore).toMatch(/presente in proprio/);
  });

  test('rifiuta autodelega, delegati esterni e soci fuori dall\'elettorato', () => {
    expect(validaRegistroPresenze([{ user_id: 'a', presenza: 'delega', delegato_user_id: 'a' }], elettorato).errore)
      .toMatch(/se stesso/);
    expect(validaRegistroPresenze([{ user_id: 'a', presenza: 'delega', delegato_user_id: 'z' }], elettorato).errore)
      .toMatch(/avente diritto/);
    expect(validaRegistroPresenze([{ user_id: 'z', presenza: 'in_sala' }], elettorato).errore)
      .toMatch(/aventi diritto/);
    expect(validaRegistroPresenze([{ user_id: 'a', presenza: 'delega' }], elettorato).errore)
      .toMatch(/socio delegato/);
  });
});

describe('calcolaPresenze (quorum art. 9.5)', () => {
  const socio = (presenza, quota = true, votato = false) => ({ presenza, quota_in_regola: quota, ha_votato: votato });

  test('prima convocazione: serve almeno la meta\' dei soci in regola, deleghe comprese', () => {
    const registro = [socio('in_sala'), socio('delega'), socio('assente'), socio('assente')];
    const p = calcolaPresenze(registro, 'prima');
    expect(p.presenti_in_regola).toBe(2);
    expect(p.in_regola).toBe(4);
    expect(p.quorum_raggiunto).toBe(true);

    expect(calcolaPresenze([socio('in_sala'), socio('assente'), socio('assente')], 'prima').quorum_raggiunto)
      .toBe(false);
  });

  test('i presenti non in regola non contano per il quorum', () => {
    const registro = [socio('in_sala', false), socio('in_sala', false), socio('assente'), socio('assente')];
    const p = calcolaPresenze(registro, 'prima');
    expect(p.presenti).toBe(2);
    expect(p.presenti_in_regola).toBe(0);
    expect(p.quorum_raggiunto).toBe(false);
  });

  test('seconda convocazione: valida con qualunque numero di presenti', () => {
    expect(calcolaPresenze([socio('assente')], 'seconda').quorum_raggiunto).toBe(true);
  });

  test('senza presenze registrate il quorum di prima convocazione non e\' verificabile', () => {
    const p = calcolaPresenze([socio(null), socio(null)], 'prima');
    expect(p.registrato).toBe(false);
    expect(p.quorum_raggiunto).toBeNull();
  });

  test('conta chi ha votato senza essere in regola con la quota', () => {
    const p = calcolaPresenze([socio('in_sala', false, true), socio('in_sala', true, true)], 'seconda');
    expect(p.votanti).toBe(2);
    expect(p.votanti_non_in_regola).toBe(1);
  });
});

describe('Consiglio direttivo (art. 10.2)', () => {
  const { normalizzaDatiVerbaleConsiglio, esitoConsiglio } = require('../../src/utils/datiVerbale');
  const consiglieri = [
    { user_id: 'p', cognome: 'P', nome: 'P', carica: 'presidente' },
    { user_id: 'q', cognome: 'Q', nome: 'Q', carica: 'consigliere' },
    { user_id: 'r', cognome: 'R', nome: 'R', carica: 'consigliere' },
  ];

  test('valido con la maggioranza dei componenti, non con la meta\'', () => {
    const due = normalizzaDatiVerbaleConsiglio({ presenti: ['p', 'q'] }, consiglieri).dati;
    expect(esitoConsiglio(due).valido).toBe(true);
    const quattro = [...consiglieri, { user_id: 's', cognome: 'S', nome: 'S', carica: 'consigliere' }];
    const meta = normalizzaDatiVerbaleConsiglio({ presenti: ['p', 'q'] }, quattro).dati;
    expect(esitoConsiglio(meta).valido).toBe(false);
  });

  test('delibera a maggioranza dei presenti: gli astenuti pesano come presenti', () => {
    const { dati } = normalizzaDatiVerbaleConsiglio({
      presenti: ['p', 'q', 'r'],
      delibere: [
        { oggetto: 'Passa', favorevoli: 2, contrari: 1 },
        { oggetto: 'Non passa', favorevoli: 1, contrari: 0, astenuti: 2 },
      ],
    }, consiglieri);
    const [passa, nonPassa] = esitoConsiglio(dati).delibere;
    expect(passa.approvata).toBe(true);
    expect(passa.unanimita).toBe(false);
    expect(nonPassa.approvata).toBe(false);
  });

  test('fotografa nome e carica dei consiglieri', () => {
    const { dati } = normalizzaDatiVerbaleConsiglio({ presenti: ['p'] }, consiglieri);
    expect(dati.consiglieri[0]).toEqual({ user_id: 'p', cognome: 'P', nome: 'P', carica: 'presidente', presente: true });
  });

  test('ogni delibera deve avere un oggetto', () => {
    expect(normalizzaDatiVerbaleConsiglio({ delibere: [{ favorevoli: 0 }] }, consiglieri).errore).toMatch(/oggetto/);
  });
});
