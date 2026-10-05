// Email e WhatsApp finti: i test leggono cosa sarebbe partito.
jest.mock('../../src/utils/mailer', () => ({
  sendMail: jest.fn(async () => ({ sent: true })),
  sendMailBulk: jest.fn(async () => 0),
}));
jest.mock('../../src/utils/whatsapp', () => ({
  ...jest.requireActual('../../src/utils/whatsapp'),
  sendWhatsApp: jest.fn(async () => ({ sent: true })),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');

const app = require('../../src/server');
const { sequelize } = require('../../src/config/database');
const { sendMail } = require('../../src/utils/mailer');
const { sendWhatsApp } = require('../../src/utils/whatsapp');
const { creaUtenteConToken, pulisciUtentiTest, emailUnivoca } = require('../helpers/fixtures');

/**
 * Dati di accesso: la password provvisoria la genera l'app e arriva al socio
 * per email e WhatsApp; l'admin puo' rimandarla; chi la dimentica riceve un
 * link che vale 30 minuti e una volta sola.
 */

let admin;
let socio;

const login = (email, password) => request(app).post('/api/v1/auth/login').send({ email, password });

/** La password provvisoria scritta nell'ultima email. */
function passwordDallEmail() {
  const html = sendMail.mock.calls.at(-1)[0].corpoHtml;
  return html.match(/Password provvisoria:<\/strong> ([^<\s]+)/)[1];
}

/** Il gettone del link di reimpostazione nell'ultima email. */
function gettoneDallEmail() {
  const html = sendMail.mock.calls.at(-1)[0].corpoHtml;
  return html.match(/reimposta-password#([\w.-]+)/)[1];
}

beforeAll(async () => {
  await sequelize.authenticate();
});

afterAll(async () => {
  await pulisciUtentiTest(sequelize);
  await sequelize.close();
});

beforeEach(async () => {
  jest.clearAllMocks();
  await pulisciUtentiTest(sequelize);
  admin = await creaUtenteConToken(sequelize, { ruolo: 'admin', categoria_socio: 'volontario' });
  socio = await creaUtenteConToken(sequelize, { ruolo: 'socio_volontario', categoria_socio: 'volontario', nome: 'Anna' });
  await sequelize.query("UPDATE users SET telefono = '3331234567' WHERE id = :id", { replacements: { id: socio.utente.id } });
});

describe('Nuovo socio', () => {
  test('senza password ne riceve una generata, per email e WhatsApp, e con quella entra', async () => {
    const email = emailUnivoca('nuovo');
    const res = await request(app)
      .post('/api/v1/auth/register')
      .set('Authorization', admin.auth)
      .send({ email, nome: 'Nuovo', cognome: 'Socio', telefono: '3339876543', categoria_socio: 'volontario', ruolo: 'socio_volontario' });

    expect(res.status).toBe(201);
    expect(res.body.credenziali).toEqual({ email: true, whatsapp: true });

    const password = passwordDallEmail();
    expect(password).toMatch(/^[a-zA-Z2-9]{10}$/);
    expect(sendMail.mock.calls.at(-1)[0].to).toBe(email);
    expect(sendWhatsApp.mock.calls.at(-1)[1]).toContain(password);

    expect((await login(email, password)).status).toBe(200);
  });

  test('un ente fittizio non riceve messaggi', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .set('Authorization', admin.auth)
      .send({ email: emailUnivoca('ente'), tipo_persona: 'giuridica', ragione_sociale: 'Parrocchia', categoria_socio: 'esterno', ruolo: 'esterno', fittizio: true });

    expect(res.status).toBe(201);
    expect(res.body.credenziali).toBeNull();
    expect(sendMail).not.toHaveBeenCalled();
  });

  test('il nome nell\'email non diventa HTML', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .set('Authorization', admin.auth)
      .send({ email: emailUnivoca('html'), nome: '<b>Ugo</b>', cognome: 'X', categoria_socio: 'volontario' });

    expect(sendMail.mock.calls.at(-1)[0].corpoHtml).toContain('&lt;b&gt;Ugo&lt;/b&gt;');
  });
});

describe('Rimanda i dati di accesso', () => {
  test('l\'admin genera una nuova password: la nuova entra, la vecchia no', async () => {
    const res = await request(app)
      .post(`/api/v1/users/${socio.utente.id}/rimanda-credenziali`)
      .set('Authorization', admin.auth);

    expect(res.status).toBe(200);
    expect(res.body.credenziali).toEqual({ email: true, whatsapp: true });

    const nuova = passwordDallEmail();
    expect((await login(socio.utente.email, nuova)).status).toBe(200);
    expect((await login(socio.utente.email, 'password-di-test')).status).toBe(401);
  });

  test('un socio non puo\' farlo, nemmeno per se\'', async () => {
    const res = await request(app)
      .post(`/api/v1/users/${socio.utente.id}/rimanda-credenziali`)
      .set('Authorization', socio.auth);
    expect(res.status).toBe(403);
    expect(sendMail).not.toHaveBeenCalled();
  });

  test('non vale per gli enti fittizi', async () => {
    const ente = await creaUtenteConToken(sequelize, { ruolo: 'esterno', categoria_socio: 'esterno', fittizio: true });
    const res = await request(app)
      .post(`/api/v1/users/${ente.utente.id}/rimanda-credenziali`)
      .set('Authorization', admin.auth);
    expect(res.status).toBe(400);
  });
});

describe('Password dimenticata', () => {
  test('il link permette di sceglierne una nuova, e vale una volta sola', async () => {
    const res = await request(app)
      .post('/api/v1/auth/password-dimenticata')
      .send({ email: socio.utente.email.toUpperCase() });
    expect(res.status).toBe(200);

    const token = gettoneDallEmail();
    expect(sendWhatsApp.mock.calls.at(-1)[1]).toContain(token);

    const primo = await request(app).post('/api/v1/auth/reimposta-password').send({ token, password: 'nuova-password-1' });
    expect(primo.status).toBe(200);
    expect((await login(socio.utente.email, 'nuova-password-1')).status).toBe(200);
    expect((await login(socio.utente.email, 'password-di-test')).status).toBe(401);

    const secondo = await request(app).post('/api/v1/auth/reimposta-password').send({ token, password: 'altra-password-2' });
    expect(secondo.status).toBe(400);
    expect((await login(socio.utente.email, 'nuova-password-1')).status).toBe(200);
  });

  test('un\'email sconosciuta riceve la stessa risposta, e non parte nulla', async () => {
    const conosciuta = await request(app).post('/api/v1/auth/password-dimenticata').send({ email: socio.utente.email });
    jest.clearAllMocks();
    const sconosciuta = await request(app).post('/api/v1/auth/password-dimenticata').send({ email: 'nessuno@test.local' });

    expect(sconosciuta.status).toBe(200);
    expect(sconosciuta.body).toEqual(conosciuta.body);
    expect(sendMail).not.toHaveBeenCalled();
  });

  test('gettoni scaduti, di un altro scopo o falsi non valgono', async () => {
    const [{ password_hash: hash }] = await sequelize.query('SELECT password_hash FROM users WHERE id = :id', {
      replacements: { id: socio.utente.id }, type: sequelize.QueryTypes.SELECT,
    });
    const segreto = `${process.env.JWT_SECRET}:${hash}`;
    const scaduto = jwt.sign({ scopo: 'reimposta-password' }, segreto, { subject: socio.utente.id, expiresIn: -10 });
    const sessione = socio.token;

    for (const token of [scaduto, sessione, 'non-un-gettone', undefined]) {
      const res = await request(app).post('/api/v1/auth/reimposta-password').send({ token, password: 'tentativo-123' });
      expect(res.status).toBe(400);
    }
    expect((await login(socio.utente.email, 'password-di-test')).status).toBe(200);
  });

  test('la nuova password deve avere almeno 8 caratteri', async () => {
    await request(app).post('/api/v1/auth/password-dimenticata').send({ email: socio.utente.email });
    const res = await request(app)
      .post('/api/v1/auth/reimposta-password')
      .send({ token: gettoneDallEmail(), password: 'corta' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 caratteri/);
  });
});
