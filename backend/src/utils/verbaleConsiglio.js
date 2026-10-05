const PDFDocument = require('pdfkit');
const { applicaCartaIntestata } = require('./cartaIntestata');
const {
  formattaData, formattaGiorno, elencoAllegati, parti, DENOMINAZIONE, SEDE_LEGALE, VUOTO,
} = require('./verbaleVotazione');
const { esitoConsiglio } = require('./datiVerbale');

/**
 * Verbale di una riunione del Consiglio direttivo in PDF.
 *
 * Stesso schema del verbale d'assemblea, con le regole dell'art. 10.2 dello
 * Statuto: il Consiglio e' valido con la maggioranza dei componenti, delibera
 * a maggioranza dei presenti e non ammette deleghe. Il verbale va trascritto
 * nel libro delle adunanze e delle deliberazioni del Consiglio (art. 17).
 */

const ETICHETTE_CARICA = {
  presidente: 'Presidente',
  vicepresidente: 'Vicepresidente',
  segretario: 'Segretario',
  consigliere: 'Consigliere',
};

const oppure = (v) => v || VUOTO;

function generaVerbaleConsiglioPdf({ assemblea, dati, allegati = [] }, stream, opzioni = {}) {
  const d = dati || {};
  const esito = esitoConsiglio(d);
  const doc = new PDFDocument({ size: 'A4', margin: 56, compress: opzioni.compress !== false });
  doc.pipe(stream);
  const conCarta = applicaCartaIntestata(doc, opzioni.cartaIntestata);

  const sinistra = doc.page.margins.left;
  const larghezza = doc.page.width - sinistra - doc.page.margins.right;
  const fondo = () => doc.page.height - doc.page.margins.bottom;
  const spazio = (h) => { if (doc.y + h > fondo()) doc.addPage(); };
  const titolo = (t) => {
    spazio(60);
    doc.moveDown(0.6);
    doc.fontSize(10.5).font('Helvetica-Bold').text(t, sinistra, doc.y, { width: larghezza });
    doc.moveDown(0.3);
  };
  const paragrafo = (t, { grassetto = false, ...extra } = {}) => {
    doc.fontSize(10).font(grassetto ? 'Helvetica-Bold' : 'Helvetica')
      .text(t, sinistra, doc.y, { width: larghezza, align: 'justify', ...extra });
    doc.moveDown(0.4);
  };
  const elenco = (voci) => {
    doc.fontSize(10).font('Helvetica');
    voci.forEach((v) => doc.text(`–  ${v}`, sinistra + 12, doc.y, { width: larghezza - 12 }));
    doc.moveDown(0.4);
  };
  const nomeConsigliere = (c) => `${c.cognome} ${c.nome} (${ETICHETTE_CARICA[c.carica] || c.carica})`;

  // Intestazione: quella della carta intestata, se c'e', sostituisce questa.
  if (!conCarta) {
    doc.fontSize(15).font('Helvetica-Bold').text(DENOMINAZIONE.toUpperCase(), sinistra, doc.y, { width: larghezza, align: 'center' });
    doc.fontSize(9).font('Helvetica').text(`Sede legale: ${SEDE_LEGALE}`, { width: larghezza, align: 'center' });
    doc.moveDown(1);
  }
  doc.fontSize(13).font('Helvetica-Bold').text(
    `VERBALE DI RIUNIONE DEL CONSIGLIO DIRETTIVO N. ${d.numero_verbale || '____'}`,
    { width: larghezza, align: 'center' }
  );
  doc.moveDown(0.2);
  doc.fontSize(11).font('Helvetica').text(assemblea.titolo, { width: larghezza, align: 'center' });
  doc.moveDown(0.8);
  doc.moveTo(sinistra, doc.y).lineTo(sinistra + larghezza, doc.y).stroke();
  doc.moveDown(0.8);

  // Apertura
  const oraProgrammata = parti(assemblea.data_assemblea)?.ora;
  paragrafo(
    `Il giorno ${formattaData(assemblea.data_assemblea)}, alle ore ${d.ora_inizio || oraProgrammata || '______'}, ` +
    `presso ${oppure(d.luogo || assemblea.luogo)}, si è riunito il Consiglio direttivo dell'associazione ` +
    `«${DENOMINAZIONE}», convocato dal Presidente ai sensi dell'art. 11 dello Statuto con avviso inviato il ` +
    `${formattaGiorno(d.data_convocazione) || VUOTO} tramite ${oppure(d.mezzo_convocazione)}, ` +
    'per discutere e deliberare sul seguente'
  );
  doc.font('Helvetica-Bold').text('ORDINE DEL GIORNO', sinistra, doc.y, { width: larghezza, align: 'center' });
  doc.moveDown(0.3);
  paragrafo(assemblea.ordine_del_giorno || VUOTO, { align: 'left' });

  // Costituzione (art. 10.2)
  titolo('COSTITUZIONE DEL CONSIGLIO');
  paragrafo(
    `Presiede la riunione ${oppure(d.presidente)}; funge da segretario verbalizzante ${oppure(d.segretario)}.`
  );
  const presenti = (d.consiglieri || []).filter((c) => c.presente);
  const assenti = (d.consiglieri || []).filter((c) => !c.presente);
  if (esito.componenti > 0) {
    paragrafo(`Sono presenti ${esito.presenti} consiglieri su ${esito.componenti} in carica:`, { align: 'left' });
    elenco(presenti.length ? presenti.map(nomeConsigliere) : ['nessuno']);
    if (assenti.length) {
      paragrafo('Risultano assenti:', { align: 'left' });
      elenco(assenti.map(nomeConsigliere));
    }
  } else {
    paragrafo('Sono presenti i consiglieri: ' + VUOTO + VUOTO);
  }
  if (d.invitati) paragrafo(`Partecipano senza diritto di voto: ${d.invitati}.`);

  if (esito.componenti === 0) {
    paragrafo(
      'Il Presidente, verificata la presenza della maggioranza dei componenti (art. 10.2 dello Statuto), ' +
      'dichiara il Consiglio validamente costituito.'
    );
  } else if (esito.valido) {
    paragrafo(
      'Essendo presente la maggioranza dei componenti (art. 10.2 dello Statuto), il Presidente dichiara il ' +
      'Consiglio validamente costituito e atto a deliberare. Non sono ammesse deleghe.'
    );
  } else {
    paragrafo(
      `ATTENZIONE: sono presenti ${esito.presenti} consiglieri su ${esito.componenti}: non è raggiunta la ` +
      'maggioranza dei componenti richiesta dall\'art. 10.2 dello Statuto per la validità della riunione.',
      { grassetto: true }
    );
  }

  // Delibere
  titolo('DISCUSSIONE E DELIBERE');
  if (esito.delibere.length === 0) {
    paragrafo(VUOTO + VUOTO + VUOTO);
  }
  esito.delibere.forEach((delibera, i) => {
    spazio(80);
    paragrafo(`Delibera n. ${i + 1} – ${delibera.oggetto}`, { grassetto: true, align: 'left' });
    if (delibera.testo) paragrafo(delibera.testo);
    const voti = `favorevoli ${delibera.favorevoli}, contrari ${delibera.contrari}, astenuti ${delibera.astenuti}`;
    let risultato;
    if (delibera.unanimita) risultato = 'Il Consiglio approva all\'unanimità dei presenti.';
    else if (delibera.approvata) risultato = `Il Consiglio approva a maggioranza dei presenti (${voti}).`;
    else risultato = `La proposta non è approvata (${voti}).`;
    paragrafo(risultato);
  });

  if (d.note) {
    titolo('VARIE ED EVENTUALI');
    paragrafo(d.note);
  }

  // Chiusura e firme (art. 17)
  titolo('CHIUSURA');
  paragrafo(
    'Null\'altro essendovi da deliberare, il Presidente dichiara chiusa la riunione alle ore ' +
    `${d.ora_chiusura || '______'}, previa lettura e approvazione del presente verbale, che sarà trascritto ` +
    'nel libro delle adunanze e delle deliberazioni del Consiglio direttivo (art. 17 dello Statuto).'
  );
  if (allegati.length > 0) {
    paragrafo(`Allegati: ${elencoAllegati(allegati.map((a) => a.titolo))}.`, { align: 'left' });
  }

  spazio(90);
  doc.moveDown(0.8);
  const y = doc.y;
  [['Il Presidente', d.presidente, sinistra], ['Il Segretario verbalizzante', d.segretario, sinistra + 260]]
    .forEach(([ruolo, nome, x]) => {
      doc.fontSize(10).font('Helvetica').text(ruolo, x, y, { width: 200 });
      if (nome) doc.text(nome, x, doc.y, { width: 200 });
      doc.moveTo(x, y + 52).lineTo(x + 200, y + 52).stroke();
    });
  doc.x = sinistra;
  doc.y = y + 70;

  doc.fontSize(7).fillColor('#666666').text(
    `Documento generato dal sistema gestionale ${DENOMINAZIONE}. Riservato ai componenti del Consiglio direttivo.`,
    sinistra, doc.y, { width: larghezza }
  );
  doc.fillColor('#000000');

  doc.end();
}

module.exports = { generaVerbaleConsiglioPdf };
