const fs = require('fs');
const PDFDocument = require('pdfkit');
const logger = require('../utils/logger');
const { getImpostazione, setImpostazione } = require('../utils/impostazioni');
const { costruisciCarta, applicaCartaIntestata, percorsoLocaleLogo } = require('../utils/cartaIntestata');

/**
 * Carta intestata di verbali e convocazioni: logo e anteprima.
 * L'HTML di intestazione e piè di pagina si salva con le altre impostazioni
 * (PUT /impostazioni/carta_intestata_intestazione e _piepagina).
 */

/** POST /api/v1/impostazioni/carta-intestata/logo (solo admin) — multipart: logo_carta */
const caricaLogo = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Immagine obbligatoria' });
    // Il file deve essere un'immagine che PDFKit sa leggere: meglio scoprirlo ora
    // che alla prima generazione di un verbale.
    try {
      new PDFDocument().openImage(fs.readFileSync(req.file.path));
    } catch (e) {
      fs.rm(req.file.path, { force: true }, () => {});
      return res.status(400).json({ error: 'Immagine non leggibile: usa un PNG o un JPEG' });
    }
    const precedente = percorsoLocaleLogo(await getImpostazione('carta_intestata_logo'));
    const percorso = `/uploads/carta-intestata/${req.file.filename}`;
    await setImpostazione('carta_intestata_logo', percorso, req.user.id);
    if (precedente) fs.rm(precedente, { force: true }, () => {});
    res.json({ message: 'Logo caricato', percorso });
  } catch (error) {
    logger.error('Errore caricamento logo carta intestata:', error);
    res.status(500).json({ error: 'Errore durante il caricamento del logo' });
  }
};

/** GET /api/v1/impostazioni/carta-intestata/logo — l'immagine, per l'anteprima nella pagina */
const scaricaLogo = async (req, res) => {
  try {
    const percorso = percorsoLocaleLogo(await getImpostazione('carta_intestata_logo'));
    if (!percorso) return res.status(404).json({ error: 'Nessun logo caricato' });
    res.sendFile(percorso);
  } catch (error) {
    logger.error('Errore lettura logo carta intestata:', error);
    res.status(500).json({ error: 'Errore durante la lettura del logo' });
  }
};

/**
 * POST /api/v1/impostazioni/carta-intestata/anteprima (solo admin)
 * Body: { intestazione, piepagina } — anche non ancora salvati.
 * Due pagine di prova, per vedere l'intestazione ripetersi e il numero di pagina.
 */
const anteprima = async (req, res) => {
  try {
    const carta = costruisciCarta({
      intestazione: String(req.body?.intestazione ?? '').slice(0, 5000),
      piepagina: String(req.body?.piepagina ?? '').slice(0, 5000),
      percorsoLogo: await getImpostazione('carta_intestata_logo'),
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="anteprima-carta-intestata.pdf"');

    const doc = new PDFDocument({ size: 'A4', margin: 56 });
    doc.pipe(res);
    applicaCartaIntestata(doc, carta);
    const larghezza = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    doc.fontSize(13).font('Helvetica-Bold').text('ANTEPRIMA DELLA CARTA INTESTATA', { width: larghezza, align: 'center' });
    doc.moveDown(1);
    const prova = 'Questo è un testo di prova per vedere come la carta intestata incornicia i verbali e le ' +
      'convocazioni. Intestazione e piè di pagina si ripetono su ogni pagina; il segnaposto {pagina} ' +
      'diventa il numero della pagina. ';
    doc.fontSize(10.5).font('Helvetica');
    for (let i = 0; i < 14; i += 1) {
      doc.text(prova.repeat(3), { width: larghezza, align: 'justify' });
      doc.moveDown(0.6);
    }
    doc.end();
  } catch (error) {
    logger.error('Errore anteprima carta intestata:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Errore durante la generazione dell\'anteprima' });
  }
};

module.exports = { caricaLogo, scaricaLogo, anteprima };
