const path = require('path');

/**
 * Tipi di allegato ammessi nei messaggi, e cartella in cui finiscono.
 *
 * Questa tabella sta in un posto solo perche' prima era scritta due volte: nel
 * middleware che decide DOVE salvare il file e nel controller che decide COSA
 * scrivere nel messaggio. Le due copie erano quasi uguali, e sul quasi si
 * rompeva tutto: un file .aac risultava "audio" per il controller, che nel
 * messaggio annotava /uploads/messaggi/audio/..., mentre il middleware non
 * riconoscendolo lo posava in messaggi/documenti. Il messaggio partiva, la
 * chat mostrava l'allegato, e il file non si apriva mai.
 */
const TIPI = {
  immagine: {
    cartella: 'messaggi/immagini',
    estensioni: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif'],
  },
  audio: {
    cartella: 'messaggi/audio',
    estensioni: ['.mp3', '.wav', '.ogg', '.m4a', '.aac'],
  },
  video: {
    cartella: 'messaggi/video',
    estensioni: ['.mp4', '.webm', '.mov', '.avi'],
  },
  documento: {
    cartella: 'messaggi/documenti',
    estensioni: ['.pdf', '.doc', '.docx', '.txt'],
  },
};

/** Tutte le estensioni ammesse, in un elenco solo. */
const ESTENSIONI_AMMESSE = Object.values(TIPI).flatMap((t) => t.estensioni);

/** Il tipo di un file dal suo nome, o null se l'estensione non e' ammessa. */
function tipoAllegato(nomeFile) {
  const ext = path.extname(nomeFile || '').toLowerCase();
  const voce = Object.entries(TIPI).find(([, t]) => t.estensioni.includes(ext));
  return voce ? voce[0] : null;
}

/** La cartella in cui salvare un file, dal suo nome. */
function cartellaAllegato(nomeFile) {
  const tipo = tipoAllegato(nomeFile);
  return tipo ? TIPI[tipo].cartella : TIPI.documento.cartella;
}

/**
 * Il percorso pubblico da scrivere nel messaggio.
 * Ricavato dalla stessa tabella che ha deciso dove salvare: i due valori non
 * possono piu' divergere.
 */
function percorsoPubblico(nomeFile, nomeSuDisco) {
  return `/uploads/${cartellaAllegato(nomeFile)}/${nomeSuDisco}`;
}

module.exports = { TIPI, ESTENSIONI_AMMESSE, tipoAllegato, cartellaAllegato, percorsoPubblico };
