// Verifica che le notifiche di apertura votazione portino il link diretto.
// notificaDestinatari viene sostituita prima che il controller la importi:
// il controller la destruttura al caricamento, quindi la sostituzione deve
// avvenire a livello di modulo.
jest.mock('../../src/utils/notifiche', () => ({
  notificaDestinatari: jest.fn().mockResolvedValue({
    emailInviate: 0, whatsappInviati: 0, totaleDestinatari: 0,
  }),
  getContattiDestinatari: jest.fn().mockResolvedValue([]),
}));

const request = require('supertest');
const { notificaDestinatari } = require('../../src/utils/notifiche');
const app = require('../../src/server');
const { sequelize } = require('../../src/config/database');
const { pulisciVotazioni } = require('../helpers/testDb');
const { creaUtenteConToken, pulisciUtentiTest } = require('../helpers/fixtures');

const API = '/api/v1/votazioni';
let admin;

beforeAll(async () => {
  await sequelize.authenticate();
});

afterAll(async () => {
  await pulisciVotazioni(sequelize);
  await pulisciUtentiTest(sequelize);
  await sequelize.close();
});

beforeEach(async () => {
  notificaDestinatari.mockClear();
  await pulisciVotazioni(sequelize);
  await pulisciUtentiTest(sequelize);
  admin = await creaUtenteConToken(sequelize, { ruolo: 'admin', categoria_socio: 'volontario' });
});

test('l\'apertura di una votazione notifica con il link alla scheda di voto', async () => {
  const creazione = await request(app).post(API).set('Authorization', admin.auth).send({
    titolo: 'Rinnovo direttivo',
    seggi_da_eleggere: 1,
    candidati: [{ nome: 'Anna', cognome: 'Alfieri' }],
  });
  const votazione = creazione.body.votazione;

  const apertura = await request(app).post(`${API}/${votazione.id}/apri`)
    .set('Authorization', admin.auth);
  expect(apertura.status).toBe(200);

  expect(notificaDestinatari).toHaveBeenCalledTimes(1);
  const [, contenuti] = notificaDestinatari.mock.calls[0];

  const urlAtteso = `https://app.labrigataodv.it/votazioni/${votazione.id}`;

  // WhatsApp: link presente e su una riga propria.
  expect(contenuti.testoWhatsapp).toContain(urlAtteso);
  expect(contenuti.testoWhatsapp.trim().split('\n').pop()).toBe(urlAtteso);

  // Email: link dentro all'ancora.
  expect(contenuti.corpoHtml).toContain(`href="${urlAtteso}"`);

  // E il messaggio dice ancora quante preferenze si possono esprimere.
  expect(contenuti.testoWhatsapp).toContain('1 preferenze');
});
