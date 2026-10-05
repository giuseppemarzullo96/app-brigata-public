const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { testConnection } = require('./config/database');
const logger = require('./utils/logger');
const monitoraggio = require('./utils/monitoraggio');

// Va inizializzato prima che vengano registrate le rotte.
monitoraggio.inizializza();

// Import routes
const authRoutes = require('./routes/auth.routes');
const usersRoutes = require('./routes/users.routes');
const turniRoutes = require('./routes/turni.routes');
const assembleeRoutes = require('./routes/assemblee.routes');
const sondaggiRoutes = require('./routes/sondaggi.routes');
const magazzinoRoutes = require('./routes/magazzino.routes');
const avvisiRoutes = require('./routes/avvisi.routes');
const sportelliRoutes = require('./routes/sportelli.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const messaggiRoutes = require('./routes/messaggi.routes');
const richiesteRoutes = require('./routes/richieste.routes');
const ricettarioRoutes = require('./routes/ricettario.routes');
const chiaviRoutes = require('./routes/chiavi.routes');
const votazioniRoutes = require('./routes/votazioni.routes');
const caricheRoutes = require('./routes/cariche.routes');
const impostazioniRoutes = require('./routes/impostazioni.routes');
const tesseraRoutes = require('./routes/tessera.routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Dietro il reverse proxy nginx di Plesk (un solo hop): fidati di X-Forwarded-For
// per far identificare correttamente gli IP client a express-rate-limit.
app.set('trust proxy', 1);

// Middleware CORS - DEVE essere prima di helmet per i file statici
// 'capacitor://localhost' e 'https://localhost' sono le origini con cui la webview
// dell'app nativa (iOS/Android via Capacitor) effettua le richieste.
const originiConsentite = [
  process.env.FRONTEND_URL || 'http://localhost:3001',
  'capacitor://localhost',
  'https://localhost',
];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || originiConsentite.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Non consentito da CORS'));
    }
  },
  credentials: true,
  exposedHeaders: ['Content-Length', 'Content-Type']
}));

// Middleware di sicurezza
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "http://localhost:3000", "http://localhost:3001", "https:"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      fontSrc: ["'self'", "https:", "data:"],
    },
  },
  crossOriginResourcePolicy: false, // Disabilita per permettere immagini cross-origin
}));

// Rate limiting per route di autenticazione (molto permissivo)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuti
  max: 200, // Aumentato a 200 per login/refresh
  message: 'Troppi tentativi di login, riprova più tardi.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Non conta le richieste riuscite
});

// Rate limiting per /me (estremamente permissivo per auto-refresh e polling)
const meLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 120, // Aumentato a 120 richieste al minuto per /me (2 al secondo)
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Conta anche le richieste riuscite per evitare abusi
});

// Rate limiting generale per tutte le altre route (esclude auth)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuti
  max: 2000, // Aumentato a 2000 per supportare polling frequente di più componenti
  message: 'Troppe richieste da questo IP, riprova più tardi.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Escludi le route di autenticazione dal limiter generale
    return req.path.startsWith('/api/v1/auth');
  },
});

// Password dimenticata: ogni richiesta manda un'email e un WhatsApp, quindi
// poche per IP, anche quelle andate a buon fine.
const passwordDimenticataLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Troppe richieste: riprova fra un quarto d\'ora.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Applica rate limiting specifico alle route di autenticazione
app.use('/api/v1/auth/password-dimenticata', passwordDimenticataLimiter);
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/refresh', authLimiter);
app.use('/api/v1/auth/me', meLimiter);

// Applica rate limiting generale a tutte le altre route API
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware CORS specifico per file statici (prima di express.static)
app.use('/uploads', (req, res, next) => {
  // Aggiungi header CORS per i file statici
  const origin = req.headers.origin;
  const allowedOrigins = [process.env.FRONTEND_URL || 'http://localhost:3001'];
  
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  } else if (!origin) {
    // Permetti anche richieste senza origin (es. da browser diretto)
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  // Gestisci preflight OPTIONS
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

// Verbali e convocazioni non si servono come file pubblici: chiunque avesse il
// link li scaricava senza accesso, compresi quelli del Consiglio direttivo. Si
// scaricano da /api/v1/assemblee/:id/verbale e /convocazione, che verificano
// l'utente e i permessi.
app.use(['/uploads/verbali', '/uploads/convocazioni'], (req, res) => {
  res.status(404).json({ error: 'Non trovato' });
});

// Serve uploaded files
app.use('/uploads', express.static('uploads', {
  setHeaders: (res, path) => {
    // Assicurati che i file statici abbiano gli header CORS corretti
    const origin = res.req.headers.origin;
    const allowedOrigins = [process.env.FRONTEND_URL || 'http://localhost:3001'];
    
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else if (!origin) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
  }
}));

/**
 * Il percorso da scrivere nei log. Il webhook e il calendario pubblico
 * portano un segreto nel percorso stesso: scritto per intero nei log,
 * chiunque li legga avrebbe anche la chiave.
 */
function percorsoDaLoggare(percorso) {
  return String(percorso).replace(/^(\/api\/v1\/(?:webhook|pubblico)\/[^/]+\/)[^/]+/, '$1***');
}

// Logging richieste
app.use((req, res, next) => {
  logger.info(`${req.method} ${percorsoDaLoggare(req.path)}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// Health check
app.get('/health', async (req, res) => {
  const dbConnected = await testConnection();
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? 'ok' : 'error',
    database: dbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/turni', turniRoutes);
app.use('/api/v1/assemblee', assembleeRoutes);
app.use('/api/v1/sondaggi', sondaggiRoutes);
app.use('/api/v1/magazzino', magazzinoRoutes);
app.use('/api/v1/avvisi', avvisiRoutes);
app.use('/api/v1/sportelli', sportelliRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/messaggi', messaggiRoutes);
app.use('/api/v1/richieste', richiesteRoutes);
app.use('/api/v1/ricettario', ricettarioRoutes);
app.use('/api/v1/chiavi', chiaviRoutes);
app.use('/api/v1/votazioni', votazioniRoutes);
app.use('/api/v1/cariche', caricheRoutes);
app.use('/api/v1/impostazioni', impostazioniRoutes);
app.use('/api/v1/tessera', tesseraRoutes);

// Eventi dai servizi esterni: autenticati da un segreto nel percorso, non da una sessione.
app.use('/api/v1/webhook', require('./routes/webhook.routes'));

// Pagine in sola lettura per chi non ha un account, aperte da un link con codice.
app.use('/api/v1/pubblico', require('./routes/pubblico.routes'));

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint non trovato',
    path: req.path
  });
});

// Raccolta degli errori, se configurata. Non risponde al client: passa
// comunque al gestore sotto.
app.use(monitoraggio.middlewareErrori());

// Error handler globale
app.use((err, req, res, next) => {
  logger.error('Errore non gestito:', {
    error: err.message,
    stack: err.stack,
    path: percorsoDaLoggare(req.path)
  });

  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Errore interno del server' 
      : err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Avvio server
const startServer = async () => {
  try {
    // Test connessione database
    const dbConnected = await testConnection();
    if (!dbConnected) {
      logger.error('Impossibile avviare il server: database non disponibile');
      process.exit(1);
    }

    app.listen(PORT, () => {
      logger.info(`🚀 Server avviato su porta ${PORT}`);
      logger.info(`📝 Ambiente: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🌐 API disponibili su: http://localhost:${PORT}/api/v1`);
    });
  } catch (error) {
    logger.error('Errore durante l\'avvio del server:', error);
    process.exit(1);
  }
};

// In ambiente di test l'app viene importata da Supertest, che apre da se' una
// porta effimera: avviare qui il listener lascerebbe handle aperti e impedirebbe
// a Jest di terminare.
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

module.exports = app;

