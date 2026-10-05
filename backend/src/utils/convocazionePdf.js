const PDFDocument = require('pdfkit');
const { applicaCartaIntestata } = require('./cartaIntestata');
const { parti, DENOMINAZIONE, SEDE_LEGALE, VUOTO } = require('./verbaleVotazione');

/**
 * Avviso di convocazione in PDF, sullo schema classico dei fac-simile per le
 * associazioni: luogo e data, destinatari, oggetto, convocazione in prima e
 * seconda convocazione, ordine del giorno, note su diritto di voto e deleghe,
 * firma del Presidente e modulo di delega da staccare.
 *
 * Regole dallo statuto: convoca il Presidente (art. 11); votano i soci in
 * regola con la quota (art. 9.1); deleghe scritte, al massimo due per socio
 * (art. 9.3); quorum (art. 9.5). Per il Consiglio direttivo: niente seconda
 * convocazione ne' deleghe (art. 10.2).
 */

const MESI = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];
const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

/**
 * Giorno di calendario { anno, mese, giorno, ora } in forma estesa:
 * "martedì 22 settembre 2026".
 */
function giornoEsteso({ anno, mese, giorno }) {
  const settimana = GIORNI[new Date(Date.UTC(anno, mese - 1, giorno)).getUTCDay()];
  return `${settimana} ${giorno} ${MESI[mese - 1]} ${anno}`;
}

/** "AAAA-MM-GGTHH:MM" (ora italiana, come da <input type="datetime-local">). */
function daLocale(valore) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(valore || '');
  if (!m) return null;
  return { anno: Number(m[1]), mese: Number(m[2]), giorno: Number(m[3]), ora: `${m[4]}:${m[5]}` };
}

/** Lo stesso orario del giorno prima: la prima convocazione di default. */
function giornoPrima(p) {
  const d = new Date(Date.UTC(p.anno, p.mese - 1, p.giorno - 1));
  return { anno: d.getUTCFullYear(), mese: d.getUTCMonth() + 1, giorno: d.getUTCDate(), ora: p.ora };
}

const TIPI = {
  ordinaria: 'Assemblea ordinaria dei soci',
  straordinaria: 'Assemblea straordinaria dei soci',
};

/**
 * @param {object} params
 * @param {object} params.assemblea       riga di assemblee
 * @param {string} [params.presidente]    nome del Presidente in carica
 * @param {Array}  [params.consiglieri]   per il Consiglio: [{ cognome, nome }]
 * @param {string} [params.prima]         prima convocazione "AAAA-MM-GGTHH:MM" (default: il giorno prima)
 * @param {string} [params.dataDocumento] "AAAA-MM-GG" (default: oggi)
 */
function generaConvocazionePdf({
  assemblea, presidente, consiglieri = [], prima, dataDocumento,
}, stream, opzioni = {}) {
  const consiglio = assemblea.tipo_assemblea === 'consiglio';
  const organo = TIPI[assemblea.tipo_assemblea] || TIPI.ordinaria;
  const straordinaria = assemblea.tipo_assemblea === 'straordinaria';

  const seconda = parti(assemblea.data_assemblea);
  const primaConv = daLocale(prima) || (seconda && giornoPrima(seconda));
  const emissione = /^\d{4}-\d{2}-\d{2}$/.test(dataDocumento || '')
    ? daLocale(`${dataDocumento}T00:00`)
    : parti(new Date());

  const doc = new PDFDocument({ size: 'A4', margin: 56, compress: opzioni.compress !== false });
  doc.pipe(stream);
  const conCarta = applicaCartaIntestata(doc, opzioni.cartaIntestata);
  const sinistra = doc.page.margins.left;
  const larghezza = doc.page.width - sinistra - doc.page.margins.right;
  const paragrafo = (t, { grassetto = false, ...extra } = {}) => {
    doc.fontSize(10.5).font(grassetto ? 'Helvetica-Bold' : 'Helvetica')
      .text(t, sinistra, doc.y, { width: larghezza, align: 'justify', ...extra });
    doc.moveDown(0.5);
  };

  // Intestazione: quella della carta intestata, se c'e', sostituisce questa.
  if (!conCarta) {
    doc.fontSize(15).font('Helvetica-Bold').text(DENOMINAZIONE.toUpperCase(), sinistra, doc.y, { width: larghezza, align: 'center' });
    doc.fontSize(9).font('Helvetica').text(`Sede legale: ${SEDE_LEGALE}`, { width: larghezza, align: 'center' });
    doc.moveDown(0.6);
    doc.moveTo(sinistra, doc.y).lineTo(sinistra + larghezza, doc.y).stroke();
    doc.moveDown(1);
  }

  doc.fontSize(10.5).font('Helvetica')
    .text(`Salerno, ${emissione ? `${emissione.giorno} ${MESI[emissione.mese - 1]} ${emissione.anno}` : VUOTO}`,
      sinistra, doc.y, { width: larghezza, align: 'right' });
  doc.moveDown(1);

  // Destinatari
  const destinatari = consiglio
    ? ['Ai componenti del Consiglio direttivo', ...consiglieri.map((c) => `${c.cognome} ${c.nome}`)]
    : [`Ai Soci dell'associazione «${DENOMINAZIONE}»`, 'Loro sedi'];
  destinatari.forEach((r, i) => doc.font(i === 0 ? 'Helvetica-Bold' : 'Helvetica')
    .text(r, sinistra + larghezza / 2, doc.y, { width: larghezza / 2 }));
  doc.moveDown(1.2);

  const oggetto = consiglio ? 'Convocazione del Consiglio direttivo' : `Convocazione dell'${organo}`;
  doc.font('Helvetica-Bold').text(`Oggetto: ${oggetto}`, sinistra, doc.y, { width: larghezza });
  doc.moveDown(1);

  const quando = (p) => (p ? `${giornoEsteso(p)}, alle ore ${p.ora}` : VUOTO);
  const luogo = assemblea.luogo || VUOTO;

  if (consiglio) {
    paragrafo('Gentili Consiglieri,');
    paragrafo(
      'ai sensi dell\'art. 11 dello Statuto, il Presidente convoca il Consiglio direttivo presso ' +
      `${luogo}, il giorno ${quando(seconda)}, per discutere e deliberare sul seguente`
    );
  } else {
    paragrafo('Gentili Soci,');
    paragrafo(
      `ai sensi degli artt. 9 e 11 dello Statuto, il Presidente convoca l'${organo} presso ${luogo}, ` +
      `in prima convocazione il giorno ${quando(primaConv)} e, occorrendo, in seconda convocazione ` +
      `il giorno ${quando(seconda)}, per discutere e deliberare sul seguente`
    );
  }

  doc.moveDown(0.2);
  doc.fontSize(10.5).font('Helvetica-Bold').text('ORDINE DEL GIORNO', sinistra, doc.y, { width: larghezza, align: 'center' });
  doc.moveDown(0.4);
  paragrafo(assemblea.ordine_del_giorno || VUOTO, { align: 'left' });
  doc.moveDown(0.3);

  if (consiglio) {
    paragrafo(
      'La riunione è validamente costituita con la presenza della maggioranza dei componenti e delibera ' +
      'a maggioranza dei presenti; non sono ammesse deleghe (art. 10.2 dello Statuto).'
    );
  } else {
    paragrafo(
      'Hanno diritto di intervenire e di votare i soci in regola con il versamento della quota associativa ' +
      '(art. 9.1 dello Statuto). Il socio impossibilitato a partecipare può farsi rappresentare da un altro ' +
      'socio mediante delega scritta e firmata, utilizzando il modulo in calce; ciascun socio può ' +
      'rappresentare al massimo due associati (art. 9.3).'
    );
    paragrafo(
      straordinaria
        ? 'Per le modifiche dello Statuto è richiesta, sia in prima sia in seconda convocazione, la presenza ' +
          'di almeno la metà più uno dei soci aventi diritto e il voto favorevole della maggioranza dei presenti ' +
          '(art. 9.5 dello Statuto).'
        : 'In prima convocazione l\'Assemblea è validamente costituita con la presenza di almeno la metà dei ' +
          'soci in regola, in proprio o per delega; in seconda convocazione qualunque sia il numero dei ' +
          'presenti (art. 9.5 dello Statuto).'
    );
  }

  paragrafo('Cordiali saluti.');
  doc.moveDown(0.8);
  const xFirma = sinistra + larghezza / 2;
  doc.font('Helvetica').text('Il Presidente', xFirma, doc.y, { width: larghezza / 2, align: 'center' });
  if (presidente) doc.text(presidente, xFirma, doc.y, { width: larghezza / 2, align: 'center' });
  doc.moveDown(2);
  doc.moveTo(xFirma + 30, doc.y).lineTo(sinistra + larghezza - 30, doc.y).stroke();
  doc.x = sinistra;

  // Modulo di delega (solo assemblee: nel Consiglio le deleghe non sono ammesse)
  if (!consiglio) {
    doc.moveDown(2);
    if (doc.y > doc.page.height - doc.page.margins.bottom - 220) doc.addPage();
    doc.dash(4, { space: 3 }).moveTo(sinistra, doc.y).lineTo(sinistra + larghezza, doc.y).stroke().undash();
    doc.fontSize(7).fillColor('#666666').text('ritagliare lungo la linea', sinistra, doc.y + 2, { width: larghezza, align: 'center' });
    doc.fillColor('#000000');
    doc.moveDown(1.2);
    doc.fontSize(11).font('Helvetica-Bold').text('DELEGA', sinistra, doc.y, { width: larghezza, align: 'center' });
    doc.moveDown(0.8);
    paragrafo(
      'Il/La sottoscritto/a ______________________________________, socio/a dell\'associazione ' +
      `«${DENOMINAZIONE}», impossibilitato/a a partecipare personalmente, delega il/la socio/a ` +
      `______________________________________ a rappresentarlo/a nell'${organo} convocata per il giorno ` +
      `${primaConv ? giornoEsteso(primaConv) : VUOTO} in prima convocazione e, occorrendo, per il giorno ` +
      `${seconda ? giornoEsteso(seconda) : VUOTO} in seconda convocazione, approvandone fin d'ora l'operato.`,
      { lineGap: 4 }
    );
    doc.moveDown(1);
    const y = doc.y;
    doc.fontSize(10.5).font('Helvetica').text('Luogo e data ______________________', sinistra, y, { width: larghezza / 2 });
    doc.text('Firma del delegante ______________________', xFirma, y, { width: larghezza / 2, align: 'right' });
    doc.x = sinistra;
    doc.moveDown(1.5);
    doc.fontSize(8).fillColor('#666666').text(
      'Il delegato deve essere a sua volta socio; ciascun socio può rappresentare al massimo due associati ' +
      '(art. 9.3 dello Statuto). La delega va consegnata al Presidente dell\'Assemblea prima dell\'inizio dei lavori ' +
      'e viene allegata al verbale.',
      sinistra, doc.y, { width: larghezza }
    );
    doc.fillColor('#000000');
  }

  doc.end();
}

module.exports = { generaConvocazionePdf, giornoPrima, daLocale, giornoEsteso };
