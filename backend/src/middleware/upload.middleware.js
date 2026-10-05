const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { ESTENSIONI_AMMESSE, cartellaAllegato } = require('../utils/allegati');

// Crea directory uploads se non esiste
const uploadDir = process.env.UPLOAD_PATH || './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configurazione storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Crea sottocartelle per tipo file
    let subfolder = 'generale';
    if (file.fieldname === 'verbale' || file.fieldname === 'allegato_verbale') {
      // Anche gli allegati del verbale: la cartella non e' servita come
      // statica, si scarica solo passando dai controlli di accesso.
      subfolder = 'verbali';
    } else if (file.fieldname === 'convocazione') {
      subfolder = 'convocazioni';
    } else if (file.fieldname === 'allegato') {
      subfolder = 'allegati';
    } else if (file.fieldname === 'logo_carta') {
      subfolder = 'carta-intestata';
    } else if (file.fieldname === 'foto_gruppo') {
      subfolder = 'gruppi';
    } else if (file.fieldname === 'foto_profilo') {
      subfolder = 'profili';
    } else if (file.fieldname === 'allegato_messaggio') {
      // La cartella la decide utils/allegati: e' la stessa tabella che il
      // controller usa per scrivere il percorso nel messaggio.
      subfolder = cartellaAllegato(file.originalname);
    }
    
    const destPath = path.join(uploadDir, subfolder);
    if (!fs.existsSync(destPath)) {
      fs.mkdirSync(destPath, { recursive: true });
    }
    
    cb(null, destPath);
  },
  filename: (req, file, cb) => {
    // Nome file: timestamp_originalname
    const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
    cb(null, `${name}_${uniqueSuffix}${ext}`);
  }
});

// Filtro file permessi per documenti
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['.pdf', '.doc', '.docx', '.txt'];
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allowedTypes.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Tipo file non consentito. Permessi: ${allowedTypes.join(', ')}`), false);
  }
};

// Filtro file permessi per messaggi (immagini, audio, video)
const fileFilterMessaggi = (req, file, cb) => {
  const allowedTypes = ESTENSIONI_AMMESSE;
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedTypes.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Tipo file non consentito. Permessi: ${allowedTypes.join(', ')}`), false);
  }
};

// Filtro file permessi per foto profilo gruppi
const fileFilterFotoGruppo = (req, file, cb) => {
  const allowedTypes = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allowedTypes.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Tipo file non consentito. Solo immagini: ${allowedTypes.join(', ')}`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.UPLOAD_MAX_SIZE || '10485760') // 10MB default
  }
});

// Upload per messaggi (supporta immagini, audio, video)
const uploadMessaggi = multer({
  storage,
  fileFilter: fileFilterMessaggi,
  limits: {
    fileSize: parseInt(process.env.UPLOAD_MAX_SIZE_MESSAGGI || '52428800') // 50MB default per messaggi
  }
});

// Allegati del verbale: documenti e scansioni (deleghe firmate, fogli firme).
const ESTENSIONI_ALLEGATI_VERBALE = ['.pdf', '.doc', '.docx', '.odt', '.jpg', '.jpeg', '.png'];
const uploadAllegatoVerbale = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ESTENSIONI_ALLEGATI_VERBALE.includes(ext)) return cb(null, true);
    return cb(new Error(`Tipo di file non ammesso. Ammessi: ${ESTENSIONI_ALLEGATI_VERBALE.join(', ')}`));
  },
  limits: {
    fileSize: parseInt(process.env.UPLOAD_MAX_SIZE || '10485760') // 10MB default
  }
});

// Logo della carta intestata: PDFKit incorpora solo PNG e JPEG.
const uploadLogoCarta = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.png', '.jpg', '.jpeg'].includes(ext)) return cb(null, true);
    return cb(new Error('Il logo deve essere un\'immagine PNG o JPEG'));
  },
  limits: { fileSize: 2 * 1024 * 1024 },
});

// Upload per foto profilo gruppi
const uploadFotoGruppo = multer({
  storage,
  fileFilter: fileFilterFotoGruppo,
  limits: {
    fileSize: parseInt(process.env.UPLOAD_MAX_SIZE_FOTO || '5242880') // 5MB default per foto
  }
});

// Upload per foto profilo utenti
const uploadFotoProfilo = multer({
  storage,
  fileFilter: fileFilterFotoGruppo, // Stesso filtro delle foto gruppi
  limits: {
    fileSize: parseInt(process.env.UPLOAD_MAX_SIZE_FOTO || '5242880') // 5MB default per foto
  }
});

module.exports = {
  upload,
  uploadSingle: (fieldName) => upload.single(fieldName),
  uploadMultiple: (fieldName, maxCount = 5) => upload.array(fieldName, maxCount),
  uploadMessaggi: uploadMessaggi.single('allegato_messaggio'),
  uploadFotoGruppo: uploadFotoGruppo.single('foto_gruppo'),
  uploadFotoProfilo: uploadFotoProfilo.single('foto_profilo'),
  uploadAllegatoVerbale: uploadAllegatoVerbale.single('allegato_verbale'),
  uploadLogoCarta: uploadLogoCarta.single('logo_carta'),
};

