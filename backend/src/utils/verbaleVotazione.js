const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const { applicaCartaIntestata } = require('./cartaIntestata');

/**
 * Generazione del verbale d'assemblea della votazione in PDF.
 *
 * Lo schema segue i modelli dei centri servizi per il volontariato (CESVOT,
 * CSV Torino, CSI Pavia) adattati allo statuto dell'associazione:
 * apertura e convocazione, costituzione e quorum (art. 9.5), delibere
 * preliminari (numero dei consiglieri, art. 10.1, e modalita' di voto),
 * candidature, scrutinio, proclamazione, chiusura e firme. In coda il registro
 * presenze (Allegato A), come il foglio firme dei modelli.
 *
 * I dati che l'app non conosce (chi presiede, luogo, orari...) li inserisce
 * l'admin; quelli mancanti restano come righe da completare a mano, come nei
 * fac-simile cartacei.
 *
 * In calce un hash SHA-256 dei soli dati di scrutinio permette di verificare a
 * distanza di tempo che l'esito non sia stato alterato.
 */

const DENOMINAZIONE = 'La Brigata – Unità di strada ODV';
const SEDE_LEGALE = process.env.SEDE_LEGALE || 'indirizzo della sede legale';
const FUSO = 'Europe/Rome';
const VUOTO = '____________________';

const MESI = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];

/** Scompone una data nel fuso italiano: il server gira in UTC. */
function parti(valore) {
  if (!valore) return null;
  const d = new Date(valore);
  if (Number.isNaN(d.getTime())) return null;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('it-IT', {
      timeZone: FUSO, year: 'numeric', month: 'numeric', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(d).map((x) => [x.type, x.value])
  );
  return { giorno: Number(p.day), mese: Number(p.month), anno: Number(p.year), ora: `${p.hour}:${p.minute}` };
}

function formattaData(valore) {
  const p = parti(valore);
  return p ? `${p.giorno} ${MESI[p.mese - 1]} ${p.anno}` : '—';
}

function formattaDataOra(valore) {
  const p = parti(valore);
  return p ? `${formattaData(valore)} alle ore ${p.ora}` : '—';
}

/** Data AAAA-MM-GG (senza orario) in forma estesa. */
function formattaGiorno(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${Number(m[3])} ${MESI[Number(m[2]) - 1]} ${m[1]}` : null;
}

const oppure = (valore) => valore || VUOTO;

/**
 * Impronta dei soli dati che determinano l'esito. Ricalcolabile dal database in
 * qualunque momento: se non coincide con quella stampata, il verbale e' stato
 * modificato o i dati non sono piu' quelli originali.
 */
function calcolaHashScrutinio(votazione, esito) {
  const payload = JSON.stringify({
    votazione_id: votazione.id,
    titolo: votazione.titolo,
    seggi: esito.seggi_da_eleggere,
    aventi_diritto: esito.aventi_diritto,
    votanti: esito.votanti,
    schede_bianche: esito.schede_bianche,
    risultati: esito.risultati.map((r) => ({
      id: r.id,
      cognome: r.cognome,
      nome: r.nome,
      voti: r.voti,
    })),
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

const ETICHETTA_PRESENZA = {
  in_sala: 'di persona',
  collegato: 'a distanza',
  assente: 'assente',
};

function etichettaPresenza(r) {
  if (r.presenza === 'delega') return `per delega a ${r.delegato_nome || '—'}`;
  return ETICHETTA_PRESENZA[r.presenza] || '—';
}

/**
 * Scrive il PDF sullo stream indicato (tipicamente la response Express).
 *
 * @param {object} params
 * @param {object} params.votazione  riga di votazioni, con i dati dell'assemblea collegata
 * @param {object} params.esito      risultato di calcolaRisultati
 * @param {object} [params.dati]     dati_verbale inseriti dall'admin
 * @param {Array}  [params.registro] [{ cognome, nome, quota_in_regola, presenza, delegato_nome, ha_votato }]
 * @param {object} [params.presenze] risultato di calcolaPresenze
 * @param {Array}  [params.allegati] [{ titolo }] allegati caricati sull'assemblea
 * @returns {string} l'hash di integrita' stampato sul documento
 */
/**
 * Elenco degli allegati per la chiusura del verbale: A, B, C...
 * @param {string[]} voci titoli in ordine
 */
function elencoAllegati(voci) {
  return voci.map((v, i) => `${String.fromCharCode(65 + (i % 26))}) ${v}`).join('; ');
}

function generaVerbalePdf({ votazione, esito, dati, registro = [], presenze, allegati = [] }, stream, opzioni = {}) {
  const hash = calcolaHashScrutinio(votazione, esito);
  // Per convenzione dell'associazione le assemblee si tengono in seconda
  // convocazione: e' il valore predefinito se l'admin non indica altro.
  const d = { ...(dati || {}), convocazione: dati?.convocazione || 'seconda' };
  const scrutatori = d.scrutatori || [];
  // `compress: false` serve ai test, che ispezionano il testo dentro al PDF.
  const doc = new PDFDocument({ size: 'A4', margin: 56, compress: opzioni.compress !== false });
  doc.pipe(stream);
  const conCarta = applicaCartaIntestata(doc, opzioni.cartaIntestata);

  const sinistra = doc.page.margins.left;
  const larghezza = doc.page.width - sinistra - doc.page.margins.right;
  const fondo = () => doc.page.height - doc.page.margins.bottom;
  const spazio = (h) => { if (doc.y + h > fondo()) doc.addPage(); };
  const riga = () => {
    doc.moveTo(sinistra, doc.y).lineTo(sinistra + larghezza, doc.y).stroke();
  };
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
  const elenco = (voci, { grassetto = false } = {}) => {
    doc.fontSize(10).font(grassetto ? 'Helvetica-Bold' : 'Helvetica');
    voci.forEach((v) => {
      doc.text(`–  ${v}`, sinistra + 12, doc.y, { width: larghezza - 12 });
    });
    doc.moveDown(0.4);
  };
  const firma = (x, y, ruolo, nome) => {
    doc.fontSize(10).font('Helvetica').text(ruolo, x, y, { width: 200 });
    if (nome) doc.text(nome, x, doc.y, { width: 200 });
    doc.moveTo(x, y + 52).lineTo(x + 200, y + 52).stroke();
  };

  const dataSeduta = votazione.data_assemblea || votazione.aperta_at;
  const luogo = d.luogo || votazione.assemblea_luogo;
  const pr = presenze || null;
  const conRegistro = Boolean(pr && pr.registrato);

  // Intestazione: quella della carta intestata, se c'e', sostituisce questa.
  if (!conCarta) {
    doc.fontSize(15).font('Helvetica-Bold').text(DENOMINAZIONE.toUpperCase(), sinistra, doc.y, { width: larghezza, align: 'center' });
    doc.fontSize(9).font('Helvetica').text(
      `Sede legale: ${SEDE_LEGALE}  ·  C.F. ${oppure(d.codice_fiscale)}`,
      { width: larghezza, align: 'center' }
    );
    doc.moveDown(1);
  }
  doc.fontSize(13).font('Helvetica-Bold').text(
    `VERBALE DI ASSEMBLEA ORDINARIA DEI SOCI N. ${d.numero_verbale || '____'}`,
    { width: larghezza, align: 'center' }
  );
  doc.moveDown(0.2);
  doc.fontSize(11).font('Helvetica').text(votazione.titolo, { width: larghezza, align: 'center' });
  doc.moveDown(0.8);
  riga();
  doc.moveDown(0.8);

  // Apertura
  const convocazione = `${d.convocazione} convocazione`;
  paragrafo(
    `Il giorno ${dataSeduta ? formattaData(dataSeduta) : VUOTO}, alle ore ${d.ora_inizio || '______'}, ` +
    `presso ${oppure(luogo)}, si è riunita in ${convocazione} l'Assemblea ordinaria dei soci ` +
    `dell'associazione «${DENOMINAZIONE}», convocata dal Presidente con avviso inviato ai soci il ` +
    `${formattaGiorno(d.data_convocazione) || VUOTO} tramite ${oppure(d.mezzo_convocazione)}, ` +
    'per discutere e deliberare sul seguente'
  );
  doc.font('Helvetica-Bold').text('ORDINE DEL GIORNO', sinistra, doc.y, { width: larghezza, align: 'center' });
  doc.moveDown(0.3);
  paragrafo(votazione.assemblea_ordine_del_giorno || `1) ${votazione.titolo}`, { align: 'left' });

  // Costituzione (art. 9.5 e 11)
  titolo('COSTITUZIONE DELL\'ASSEMBLEA');
  paragrafo(
    `Assume la presidenza dell'Assemblea, ai sensi dell'art. 11 dello Statuto, ${oppure(d.presidente)}, ` +
    `che chiama a fungere da segretario verbalizzante ${oppure(d.segretario)}, che accetta.`
  );
  paragrafo('Il Presidente constata e fa constatare che:', { align: 'left' });
  const costituzione = [
    'l\'Assemblea è stata regolarmente convocata;',
    `i soci aventi diritto al voto sono ${esito.aventi_diritto};`,
    conRegistro
      ? `sono presenti ${pr.presenti} soci: ${pr.in_sala} di persona, ${pr.collegati} collegati a distanza ` +
        `e ${pr.per_delega} rappresentati per delega scritta ai sensi dell'art. 9.3 dello Statuto;`
      : 'sono presenti, in proprio o per delega, n. ______ soci;',
    'i nominativi dei presenti e dei rappresentati sono riportati nel registro presenze allegato (Allegato A).',
  ];
  elenco(costituzione);

  if (d.convocazione === 'seconda') {
    paragrafo(
      'Trattandosi di seconda convocazione, l\'Assemblea è validamente costituita qualunque sia il numero ' +
      'dei presenti (art. 9.5 dello Statuto). Il Presidente la dichiara pertanto validamente costituita e ' +
      'atta a deliberare sull\'ordine del giorno.'
    );
  } else if (d.convocazione === 'prima' && pr && pr.quorum_raggiunto === true) {
    paragrafo(
      `Essendo presenti, in proprio o per delega, ${pr.presenti_in_regola} soci in regola su ${pr.in_regola}, ` +
      'e dunque almeno la metà richiesta in prima convocazione dall\'art. 9.5 dello Statuto, il Presidente ' +
      'dichiara l\'Assemblea validamente costituita e atta a deliberare sull\'ordine del giorno.'
    );
  } else if (d.convocazione === 'prima' && pr && pr.quorum_raggiunto === false) {
    paragrafo(
      `ATTENZIONE: risultano presenti, in proprio o per delega, ${pr.presenti_in_regola} soci in regola su ` +
      `${pr.in_regola}: non è raggiunta la metà richiesta in prima convocazione dall'art. 9.5 dello Statuto.`,
      { grassetto: true }
    );
  } else {
    paragrafo(
      'Il Presidente, verificato il quorum costitutivo previsto dall\'art. 9.5 dello Statuto, dichiara ' +
      'l\'Assemblea validamente costituita e atta a deliberare sull\'ordine del giorno.'
    );
  }

  // Delibere preliminari (art. 10.1 e modalita' di voto)
  titolo('DELIBERE PRELIMINARI');
  const componenti = d.componenti_consiglio ? `n. ${d.componenti_consiglio}` : 'n. ____';
  paragrafo(
    d.rinnovo_parziale
      ? `1. Composizione del Consiglio direttivo. L'Assemblea conferma in ${componenti} il numero dei ` +
        'componenti del Consiglio direttivo (art. 10.1 dello Statuto) e procede al rinnovo parziale di ' +
        `${esito.seggi_da_eleggere} componenti.`
      : '1. Composizione del Consiglio direttivo. Ai sensi dell\'art. 10.1 dello Statuto, l\'Assemblea ' +
        `determina in ${componenti} il numero dei componenti del Consiglio direttivo.`
  );
  const approvazione = {
    unanimita: 'L\'Assemblea approva all\'unanimità dei presenti.',
    maggioranza: 'L\'Assemblea approva a maggioranza dei presenti.',
  }[d.approvazione_voto_app] || `L'Assemblea approva ${VUOTO}.`;
  paragrafo(
    '2. Modalità di votazione. Il Presidente propone che l\'elezione si svolga a scrutinio segreto tramite ' +
    'l\'applicazione gestionale dell\'associazione (' + (process.env.APP_URL || 'app web') + '), accessibile a ciascun socio con ' +
    'credenziali personali. Il sistema registra la partecipazione al voto separatamente dal contenuto della ' +
    'scheda, così che non sia possibile risalire al voto espresso da ciascuno, e non consente di esprimere ' +
    `voti nulli. Ogni socio può esprimere fino a ${votazione.preferenze_max} preferenze; risultano eletti ` +
    'i candidati che riportano il maggior numero di preferenze; in caso di parità per l\'ultimo seggio ' +
    `decide l'Assemblea. ${approvazione}`
  );
  if (scrutatori.length > 0) {
    paragrafo(`3. Scrutatori. Sono nominati scrutatori: ${scrutatori.join(', ')}.`);
  }

  // Candidature
  titolo('CANDIDATURE');
  const candidati = [...esito.risultati].sort((a, b) =>
    `${a.cognome} ${a.nome}`.localeCompare(`${b.cognome} ${b.nome}`, 'it'));
  paragrafo(
    'Il Presidente comunica che si sono candidati alla carica di componente del Consiglio direttivo i seguenti soci:',
    { align: 'left' }
  );
  elenco(candidati.map((c) => `${c.cognome} ${c.nome}`));

  // Operazioni di voto e scrutinio
  titolo('OPERAZIONI DI VOTO E SCRUTINIO');
  paragrafo(
    `Le urne elettroniche sono state aperte il ${formattaDataOra(votazione.aperta_at)} ` +
    `e chiuse il ${formattaDataOra(votazione.chiusa_at)}. A urne chiuse si procede allo scrutinio, ` +
    'che dà il seguente esito:'
  );
  elenco([
    `Aventi diritto al voto: ${esito.aventi_diritto}`,
    `Votanti: ${esito.votanti}  (affluenza ${esito.affluenza_percentuale}%)`,
    `Non votanti: ${esito.non_votanti}`,
    `Schede valide: ${esito.schede_valide}`,
    `Schede bianche: ${esito.schede_bianche}`,
    'Schede nulle: 0 (non consentite dal sistema di voto elettronico)',
    `Preferenze complessivamente espresse: ${esito.preferenze_espresse}`,
  ]);

  const colonne = [
    { label: '#', x: sinistra, w: 28 },
    { label: 'Candidato', x: sinistra + 28, w: 230 },
    { label: 'Voti', x: sinistra + 258, w: 50 },
    { label: '% votanti', x: sinistra + 308, w: 70 },
    { label: 'Esito', x: sinistra + 378, w: 105 },
  ];
  spazio(60);
  const intestazioneY = doc.y;
  doc.fontSize(9).font('Helvetica-Bold');
  colonne.forEach((c) => doc.text(c.label, c.x, intestazioneY, { width: c.w }));
  doc.moveDown(0.3);
  riga();
  doc.moveDown(0.4);

  doc.fontSize(9).font('Helvetica');
  esito.risultati.forEach((r) => {
    spazio(20);
    const y = doc.y;
    let esitoTesto = 'non eletto';
    if (r.eletto) esitoTesto = 'ELETTO';
    else if (r.ballottaggio) esitoTesto = 'ballottaggio';

    doc.font(r.eletto ? 'Helvetica-Bold' : 'Helvetica');
    doc.text(String(r.posizione), colonne[0].x, y, { width: colonne[0].w });
    doc.text(`${r.cognome} ${r.nome}`, colonne[1].x, y, { width: colonne[1].w });
    doc.text(String(r.voti), colonne[2].x, y, { width: colonne[2].w });
    doc.text(`${r.percentuale_votanti}%`, colonne[3].x, y, { width: colonne[3].w });
    doc.text(esitoTesto, colonne[4].x, y, { width: colonne[4].w });
    doc.moveDown(0.5);
  });
  doc.moveDown(0.3);
  riga();

  // Proclamazione
  titolo('PROCLAMAZIONE DEGLI ELETTI');
  if (esito.eletti.length === 0) {
    paragrafo('Nessun candidato ha riportato preferenze: nessun eletto.');
  } else {
    paragrafo(
      'Al termine dello scrutinio il Presidente proclama l\'esito della votazione. L\'Assemblea ELEGGE ' +
      `componenti del Consiglio direttivo i soci (${esito.eletti.length} su ${esito.seggi_da_eleggere} da eleggere):`,
      { align: 'left' }
    );
    elenco(esito.eletti.map((c) => `${c.cognome} ${c.nome} — ${c.voti} preferenze`), { grassetto: true });
    paragrafo(
      d.rinnovo_parziale
        ? 'Trattandosi di rinnovo parziale, gli eletti restano in carica fino alla scadenza del mandato del ' +
          `Consiglio direttivo in carica${d.scadenza_mandato ? `, prevista per ${d.scadenza_mandato}` : ''} ` +
          '(art. 8.5 dello Statuto).'
        : 'Gli eletti restano in carica per la durata di tre anni (art. 8.4 dello Statuto). Ai sensi dell\'art. 11 ' +
          'dello Statuto, il Presidente e il Vicepresidente saranno eletti dal Consiglio direttivo nella sua prima seduta.'
    );
  }

  if (esito.ballottaggio_necessario) {
    paragrafo('BALLOTTAGGIO NECESSARIO', { grassetto: true, align: 'left' });
    paragrafo(
      `Per ${esito.seggi_al_ballottaggio} seggio/i residuo/i si registra parità di preferenze fra i seguenti ` +
      'candidati, che non consente la proclamazione automatica:'
    );
    elenco(esito.candidati_ballottaggio.map((c) => `${c.cognome} ${c.nome} — ${c.voti} preferenze`));
    paragrafo('Si rimette all\'Assemblea la decisione sulle modalità di assegnazione dei seggi residui.');
  }

  if (esito.seggi_scoperti > 0) {
    paragrafo(
      `Restano scoperti ${esito.seggi_scoperti} seggio/i per assenza di candidati che abbiano riportato preferenze.`,
      { grassetto: true }
    );
  }

  if (d.note) {
    titolo('VARIE ED EVENTUALI');
    paragrafo(d.note);
  }

  // Chiusura e firme (art. 17)
  titolo('CHIUSURA');
  paragrafo(
    'Null\'altro essendovi da deliberare, il Presidente dichiara sciolta l\'Assemblea alle ore ' +
    `${d.ora_chiusura || '______'}, previa lettura e approvazione del presente verbale, che sarà trascritto ` +
    'nel libro delle adunanze e delle deliberazioni dell\'Assemblea (art. 17 dello Statuto).'
  );
  const vociAllegati = ['registro presenze'];
  if (conRegistro && pr.per_delega > 0) vociAllegati.push(`deleghe scritte e firmate (n. ${pr.per_delega})`);
  allegati.forEach((a) => vociAllegati.push(a.titolo));
  paragrafo(`Allegati: ${elencoAllegati(vociAllegati)}.`, { align: 'left' });

  const firme = [['Il Presidente', d.presidente], ['Il Segretario verbalizzante', d.segretario],
    ...scrutatori.map((s) => ['Lo scrutatore', s])];
  doc.moveDown(0.6);
  for (let i = 0; i < firme.length; i += 2) {
    spazio(75);
    const y = doc.y;
    firma(sinistra, y, ...firme[i]);
    if (firme[i + 1]) firma(sinistra + 260, y, ...firme[i + 1]);
    doc.x = sinistra;
    doc.y = y + 70;
  }

  doc.moveDown(0.5);
  doc.fontSize(7).fillColor('#666666');
  doc.text(
    `Documento generato dal sistema gestionale ${DENOMINAZIONE}. ` +
    `Impronta SHA-256 dei dati di scrutinio: ${hash}`,
    sinistra, doc.y, { width: larghezza }
  );
  doc.fillColor('#000000');

  // Allegato A: registro presenze
  doc.addPage();
  doc.fontSize(12).font('Helvetica-Bold').text('ALLEGATO A – REGISTRO PRESENZE', sinistra, doc.y, { width: larghezza, align: 'center' });
  doc.fontSize(9).font('Helvetica').text(
    `${DENOMINAZIONE} · Assemblea ordinaria del ${dataSeduta ? formattaData(dataSeduta) : VUOTO}` +
      ` · ${oppure(luogo)}`,
    { width: larghezza, align: 'center' }
  );
  doc.text(votazione.titolo, { width: larghezza, align: 'center' });
  doc.moveDown(0.8);

  // Niente quota ne' firma: il registro attesta presenza e partecipazione al
  // voto, lo stato dei pagamenti resta fuori dal verbale.
  const col = [
    { label: '#', w: 28 },
    { label: 'Cognome e nome', w: 240 },
    { label: 'Presenza', w: 150 },
    { label: 'Ha votato', w: larghezza - 418 },
  ];
  const disegnaRiga = (celle, grassetto) => {
    doc.fontSize(8).font(grassetto ? 'Helvetica-Bold' : 'Helvetica');
    const h = Math.max(
      18,
      ...celle.map((t, i) => doc.heightOfString(String(t), { width: col[i].w - 6 }) + 8)
    );
    if (doc.y + h > fondo()) doc.addPage();
    const y = doc.y;
    let x = sinistra;
    celle.forEach((t, i) => {
      doc.rect(x, y, col[i].w, h).stroke();
      doc.text(String(t), x + 3, y + 4, { width: col[i].w - 6 });
      x += col[i].w;
    });
    doc.x = sinistra;
    doc.y = y + h;
  };

  disegnaRiga(col.map((c) => c.label), true);
  if (registro.length === 0) {
    // Nessun registro disponibile: righe vuote da compilare a mano, come nei fac-simile.
    for (let i = 1; i <= esito.aventi_diritto; i += 1) disegnaRiga([i, '', '', ''], false);
  } else {
    registro.forEach((r, i) => {
      disegnaRiga([
        i + 1,
        `${r.cognome} ${r.nome}`,
        etichettaPresenza(r),
        r.ha_votato ? 'sì' : 'no',
      ], false);
    });
  }

  doc.moveDown(0.8);
  doc.fontSize(9).font('Helvetica');
  if (pr) {
    doc.text(
      `Aventi diritto: ${pr.aventi_diritto} · ` +
      (pr.registrato
        ? `presenti: ${pr.presenti} (di persona ${pr.in_sala}, a distanza ${pr.collegati}, per delega ${pr.per_delega}) · `
        : 'presenze non registrate nel sistema · ') +
      `votanti: ${pr.votanti}`,
      sinistra, doc.y, { width: larghezza }
    );
    doc.moveDown(0.4);
  }
  doc.fontSize(8).fillColor('#666666').text(
    'La colonna «Ha votato» attesta la sola partecipazione al voto, registrata dal sistema: il contenuto delle ' +
    'schede è conservato separatamente e non è riconducibile ai singoli elettori. Le deleghe scritte e ' +
    'firmate sono conservate agli atti dell\'associazione.',
    sinistra, doc.y, { width: larghezza }
  );
  doc.fillColor('#000000');

  doc.end();
  return hash;
}

module.exports = {
  generaVerbalePdf,
  calcolaHashScrutinio,
  formattaDataOra,
  formattaData,
  formattaGiorno,
  elencoAllegati,
  parti,
  DENOMINAZIONE,
  SEDE_LEGALE,
  VUOTO,
};
