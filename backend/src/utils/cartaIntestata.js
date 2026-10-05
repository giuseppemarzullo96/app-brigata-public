const fs = require('fs');
const path = require('path');

/**
 * Carta intestata dei PDF (verbali e convocazioni): intestazione e piè di
 * pagina scritti dall'admin in un HTML semplice, disegnati su ogni pagina.
 *
 * I PDF li disegna PDFKit, che non interpreta HTML: qui c'e' un lettore
 * ridotto ai tag che servono a una carta intestata. Tutto il resto viene
 * ignorato, testo compreso fra tag sconosciuti.
 *
 *   <p align="left|center|right" size="9" color="#666">…</p>   paragrafo
 *   <b> <strong> <i> <em> <u>                                  stile del testo
 *   <span size="…" color="…">                                  dimensione/colore
 *   <br>                                                       a capo
 *   <hr>                                                       linea orizzontale
 *   <img src="logo" height="50" align="center">                il logo caricato
 *   <table align="center"><tr><td width="90">…</td><td>…</td></tr></table>
 *                                                              elementi affiancati (una riga)
 *   {pagina}                                                   numero di pagina
 *
 * Al posto degli attributi si puo' usare style="text-align:…; font-size:…px;
 * color:…", come nei comuni editor.
 */

const TAG_PARAGRAFO = new Set(['p', 'div', 'h1', 'h2', 'h3']);
const DIMENSIONI_TITOLO = { h1: 16, h2: 13, h3: 11 };
const ENTITA = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', egrave: 'è', eacute: 'é', agrave: 'à',
  igrave: 'ì', ograve: 'ò', ugrave: 'ù', Egrave: 'È', Agrave: 'À', middot: '·', ndash: '–', mdash: '—',
  laquo: '«', raquo: '»', euro: '€', copy: '©', deg: '°',
};

function decodifica(testo) {
  return testo
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, nome) => (ENTITA[nome] !== undefined ? ENTITA[nome] : m));
}

function leggiAttributi(grezzi) {
  const attr = {};
  (grezzi || '').replace(/([a-z-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi, (_, nome, __, a, b, c) => {
    attr[nome.toLowerCase()] = a ?? b ?? c ?? '';
    return '';
  });
  // style="text-align:center; font-size:10px; color:#333"
  (attr.style || '').split(';').forEach((regola) => {
    const [k, v] = regola.split(':').map((x) => (x || '').trim().toLowerCase());
    if (k === 'text-align' && v) attr.align = v;
    if (k === 'font-size' && v) attr.size = v;
    if (k === 'color' && v) attr.color = v;
    if (k === 'height' && v) attr.height = v;
  });
  return attr;
}

const numero = (v, min, max) => {
  const n = parseFloat(String(v || ''));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
};
const allineamento = (v) => (['left', 'center', 'right', 'justify'].includes(v) ? v : null);
const colore = (v) => (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v || '') || /^[a-z]+$/i.test(v || '') ? v : null);

/**
 * Trasforma l'HTML in blocchi da disegnare:
 *   { tipo: 'p', align, size, color, frammenti: [{ testo, grassetto, corsivo, sottolineato, size, color }] }
 *   { tipo: 'img', align, height }
 *   { tipo: 'hr' }
 *   { tipo: 'riga', align, celle: [{ width, valign, blocchi }] }
 */
function leggiHtml(html) {
  const blocchi = [];
  // Dentro una cella di tabella i blocchi finiscono nella cella.
  let cella = null;
  let riga = null;
  const destinazione = () => (cella ? cella.blocchi : blocchi);
  let allineamentoTabella = null;
  const stile = [{ grassetto: false, corsivo: false, sottolineato: false, size: null, color: null }];
  let paragrafo = null;
  let ignora = 0; // dentro <script>, <style>, <head>

  const apriParagrafo = (attr = {}, tag = 'p') => {
    paragrafo = {
      tipo: 'p',
      align: allineamento(attr.align) || 'left',
      size: numero(attr.size, 5, 30) || DIMENSIONI_TITOLO[tag] || null,
      color: colore(attr.color),
      grassetto: Boolean(DIMENSIONI_TITOLO[tag]),
      frammenti: [],
    };
    destinazione().push(paragrafo);
  };
  const chiudiParagrafo = () => { paragrafo = null; };
  const aggiungiTesto = (testo) => {
    if (!paragrafo) apriParagrafo();
    const s = stile[stile.length - 1];
    paragrafo.frammenti.push({
      testo,
      grassetto: s.grassetto || paragrafo.grassetto,
      corsivo: s.corsivo,
      sottolineato: s.sottolineato,
      size: s.size,
      color: s.color,
    });
  };

  const regex = /<\/?([a-z0-9]+)([^>]*)>|([^<]+)/gi;
  let m = regex.exec(String(html || ''));
  while (m !== null) {
    const [intero, tagGrezzo, attrGrezzi, testoGrezzo] = m;
    if (testoGrezzo !== undefined) {
      if (!ignora) {
        // Gli a capo dell'HTML valgono come spazi, come nel browser.
        const testo = decodifica(testoGrezzo.replace(/\s+/g, ' '));
        if (testo.trim() || (paragrafo && paragrafo.frammenti.length)) aggiungiTesto(testo);
      }
    } else {
      const tag = tagGrezzo.toLowerCase();
      const chiusura = intero.startsWith('</');
      const attr = leggiAttributi(attrGrezzi);
      if (['script', 'style', 'head', 'title'].includes(tag)) {
        ignora += chiusura ? -1 : 1;
      } else if (ignora) {
        // niente
      } else if (tag === 'table') {
        chiudiParagrafo();
        allineamentoTabella = chiusura ? null : allineamento(attr.align);
        if (chiusura) { riga = null; cella = null; }
      } else if (tag === 'tr') {
        chiudiParagrafo();
        cella = null;
        if (chiusura) {
          riga = null;
        } else {
          riga = { tipo: 'riga', align: allineamento(attr.align) || allineamentoTabella || 'center', celle: [] };
          blocchi.push(riga);
        }
      } else if (tag === 'td' || tag === 'th') {
        chiudiParagrafo();
        if (chiusura) {
          cella = null;
        } else {
          if (!riga) {
            riga = { tipo: 'riga', align: allineamentoTabella || 'center', celle: [] };
            blocchi.push(riga);
          }
          cella = {
            width: numero(attr.width, 10, 600),
            valign: ['top', 'middle', 'bottom'].includes(attr.valign) ? attr.valign : 'middle',
            blocchi: [],
          };
          riga.celle.push(cella);
        }
      } else if (TAG_PARAGRAFO.has(tag)) {
        if (chiusura) chiudiParagrafo();
        else apriParagrafo(attr, tag);
      } else if (tag === 'br') {
        aggiungiTesto('\n');
      } else if (tag === 'hr') {
        chiudiParagrafo();
        destinazione().push({ tipo: 'hr' });
      } else if (tag === 'img' && !chiusura) {
        const ereditato = paragrafo ? paragrafo.align : null;
        chiudiParagrafo();
        destinazione().push({
          tipo: 'img',
          align: allineamento(attr.align) || ereditato || 'center',
          height: numero(attr.height, 10, 150) || 40,
        });
      } else if (['b', 'strong', 'i', 'em', 'u', 'span', 'font'].includes(tag)) {
        if (chiusura) {
          if (stile.length > 1) stile.pop();
        } else {
          const s = { ...stile[stile.length - 1] };
          if (tag === 'b' || tag === 'strong') s.grassetto = true;
          if (tag === 'i' || tag === 'em') s.corsivo = true;
          if (tag === 'u') s.sottolineato = true;
          s.size = numero(attr.size, 5, 30) || s.size;
          s.color = colore(attr.color) || s.color;
          stile.push(s);
        }
      }
    }
    m = regex.exec(String(html || ''));
  }

  return pulisci(blocchi);
}

/** Via i paragrafi vuoti e gli spazi ai bordi di ogni riga, anche nelle celle. */
function pulisci(blocchi) {
  return blocchi.filter((b) => {
    if (b.tipo === 'riga') return b.celle.length > 0;
    if (b.tipo !== 'p') return true;
    const unito = b.frammenti.map((f) => f.testo).join('');
    return unito.trim() !== '';
  }).map((b) => {
    if (b.tipo === 'riga') return { ...b, celle: b.celle.map((c) => ({ ...c, blocchi: pulisci(c.blocchi) })) };
    if (b.tipo !== 'p') return b;
    const frammenti = b.frammenti.map((f) => ({ ...f }));
    frammenti[0].testo = frammenti[0].testo.replace(/^ +/, '');
    frammenti[frammenti.length - 1].testo = frammenti[frammenti.length - 1].testo.replace(/ +$/, '');
    return { ...b, frammenti: frammenti.map((f) => ({ ...f, testo: f.testo.replace(/ ?\n ?/g, '\n') })) };
  });
}

const DIMENSIONE_BASE = 9;
const font = (f) => {
  if (f.grassetto && f.corsivo) return 'Helvetica-BoldOblique';
  if (f.grassetto) return 'Helvetica-Bold';
  if (f.corsivo) return 'Helvetica-Oblique';
  return 'Helvetica';
};

/**
 * Un paragrafo diviso nelle sue righe (gli a capo di <br>): ogni riga si
 * disegna a parte, perche' PDFKit sovrappone le righe quando in un testo
 * continuo si mescolano dimensioni diverse e a capo.
 */
function righe(b) {
  const out = [[]];
  b.frammenti.forEach((f) => {
    f.testo.split('\n').forEach((pezzo, i) => {
      if (i > 0) out.push([]);
      if (pezzo) out[out.length - 1].push({ ...f, testo: pezzo });
    });
  });
  return out;
}

const dimensione = (f, b) => f.size || b.size || DIMENSIONE_BASE;

/** Altezza di una riga: quella del suo frammento piu' grande. */
function altezzaRiga(doc, riga, b, larghezza) {
  if (!riga.length) {
    doc.font('Helvetica').fontSize(b.size || DIMENSIONE_BASE);
    return doc.currentLineHeight(true);
  }
  const grande = riga.reduce((m, f) => (dimensione(f, b) > dimensione(m, b) ? f : m), riga[0]);
  doc.font(font(grande)).fontSize(dimensione(grande, b));
  return doc.heightOfString(riga.map((f) => f.testo).join(''), { width: larghezza });
}

/**
 * Larghezze delle celle di una riga: quelle indicate con width, il resto dello
 * spazio diviso fra le celle senza. Se il totale supera lo spazio, si riduce.
 */
function larghezzeCelle(riga, larghezza) {
  const fisse = riga.celle.reduce((t, c) => t + (c.width || 0), 0);
  const libere = riga.celle.filter((c) => !c.width).length;
  const resto = libere ? Math.max(0, larghezza - fisse) / libere : 0;
  const larghezze = riga.celle.map((c) => c.width || resto);
  const totale = larghezze.reduce((t, w) => t + w, 0);
  return totale > larghezza ? larghezze.map((w) => (w * larghezza) / totale) : larghezze;
}

/** Altezza che occuperanno i blocchi alla larghezza data. */
function misura(doc, blocchi, larghezza) {
  let h = 0;
  for (const b of blocchi) {
    if (b.tipo === 'riga') {
      const larghezze = larghezzeCelle(b, larghezza);
      h += Math.max(...b.celle.map((c, i) => misura(doc, c.blocchi, larghezze[i]))) + 2;
    } else if (b.tipo === 'img') h += b.height + 4;
    else if (b.tipo === 'hr') h += 8;
    else h += righe(b).reduce((t, r) => t + altezzaRiga(doc, r, b, larghezza), 0) + 2;
  }
  return h;
}

/** Disegna i blocchi a partire da (x, y). */
function disegna(doc, blocchi, { x, y, larghezza, logo, pagina }) {
  doc.x = x;
  doc.y = y;
  for (const b of blocchi) {
    if (b.tipo === 'riga') {
      const larghezze = larghezzeCelle(b, larghezza);
      const totale = larghezze.reduce((t, w) => t + w, 0);
      const altezze = b.celle.map((c, i) => misura(doc, c.blocchi, larghezze[i]));
      const hRiga = Math.max(...altezze);
      const inizio = doc.y;
      let xc = x;
      if (b.align === 'center') xc = x + (larghezza - totale) / 2;
      if (b.align === 'right') xc = x + larghezza - totale;
      b.celle.forEach((c, i) => {
        let yc = inizio;
        if (c.valign === 'middle') yc = inizio + (hRiga - altezze[i]) / 2;
        if (c.valign === 'bottom') yc = inizio + hRiga - altezze[i];
        disegna(doc, c.blocchi, { x: xc, y: yc, larghezza: larghezze[i], logo, pagina });
        xc += larghezze[i];
      });
      doc.x = x;
      doc.y = inizio + hRiga + 2;
      continue;
    }
    if (b.tipo === 'img') {
      if (logo) {
        try {
          const img = doc.openImage(logo);
          const w = (img.width / img.height) * b.height;
          let xi = x;
          if (b.align === 'center') xi = x + (larghezza - w) / 2;
          if (b.align === 'right') xi = x + larghezza - w;
          doc.image(img, xi, doc.y, { height: b.height });
        } catch (e) {
          // Logo illeggibile: si lascia lo spazio vuoto invece di bloccare il PDF.
        }
      }
      doc.y += b.height + 4;
    } else if (b.tipo === 'hr') {
      doc.moveTo(x, doc.y + 3).lineTo(x + larghezza, doc.y + 3).lineWidth(0.5).stroke().lineWidth(1);
      doc.y += 8;
    } else {
      righe(b).forEach((riga) => {
        const inizio = doc.y;
        const h = altezzaRiga(doc, riga, b, larghezza);
        const pezzi = riga.map((f) => ({ ...f, testo: f.testo.replace(/\{pagina\}/g, String(pagina)) }));
        const imposta = (f) => doc.font(font(f)).fontSize(dimensione(f, b)).fillColor(f.color || b.color || '#000000');
        const larghezze = pezzi.map((f) => imposta(f).widthOfString(f.testo));
        const totale = larghezze.reduce((t, w) => t + w, 0);

        if (pezzi.length > 1 && totale <= larghezza) {
          // Piu' stili sulla stessa riga: ogni pezzo al suo posto, calcolato
          // qui. Il testo "continued" di PDFKit li centra male e li sovrappone.
          let xi = x;
          if (b.align === 'center') xi = x + (larghezza - totale) / 2;
          if (b.align === 'right') xi = x + larghezza - totale;
          pezzi.forEach((f, i) => {
            imposta(f);
            // Allineati in basso, cosi' dimensioni diverse stanno sulla stessa riga.
            const y = inizio + (h - doc.currentLineHeight(true));
            doc.text(f.testo, xi, y, { lineBreak: false, underline: f.sottolineato });
            xi += larghezze[i];
          });
        } else if (pezzi.length) {
          // Un solo stile, o riga troppo lunga: va a capo da sola.
          const f = pezzi.reduce((m, p) => (dimensione(p, b) > dimensione(m, b) ? p : m), pezzi[0]);
          imposta(f);
          doc.text(pezzi.map((p) => p.testo).join(''), x, inizio, {
            width: larghezza, align: b.align, underline: f.sottolineato,
          });
        }
        doc.x = x;
        doc.y = inizio + h;
      });
      doc.y += 2;
    }
  }
  doc.fillColor('#000000').font('Helvetica');
}

/**
 * Applica la carta intestata a un documento appena creato: allarga i margini
 * quanto serve e disegna intestazione e piè di pagina su ogni pagina, anche
 * su quelle aggiunte dopo.
 *
 * @param {PDFDocument} doc
 * @param {{ intestazione: Array, piepagina: Array, logo: Buffer|null }} carta
 * @returns {boolean} true se l'intestazione sostituisce quella predefinita
 */
function applicaCartaIntestata(doc, carta) {
  if (!carta || (!carta.intestazione.length && !carta.piepagina.length)) return false;

  const bordo = 28;
  const x = doc.page.margins.left;
  const larghezza = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const hTesta = carta.intestazione.length ? misura(doc, carta.intestazione, larghezza) : 0;
  const hPiede = carta.piepagina.length ? misura(doc, carta.piepagina, larghezza) : 0;
  const margineAlto = carta.intestazione.length ? bordo + hTesta + 16 : doc.page.margins.top;
  const margineBasso = carta.piepagina.length ? bordo + hPiede + 12 : doc.page.margins.bottom;
  let pagina = 0;

  const decora = () => {
    pagina += 1;
    const salvaX = doc.x;
    // Si disegna fuori dall'area del testo: senza azzerare il margine basso,
    // scrivere il piè di pagina aggiungerebbe una pagina nuova.
    const margini = { ...doc.page.margins };
    doc.page.margins.bottom = 0;
    if (carta.intestazione.length) {
      disegna(doc, carta.intestazione, { x, y: bordo, larghezza, logo: carta.logo, pagina });
    }
    if (carta.piepagina.length) {
      disegna(doc, carta.piepagina, { x, y: doc.page.height - bordo - hPiede, larghezza, logo: carta.logo, pagina });
    }
    doc.page.margins = { ...margini, top: margineAlto, bottom: margineBasso };
    doc.x = salvaX;
    doc.y = margineAlto;
  };

  doc.on('pageAdded', decora);
  decora();
  return carta.intestazione.length > 0;
}

/**
 * Legge dalle impostazioni la carta intestata pronta per i generatori.
 * Ritorna null se non e' configurata.
 */
async function caricaCartaIntestata() {
  // Import qui: impostazioni.js dipende dal database, i test unitari no.
  const { getImpostazione } = require('./impostazioni');
  const [intestazione, piepagina, percorsoLogo] = await Promise.all([
    getImpostazione('carta_intestata_intestazione'),
    getImpostazione('carta_intestata_piepagina'),
    getImpostazione('carta_intestata_logo'),
  ]);
  return costruisciCarta({ intestazione, piepagina, percorsoLogo });
}

function percorsoLocaleLogo(percorsoLogo) {
  if (!percorsoLogo) return null;
  const base = path.resolve(process.env.UPLOAD_PATH || './uploads');
  const percorso = path.resolve(base, String(percorsoLogo).replace(/^\/uploads\//, ''));
  return percorso.startsWith(base + path.sep) && fs.existsSync(percorso) ? percorso : null;
}

function costruisciCarta({ intestazione, piepagina, percorsoLogo }) {
  const carta = {
    intestazione: leggiHtml(intestazione),
    piepagina: leggiHtml(piepagina),
    logo: null,
  };
  if (!carta.intestazione.length && !carta.piepagina.length) return null;
  const locale = percorsoLocaleLogo(percorsoLogo);
  if (locale) carta.logo = fs.readFileSync(locale);
  return carta;
}

module.exports = {
  leggiHtml,
  applicaCartaIntestata,
  caricaCartaIntestata,
  costruisciCarta,
  percorsoLocaleLogo,
};
