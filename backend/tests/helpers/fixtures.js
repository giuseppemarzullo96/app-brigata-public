const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

/**
 * Creazione di utenti di prova e relativi token.
 * Gli utenti vengono creati con email univoche per test, cosi' due file di test
 * eseguiti in parallelo non si pestano i piedi sul vincolo UNIQUE(email).
 */

let contatore = 0;

function emailUnivoca(prefisso = 'socio') {
  contatore += 1;
  return `${prefisso}.${process.pid}.${contatore}@test.local`;
}

/**
 * Inserisce un utente nel database di test.
 * @returns {Promise<object>} l'utente creato
 */
async function creaUtente(sequelize, opzioni = {}) {
  const {
    nome = 'Mario',
    cognome = 'Rossi',
    ruolo = 'socio_ordinario',
    categoria_socio = 'ordinario',
    attivo = true,
    archiviato = false,
    sospeso = false,
    fittizio = false,
    email = emailUnivoca(ruolo),
  } = opzioni;

  const hash = await bcrypt.hash('password-di-test', 4);

  const [utente] = await sequelize.query(
    `INSERT INTO users
       (email, password_hash, nome, cognome, categoria_socio, ruolo,
        attivo, archiviato, sospeso, fittizio, consenso_privacy)
     VALUES (:email, :hash, :nome, :cognome, :categoria, :ruolo,
             :attivo, :archiviato, :sospeso, :fittizio, true)
     RETURNING id, email, nome, cognome, ruolo, categoria_socio`,
    {
      replacements: {
        email, hash, nome, cognome,
        categoria: categoria_socio,
        ruolo, attivo, archiviato, sospeso, fittizio,
      },
      type: sequelize.QueryTypes.SELECT,
    }
  );

  return utente;
}

/** Token JWT valido per l'utente indicato. */
function tokenPer(utente) {
  return jwt.sign({ userId: utente.id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  });
}

/** Crea un utente e restituisce {utente, token, auth} pronto per Supertest. */
async function creaUtenteConToken(sequelize, opzioni = {}) {
  const utente = await creaUtente(sequelize, opzioni);
  const token = tokenPer(utente);
  return { utente, token, auth: `Bearer ${token}` };
}

/**
 * Rimuove gli utenti creati dai test (quelli con dominio @test.local).
 *
 * Le suite condividono un solo database e vengono eseguite in fila
 * (maxWorkers: 1): in parallelo questa pulizia cancellava, a meta' corsa, le
 * righe che un'altra suite aveva appena scritto, e i test che leggono
 * l'audit log o contano gli aventi diritto fallivano a intermittenza.
 *
 * Prima degli utenti vanno tolte le righe che li referenziano senza
 * ON DELETE CASCADE: i turni che hanno creato con i relativi slot e
 * ricettari, l'audit log e la colonna modificato_da del changelog.
 */
async function pulisciUtentiTest(sequelize) {
  const test = "SELECT id FROM users WHERE email LIKE '%@test.local'";
  const turni = `SELECT id FROM turni_cucina WHERE created_by IN (${test})`;

  await sequelize.query(`DELETE FROM slot_turno WHERE user_id IN (${test}) OR turno_id IN (${turni})`);
  await sequelize.query(`DELETE FROM ricettari WHERE created_by IN (${test}) OR turno_id IN (${turni})`);
  await sequelize.query(`DELETE FROM turni_cucina WHERE created_by IN (${test})`);
  await sequelize.query(`DELETE FROM audit_log WHERE user_id IN (${test})`);
  await sequelize.query(`DELETE FROM user_changelog WHERE user_id IN (${test}) OR modificato_da IN (${test})`);
  await sequelize.query("DELETE FROM users WHERE email LIKE '%@test.local'");
}

module.exports = {
  creaUtente,
  creaUtenteConToken,
  tokenPer,
  pulisciUtentiTest,
  emailUnivoca,
};
