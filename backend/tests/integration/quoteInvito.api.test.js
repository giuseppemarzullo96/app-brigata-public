const request = require('supertest');

const app = require('../../src/server');
const { sequelize } = require('../../src/config/database');
const { creaUtenteConToken, pulisciUtentiTest } = require('../helpers/fixtures');
const { emailRaggiungibile, formattaEuro } = require('../../src/controllers/users.controller');

/**
 * «Invita a pagare la quota» manda decine di messaggi che non si ritirano:
 * questi test fissano a chi arrivano, e soprattutto a chi no.
 */

const API = '/api/v1/users/invita-quote-anno-corrente';
const ANNO = new Date().getFullYear();
const EMAIL_VERA = 'socio.vero.quota@example.org';

let admin;
let conEmailVera;
let conEmailFinta;
let giaPagato;

async function pulisci() {
  await sequelize.query("DELETE FROM avvisi WHERE titolo LIKE 'Quota associativa % - Invito al pagamento'");
  await sequelize.query(
    `DELETE FROM quote_associative WHERE user_id IN
       (SELECT id FROM users WHERE email LIKE '%@test.local' OR email = :e)`,
    { replacements: { e: EMAIL_VERA } }
  );
  // Chi ha l'email vera non ha il dominio di prova: va tolto a mano.
  await sequelize.query('UPDATE users SET email = :finta WHERE email = :e', {
    replacements: { e: EMAIL_VERA, finta: `ripulito.${Date.now()}@test.local` },
  });
  await pulisciUtentiTest(sequelize);
}

async function quotaDi(userId) {
  const [q] = await sequelize.query(
    'SELECT importo, pagata FROM quote_associative WHERE user_id = :id AND anno = :anno',
    { replacements: { id: userId, anno: ANNO }, type: sequelize.QueryTypes.SELECT }
  );
  return q;
}

beforeAll(async () => {
  await sequelize.authenticate();
});

afterAll(async () => {
  await pulisci();
  await sequelize.close();
});

beforeEach(async () => {
  await pulisci();
  admin = await creaUtenteConToken(sequelize, { ruolo: 'admin', categoria_socio: 'volontario' });
  conEmailVera = await creaUtenteConToken(sequelize, { ruolo: 'socio_volontario', categoria_socio: 'volontario' });
  conEmailFinta = await creaUtenteConToken(sequelize, { ruolo: 'socio_volontario', categoria_socio: 'volontario' });
  giaPagato = await creaUtenteConToken(sequelize, { ruolo: 'socio_volontario', categoria_socio: 'volontario' });

  await sequelize.query("UPDATE users SET email = :e, telefono = '333 1111111' WHERE id = :id", {
    replacements: { e: EMAIL_VERA, id: conEmailVera.utente.id },
  });
  await sequelize.query(
    "UPDATE users SET email = :e, telefono = '333 2222222' WHERE id = :id",
    { replacements: { e: `socio.${Date.now()}@soci.labrigataodv.it`, id: conEmailFinta.utente.id } }
  );
  await sequelize.query(
    'INSERT INTO quote_associative (user_id, anno, importo, pagata) VALUES (:id, :anno, 15, true)',
    { replacements: { id: giaPagato.utente.id, anno: ANNO } }
  );
});

describe('Indirizzi e importi', () => {
  test('le email create d ufficio e i segnaposto non contano come raggiungibili', () => {
    expect(emailRaggiungibile('mario.rossi@example.com')).toBe(true);
    expect(emailRaggiungibile('socio.0001@soci.labrigataodv.it')).toBe(false);
    expect(emailRaggiungibile('wa-393331234567@fittizio.labrigataodv.it')).toBe(false);
    expect(emailRaggiungibile('admin.1.2@test.local')).toBe(false);
    expect(emailRaggiungibile('')).toBe(false);
    expect(emailRaggiungibile(null)).toBe(false);
  });

  test('l importo si scrive all italiana', () => {
    expect(formattaEuro(15)).toBe('15,00 €');
    expect(formattaEuro('12.5')).toBe('12,50 €');
  });
});

describe('Anteprima prima dell invio', () => {
  test('dice quante quote, quanti WhatsApp e quante email, senza creare niente', async () => {
    const res = await request(app).get(`${API}/anteprima`).set('Authorization', admin.auth);

    expect(res.status).toBe(200);
    expect(res.body.anno).toBe(ANNO);
    expect(res.body.importoTesto).toMatch(/€$/);
    // Chi ha gia' la quota non e' fra i destinatari.
    expect(res.body.destinatari).toBeGreaterThanOrEqual(3);
    expect(res.body.email + res.body.emailSaltate).toBe(res.body.destinatari);
    expect(await quotaDi(conEmailVera.utente.id)).toBeUndefined();
  });

  test('un socio non puo vederla', async () => {
    const res = await request(app).get(`${API}/anteprima`).set('Authorization', conEmailVera.auth);
    expect(res.status).toBe(403);
  });
});

describe('Invio', () => {
  test('crea la quota a chi non ce l ha, e non tocca chi ha gia pagato', async () => {
    const res = await request(app).post(API).set('Authorization', admin.auth);

    expect(res.status).toBe(200);
    expect(Number((await quotaDi(conEmailVera.utente.id)).importo)).toBe(15);
    expect(await quotaDi(conEmailFinta.utente.id)).toBeDefined();
    const pagata = await quotaDi(giaPagato.utente.id);
    expect(pagata.pagata).toBe(true);
  });

  test('i numeri dell invio coincidono con quelli dell anteprima', async () => {
    const anteprima = await request(app).get(`${API}/anteprima`).set('Authorization', admin.auth);
    const invio = await request(app).post(API).set('Authorization', admin.auth);

    expect(invio.body.quoteCreate).toBe(anteprima.body.destinatari);
    expect(invio.body.whatsapp).toBe(anteprima.body.whatsapp);
    expect(invio.body.email).toBe(anteprima.body.email);
  });

  test('l avviso nell app arriva a chi deve pagare, non a chi ha gia pagato', async () => {
    await request(app).post(API).set('Authorization', admin.auth);

    const titolo = `Quota associativa ${ANNO} - Invito al pagamento`;
    const vede = async (chi) => {
      const res = await request(app).get('/api/v1/avvisi').set('Authorization', chi.auth);
      return (res.body.avvisi || []).some((a) => a.titolo === titolo);
    };

    expect(await vede(conEmailVera)).toBe(true);
    expect(await vede(conEmailFinta)).toBe(true);
    expect(await vede(giaPagato)).toBe(false);
  });

  test('premuto due volte non crea quote doppie', async () => {
    await request(app).post(API).set('Authorization', admin.auth);
    const seconda = await request(app).post(API).set('Authorization', admin.auth);

    expect(seconda.body.quoteCreate).toBe(0);
    const [{ n }] = await sequelize.query(
      'SELECT count(*)::int AS n FROM quote_associative WHERE user_id = :id AND anno = :anno',
      { replacements: { id: conEmailVera.utente.id, anno: ANNO }, type: sequelize.QueryTypes.SELECT }
    );
    expect(n).toBe(1);
  });
});

describe('Stato della quota nella lista dei soci', () => {
  const statoDi = (res, id) => res.body.users.find((u) => u.id === id)?.quota_stato ?? null;

  test('l admin vede per ognuno se la quota dell anno e pagata, da verificare, da pagare o assente', async () => {
    await sequelize.query(
      "INSERT INTO quote_associative (user_id, anno, importo, pagata, stato_validazione) VALUES (:id, :anno, 15, false, 'in_attesa')",
      { replacements: { id: conEmailVera.utente.id, anno: ANNO } }
    );
    await sequelize.query(
      'INSERT INTO quote_associative (user_id, anno, importo, pagata) VALUES (:id, :anno, 15, false)',
      { replacements: { id: conEmailFinta.utente.id, anno: ANNO } }
    );

    const res = await request(app).get('/api/v1/users?fittizio=false').set('Authorization', admin.auth);

    expect(res.status).toBe(200);
    expect(res.body.annoQuota).toBe(ANNO);
    expect(statoDi(res, giaPagato.utente.id)).toBe('pagata');
    expect(statoDi(res, conEmailVera.utente.id)).toBe('da_verificare');
    expect(statoDi(res, conEmailFinta.utente.id)).toBe('da_pagare');
    expect(statoDi(res, admin.utente.id)).toBeNull();
  });

  test('un socio non vede lo stato delle quote degli altri', async () => {
    const res = await request(app).get('/api/v1/users').set('Authorization', conEmailVera.auth);
    expect(res.status).toBe(200);
    expect(res.body.annoQuota).toBeUndefined();
    expect(res.body.users.every((u) => u.quota_stato === undefined)).toBe(true);
  });
});
