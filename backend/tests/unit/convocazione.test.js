const { Writable } = require('stream');
const { generaConvocazionePdf, giornoPrima, daLocale, giornoEsteso } = require('../../src/utils/convocazionePdf');
const { estraiTestoNormalizzato } = require('../helpers/pdf');

function testoPdf(dati) {
  return new Promise((resolve) => {
    const pezzi = [];
    const sink = new Writable({ write(c, _e, cb) { pezzi.push(c); cb(); } });
    sink.on('finish', () => resolve(estraiTestoNormalizzato(Buffer.concat(pezzi)).replace(/\s+/g, '')));
    generaConvocazionePdf(dati, sink, { compress: false });
  });
}
const compatto = (t) => t.replace(/\s+/g, '');

const ASSEMBLEA = {
  tipo_assemblea: 'ordinaria',
  // 19:00Z = 21:00 in Italia
  data_assemblea: '2026-10-21T19:00:00Z',
  luogo: 'Via Adriano Falvo 9, Salerno',
  ordine_del_giorno: '1. Bilancio preventivo\n2. Varie ed eventuali',
};

describe('date della convocazione', () => {
  test('la prima convocazione di default e\' il giorno prima alla stessa ora, anche a cavallo di mese', () => {
    expect(giornoPrima({ anno: 2026, mese: 10, giorno: 1, ora: '21:00' }))
      .toEqual({ anno: 2026, mese: 9, giorno: 30, ora: '21:00' });
  });
  test('legge il valore di un campo datetime-local e scrive il giorno della settimana', () => {
    const p = daLocale('2026-10-20T20:30');
    expect(p).toEqual({ anno: 2026, mese: 10, giorno: 20, ora: '20:30' });
    expect(giornoEsteso(p)).toBe('martedì 20 ottobre 2026');
    expect(daLocale('20/10/2026')).toBeNull();
  });
});

describe('generaConvocazionePdf', () => {
  test('assemblea: prima e seconda convocazione, ordine del giorno, deleghe e modulo', async () => {
    const t = await testoPdf({ assemblea: ASSEMBLEA, presidente: 'Giuseppe Marzullo', dataDocumento: '2026-09-29' });
    expect(t).toContain(compatto('Salerno, 29 settembre 2026'));
    expect(t).toContain(compatto('in prima convocazione il giorno martedì 20 ottobre 2026, alle ore 21:00'));
    expect(t).toContain(compatto('in seconda convocazione il giorno mercoledì 21 ottobre 2026, alle ore 21:00'));
    expect(t).toContain(compatto('Bilancio preventivo'));
    expect(t).toContain(compatto('al massimo due associati'));
    expect(t).toContain('DELEGA');
    expect(t).toContain(compatto('Giuseppe Marzullo'));
  });

  test('rispetta la prima convocazione indicata', async () => {
    const t = await testoPdf({ assemblea: ASSEMBLEA, prima: '2026-10-21T20:00' });
    expect(t).toContain(compatto('in prima convocazione il giorno mercoledì 21 ottobre 2026, alle ore 20:00'));
  });

  test('straordinaria: richiama il quorum per le modifiche statutarie', async () => {
    const t = await testoPdf({ assemblea: { ...ASSEMBLEA, tipo_assemblea: 'straordinaria' } });
    expect(t).toContain(compatto('Assemblea straordinaria dei soci'));
    expect(t).toContain(compatto('metà più uno dei soci aventi diritto'));
  });

  test('Consiglio: ai consiglieri, senza seconda convocazione ne\' deleghe', async () => {
    const t = await testoPdf({
      assemblea: { ...ASSEMBLEA, tipo_assemblea: 'consiglio' },
      consiglieri: [{ cognome: 'Micoloni', nome: 'Alfredo' }],
    });
    expect(t).toContain(compatto('Ai componenti del Consiglio direttivo'));
    expect(t).toContain('MicoloniAlfredo');
    expect(t).toContain(compatto('non sono ammesse deleghe'));
    expect(t).not.toContain('secondaconvocazione');
    expect(t).not.toContain('DELEGA');
  });
});
