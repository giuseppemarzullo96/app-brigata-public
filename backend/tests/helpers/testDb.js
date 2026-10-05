const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Infrastruttura per i test di integrazione.
 *
 * I test girano su un database dedicato (`app_brigata_test`) ricreato da zero
 * a ogni esecuzione, cosi' non toccano mai i dati reali. Lo schema viene
 * estratto dal database di produzione con pg_dump --schema-only e completato
 * con le migration non ancora applicate: in questo modo i test girano contro
 * la stessa struttura che troveranno in esercizio.
 */

const CONTAINER_DB = process.env.TEST_DB_CONTAINER || 'app-brigata-postgres';
const DB_SORGENTE = process.env.TEST_DB_SOURCE || 'app_brigata';
const DB_TEST = process.env.TEST_DB_NAME || 'app_brigata_test';
const DB_USER = process.env.TEST_DB_USER || 'app_brigata';

/** Legge dall'ambiente del container le credenziali e l'IP raggiungibile dall'host. */
function datiConnessione() {
  const env = execFileSync('docker', [
    'inspect', CONTAINER_DB, '--format', '{{range .Config.Env}}{{println .}}{{end}}',
  ]).toString();
  const password = (env.match(/POSTGRES_PASSWORD=(.*)/) || [])[1];
  if (!password) throw new Error(`Password non trovata nel container ${CONTAINER_DB}`);

  const host = execFileSync('docker', [
    'inspect', CONTAINER_DB, '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}',
  ]).toString().trim().split(/\s+/)[0];
  if (!host) throw new Error(`IP non trovato per il container ${CONTAINER_DB}`);

  return { host, port: 5432, user: DB_USER, password, database: DB_TEST };
}

/** Esegue psql dentro al container. */
function psql(database, sql) {
  return execFileSync(
    'docker',
    ['exec', '-i', CONTAINER_DB, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', DB_USER, '-d', database, '-f', '-'],
    { input: sql }
  ).toString();
}

/** Ricrea il database di test e vi carica lo schema completo. */
function preparaDatabaseTest() {
  // Chiude eventuali connessioni residue e ricrea il database.
  psql('postgres', `
    SELECT pg_terminate_backend(pid) FROM pg_stat_activity
     WHERE datname = '${DB_TEST}' AND pid <> pg_backend_pid();
  `);
  psql('postgres', `DROP DATABASE IF EXISTS ${DB_TEST};`);
  psql('postgres', `CREATE DATABASE ${DB_TEST};`);

  const schema = execFileSync('docker', [
    'exec', CONTAINER_DB, 'pg_dump', '--schema-only', '--no-owner', '--no-privileges',
    '-U', DB_USER, '-d', DB_SORGENTE,
  ]).toString();
  psql(DB_TEST, schema);

  // Applica le migration che il database sorgente non ha ancora ricevuto.
  const cartella = path.join(__dirname, '..', '..', 'src', 'database', 'migrations');
  const daApplicare = (process.env.TEST_MIGRATIONS || '016_add_votazioni.sql,017_add_impostazioni.sql,018_copia_mittente_messaggi.sql,019_add_sondaggi_whatsapp.sql,020_attese_sondaggio_whatsapp.sql,021_verbale_votazione.sql,022_direttivo.sql,023_allegati_verbale.sql,024_tessera_socio.sql').split(',');
  daApplicare.filter(Boolean).forEach((file) => {
    const percorso = path.join(cartella, file.trim());
    if (fs.existsSync(percorso)) {
      psql(DB_TEST, fs.readFileSync(percorso, 'utf8'));
    }
  });
}

/** Svuota le tabelle del modulo votazioni fra un test e l'altro. */
const TABELLE_VOTAZIONI = [
  'voti_votazione',
  'schede_votazione',
  'aventi_diritto_votazione',
  'candidati_votazione',
  'votazioni',
];

async function pulisciVotazioni(sequelize) {
  await sequelize.query(`TRUNCATE ${TABELLE_VOTAZIONI.join(', ')} CASCADE`);
  await sequelize.query("DELETE FROM audit_log WHERE entita = 'votazione'");
}

module.exports = {
  datiConnessione,
  preparaDatabaseTest,
  pulisciVotazioni,
  psql,
  DB_TEST,
  TABELLE_VOTAZIONI,
};
