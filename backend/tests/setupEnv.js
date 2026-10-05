const { datiConnessione } = require('./helpers/testDb');

/**
 * Eseguito prima di ogni file di test, e comunque prima che venga importata
 * l'app: punta la connessione al database di prova. Senza questo, `require`
 * del server aprirebbe una connessione al database reale.
 */
const { host, port, user, password, database } = datiConnessione();

process.env.NODE_ENV = 'test';
process.env.DB_HOST = host;
process.env.DB_PORT = String(port);
process.env.DB_USER = user;
process.env.DB_PASSWORD = password;
process.env.DB_NAME = database;
process.env.DB_SSL = 'false';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'segreto-di-test-non-usare-in-produzione';
process.env.JWT_EXPIRES_IN = '1h';

// Nessun invio reale di email o WhatsApp durante i test.
delete process.env.SMTP_HOST;
delete process.env.EVOLUTION_API_URL;
delete process.env.EVOLUTION_API_KEY;
