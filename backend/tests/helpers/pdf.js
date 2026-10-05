const zlib = require('zlib');

/**
 * Estrattore di testo minimale per i PDF generati da PDFKit.
 *
 * PDFKit scrive le stringhe come array di frammenti esadecimali intervallati da
 * valori di crenatura, per esempio:
 *   [<56455242> 30 <414c45> 0] TJ
 * Per verificare il contenuto del verbale basta concatenare i frammenti di ogni
 * operatore TJ/Tj, senza bisogno di una libreria di parsing completa.
 *
 * Funziona solo su PDF non compressi: generare il documento con
 * { compress: false }.
 */

function decodificaHex(hex) {
  const pulito = hex.replace(/\s+/g, '');
  let out = '';
  for (let i = 0; i + 1 < pulito.length; i += 2) {
    out += String.fromCharCode(parseInt(pulito.substr(i, 2), 16));
  }
  return out;
}

/**
 * I PDF di produzione hanno gli stream compressi con Flate. Qui vengono
 * decompressi e riaccodati al contenuto, cosi' l'estrazione funziona sia sul
 * PDF generato dall'API sia su quello non compresso usato nei test unitari.
 */
function espandiStream(contenuto) {
  const pezzi = [contenuto];
  const regex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m = regex.exec(contenuto);
  while (m !== null) {
    try {
      pezzi.push(zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'));
    } catch (e) {
      // Stream non compresso o non Flate: gia' presente nel contenuto originale.
    }
    m = regex.exec(contenuto);
  }
  return pezzi.join('\n');
}

function estraiTesto(buffer) {
  const grezzo = Buffer.isBuffer(buffer) ? buffer.toString('latin1') : String(buffer);
  const contenuto = espandiStream(grezzo);
  const righe = [];

  // Forma con array di frammenti: [ <hex> kern <hex> ] TJ
  const regexArray = /\[((?:\s*(?:<[0-9A-Fa-f\s]*>|\((?:\\.|[^)\\])*\)|-?[\d.]+))*)\s*\]\s*TJ/g;
  let m = regexArray.exec(contenuto);
  while (m !== null) {
    const frammenti = m[1].match(/<[0-9A-Fa-f\s]*>|\((?:\\.|[^)\\])*\)/g) || [];
    righe.push(
      frammenti
        .map((f) =>
          f.startsWith('<')
            ? decodificaHex(f.slice(1, -1))
            : f.slice(1, -1).replace(/\\([()\\])/g, '$1')
        )
        .join('')
    );
    m = regexArray.exec(contenuto);
  }

  // Forma semplice: (testo) Tj oppure <hex> Tj
  const regexSingola = /(?:\((?:\\.|[^)\\])*\)|<[0-9A-Fa-f\s]*>)\s*Tj/g;
  let s = regexSingola.exec(contenuto);
  while (s !== null) {
    const token = s[0].replace(/\s*Tj$/, '');
    righe.push(
      token.startsWith('<')
        ? decodificaHex(token.slice(1, -1))
        : token.slice(1, -1).replace(/\\([()\\])/g, '$1')
    );
    s = regexSingola.exec(contenuto);
  }

  return righe.join('\n');
}

/**
 * Come estraiTesto, ma con gli spazi normalizzati: PDFKit manda a capo il testo
 * dentro la colonna, quindi una frase come "BALLOTTAGGIO NECESSARIO" puo'
 * trovarsi spezzata su due righe. Per verificare i contenuti serve la versione
 * appiattita.
 */
function estraiTestoNormalizzato(buffer) {
  return estraiTesto(buffer).replace(/\s+/g, ' ').trim();
}

module.exports = { estraiTesto, estraiTestoNormalizzato, decodificaHex };
