const { Writable } = require('stream');
const PDFDocument = require('pdfkit');
const { leggiHtml, applicaCartaIntestata } = require('../../src/utils/cartaIntestata');
const { generaConvocazionePdf } = require('../../src/utils/convocazionePdf');
const { estraiTestoNormalizzato } = require('../helpers/pdf');

describe('leggiHtml', () => {
  test('paragrafi con allineamento, dimensione, colore e stili', () => {
    const [p] = leggiHtml('<p align="center" size="9" color="#666">Ciao <b>mondo</b> <i>bello</i></p>');
    expect(p).toMatchObject({ tipo: 'p', align: 'center', size: 9, color: '#666' });
    expect(p.frammenti.map((f) => [f.testo, f.grassetto, f.corsivo])).toEqual([
      ['Ciao ', false, false], ['mondo', true, false], [' ', false, false], ['bello', false, true],
    ]);
  });

  test('capisce style="" come gli attributi', () => {
    const [p] = leggiHtml('<p style="text-align:right; font-size:7.5px; color:#777">x</p>');
    expect(p).toMatchObject({ align: 'right', size: 7.5, color: '#777' });
  });

  test('entita\', a capo, linee e logo', () => {
    const blocchi = leggiHtml('<p>Unit&agrave; &middot; C.F.<br>riga due</p><hr><img src="logo" height="50">');
    expect(blocchi[0].frammenti.map((f) => f.testo).join('')).toBe('Unità · C.F.\nriga due');
    expect(blocchi[1]).toEqual({ tipo: 'hr' });
    expect(blocchi[2]).toMatchObject({ tipo: 'img', height: 50, align: 'center' });
  });

  test('una tabella di una riga affianca le celle', () => {
    const [riga] = leggiHtml('<table align="center"><tr><td width="80"><img src="logo"></td><td><p>Testo</p><hr></td></tr></table>');
    expect(riga.tipo).toBe('riga');
    expect(riga.celle).toHaveLength(2);
    expect(riga.celle[0]).toMatchObject({ width: 80, blocchi: [{ tipo: 'img' }] });
    expect(riga.celle[1].blocchi.map((b) => b.tipo)).toEqual(['p', 'hr']);
  });

  test('ignora script, stili e tag sconosciuti', () => {
    const blocchi = leggiHtml('<script>alert(1)</script><style>p{}</style><p>ok<marquee>!</marquee></p>');
    expect(blocchi).toHaveLength(1);
    expect(blocchi[0].frammenti.map((f) => f.testo).join('')).toBe('ok!');
  });

  test('testo vuoto: nessun blocco', () => {
    expect(leggiHtml('')).toEqual([]);
    expect(leggiHtml('<p>   </p>')).toEqual([]);
  });
});

function testo(genera) {
  return new Promise((resolve) => {
    const pezzi = [];
    const sink = new Writable({ write(c, _e, cb) { pezzi.push(c); cb(); } });
    sink.on('finish', () => resolve(estraiTestoNormalizzato(Buffer.concat(pezzi)).replace(/\s+/g, '')));
    genera(sink);
  });
}

describe('applicaCartaIntestata', () => {
  const carta = {
    intestazione: leggiHtml('<p align="center"><b>CARTA DI PROVA</b></p>'),
    piepagina: leggiHtml('<p align="center">Piede pagina {pagina}</p>'),
    logo: null,
  };

  test('ripete intestazione e piè di pagina su ogni pagina, con il numero', async () => {
    const t = await testo((sink) => {
      const doc = new PDFDocument({ size: 'A4', margin: 56, compress: false });
      doc.pipe(sink);
      applicaCartaIntestata(doc, carta);
      for (let i = 0; i < 80; i += 1) doc.text('Riga di contenuto abbastanza lunga da riempire le pagine.');
      doc.end();
    });
    expect(t).toContain('Piedepagina1');
    expect(t).toContain('Piedepagina2');
    expect(t.split('CARTADIPROVA').length - 1).toBeGreaterThanOrEqual(2);
  });

  test('sostituisce l\'intestazione predefinita della convocazione', async () => {
    const assemblea = { tipo_assemblea: 'ordinaria', data_assemblea: '2026-10-21T19:00:00Z', ordine_del_giorno: '1. X' };
    const con = await testo((sink) => generaConvocazionePdf({ assemblea }, sink, { compress: false, cartaIntestata: carta }));
    const senza = await testo((sink) => generaConvocazionePdf({ assemblea }, sink, { compress: false }));
    expect(con).toContain('CARTADIPROVA');
    expect(con).not.toContain('Sedelegale');
    expect(senza).toContain('Sedelegale');
  });

  test('senza carta configurata non cambia nulla', () => {
    const doc = new PDFDocument();
    expect(applicaCartaIntestata(doc, null)).toBe(false);
    expect(doc.page.margins.top).toBe(72);
  });
});
