const request = require('supertest');

const app = require('../../src/server');
const { sequelize } = require('../../src/config/database');
const { creaUtenteConToken, pulisciUtentiTest } = require('../helpers/fixtures');
const { getQuotaAnnuale } = require('../../src/utils/impostazioni');

const API = '/api/v1/impostazioni';

let admin;
let socio;

async function ripristinaImpostazioni() {
  await sequelize.query('DELETE FROM impostazioni_storico');
  await sequelize.query("UPDATE impostazioni SET valore = '15.00' WHERE chiave = 'quota_annuale'");
  await sequelize.query("DELETE FROM impostazioni WHERE chiave = 'chat_attiva'");
}

async function quotaDi(userId, anno = new Date().getFullYear()) {
  const [q] = await sequelize.query(
    'SELECT importo, pagata, stato_validazione FROM quote_associative WHERE user_id = :id AND anno = :anno',
    { replacements: { id: userId, anno }, type: sequelize.QueryTypes.SELECT }
  );
  return q;
}

beforeAll(async () => {
  await sequelize.authenticate();
});

afterAll(async () => {
  await sequelize.query("DELETE FROM quote_associative WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.local')");
  await ripristinaImpostazioni();
  await pulisciUtentiTest(sequelize);
  await sequelize.close();
});

beforeEach(async () => {
  await sequelize.query("DELETE FROM quote_associative WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.local')");
  await ripristinaImpostazioni();
  await pulisciUtentiTest(sequelize);
  admin = await creaUtenteConToken(sequelize, { ruolo: 'admin', categoria_socio: 'volontario' });
  socio = await creaUtenteConToken(sequelize, { ruolo: 'socio_ordinario', categoria_socio: 'ordinario' });
});

describe('Lettura delle impostazioni', () => {
  test('ogni socio autenticato vede la quota corrente', async () => {
    const res = await request(app).get(API).set('Authorization', socio.auth);

    expect(res.status).toBe(200);
    const quota = res.body.impostazioni.find((i) => i.chiave === 'quota_annuale');
    expect(quota).toBeDefined();
    expect(quota.valore).toBe('15.00');
    expect(quota.descrizione).toMatch(/quota associativa/i);
  });

  test('senza autenticazione risponde 401', async () => {
    expect((await request(app).get(API)).status).toBe(401);
  });
});

describe('Modifica della quota', () => {
  test('l\'admin puo\' cambiare l\'importo', async () => {
    const res = await request(app).put(`${API}/quota_annuale`)
      .set('Authorization', admin.auth).send({ valore: 25 });

    expect(res.status).toBe(200);
    expect(res.body.valore).toBe('25.00');
    expect(res.body.valore_precedente).toBe('15.00');
    expect(await getQuotaAnnuale()).toBe(25);
  });

  test('un socio non admin non puo\' cambiarla', async () => {
    const res = await request(app).put(`${API}/quota_annuale`)
      .set('Authorization', socio.auth).send({ valore: 1 });

    expect(res.status).toBe(403);
    expect(await getQuotaAnnuale()).toBe(15);
  });

  test('accetta la virgola come separatore decimale', async () => {
    const res = await request(app).put(`${API}/quota_annuale`)
      .set('Authorization', admin.auth).send({ valore: '12,50' });

    expect(res.status).toBe(200);
    expect(res.body.valore).toBe('12.50');
  });

  test('normalizza sempre a due decimali', async () => {
    const res = await request(app).put(`${API}/quota_annuale`)
      .set('Authorization', admin.auth).send({ valore: 20 });
    expect(res.body.valore).toBe('20.00');
  });

  test('rifiuta valori non numerici, negativi o assurdi', async () => {
    for (const valore of ['gratis', -5, 99999]) {
      const res = await request(app).put(`${API}/quota_annuale`)
        .set('Authorization', admin.auth).send({ valore });
      expect(res.status).toBe(400);
    }
    expect(await getQuotaAnnuale()).toBe(15);
  });

  test('rifiuta il valore vuoto o mancante', async () => {
    const vuoto = await request(app).put(`${API}/quota_annuale`)
      .set('Authorization', admin.auth).send({ valore: '   ' });
    expect(vuoto.status).toBe(400);

    const mancante = await request(app).put(`${API}/quota_annuale`)
      .set('Authorization', admin.auth).send({});
    expect(mancante.status).toBe(400);
  });

  test('una quota gratuita (zero) e\' ammessa', async () => {
    const res = await request(app).put(`${API}/quota_annuale`)
      .set('Authorization', admin.auth).send({ valore: 0 });
    expect(res.status).toBe(200);
    expect(await getQuotaAnnuale()).toBe(0);
  });

  test('una chiave non prevista risponde 404', async () => {
    const res = await request(app).put(`${API}/colore_preferito`)
      .set('Authorization', admin.auth).send({ valore: 'blu' });
    expect(res.status).toBe(404);

    // E non viene scritta nel database.
    const righe = await sequelize.query(
      "SELECT chiave FROM impostazioni WHERE chiave = 'colore_preferito'",
      { type: sequelize.QueryTypes.SELECT }
    );
    expect(righe).toHaveLength(0);
  });
});

describe('Effetto sulle quote', () => {
  test('la nuova quota usa l\'importo aggiornato', async () => {
    await request(app).put(`${API}/quota_annuale`)
      .set('Authorization', admin.auth).send({ valore: 30 });

    const res = await request(app)
      .post(`/api/v1/users/${socio.utente.id}/quote/crea-e-paga`)
      .set('Authorization', socio.auth)
      .send({});

    // La chiamata puo' fallire sul passaggio PayPal, che nei test non e'
    // raggiungibile: quel che conta e' che la riga sia stata scritta a 30 euro
    // e che la richiesta non sia stata respinta prima di arrivarci.
    const quota = await quotaDi(socio.utente.id);
    expect(quota).toBeDefined();
    expect(Number(quota.importo)).toBe(30);
    expect([400, 401, 403, 404]).not.toContain(res.status);
  });

  test('senza il flag, le quote gia\' esistenti restano al vecchio importo', async () => {
    await sequelize.query(
      `INSERT INTO quote_associative (user_id, anno, importo, pagata)
       VALUES (:id, :anno, 15.00, false)`,
      { replacements: { id: socio.utente.id, anno: new Date().getFullYear() } }
    );

    const res = await request(app).put(`${API}/quota_annuale`)
      .set('Authorization', admin.auth).send({ valore: 40 });

    expect(res.body.quote_aggiornate).toBe(0);
    expect(Number((await quotaDi(socio.utente.id)).importo)).toBe(15);
  });

  test('con il flag, le quote non pagate dell\'anno in corso vengono allineate', async () => {
    await sequelize.query(
      `INSERT INTO quote_associative (user_id, anno, importo, pagata)
       VALUES (:id, :anno, 15.00, false)`,
      { replacements: { id: socio.utente.id, anno: new Date().getFullYear() } }
    );

    const res = await request(app).put(`${API}/quota_annuale`)
      .set('Authorization', admin.auth)
      .send({ valore: 40, aggiorna_quote_non_pagate: true });

    expect(res.body.quote_aggiornate).toBe(1);
    expect(Number((await quotaDi(socio.utente.id)).importo)).toBe(40);
  });

  test('le quote gia\' pagate non vengono mai toccate', async () => {
    await sequelize.query(
      `INSERT INTO quote_associative (user_id, anno, importo, pagata, data_pagamento)
       VALUES (:id, :anno, 15.00, true, CURRENT_DATE)`,
      { replacements: { id: socio.utente.id, anno: new Date().getFullYear() } }
    );

    const res = await request(app).put(`${API}/quota_annuale`)
      .set('Authorization', admin.auth)
      .send({ valore: 40, aggiorna_quote_non_pagate: true });

    expect(res.body.quote_aggiornate).toBe(0);
    expect(Number((await quotaDi(socio.utente.id)).importo)).toBe(15);
  });

  test('le quote in attesa di validazione non vengono toccate', async () => {
    await sequelize.query(
      `INSERT INTO quote_associative (user_id, anno, importo, pagata, stato_validazione)
       VALUES (:id, :anno, 15.00, false, 'in_attesa')`,
      { replacements: { id: socio.utente.id, anno: new Date().getFullYear() } }
    );

    const res = await request(app).put(`${API}/quota_annuale`)
      .set('Authorization', admin.auth)
      .send({ valore: 40, aggiorna_quote_non_pagate: true });

    expect(res.body.quote_aggiornate).toBe(0);
    expect(Number((await quotaDi(socio.utente.id)).importo)).toBe(15);
  });

  test('le quote degli anni passati non vengono toccate', async () => {
    const annoPassato = new Date().getFullYear() - 1;
    await sequelize.query(
      `INSERT INTO quote_associative (user_id, anno, importo, pagata)
       VALUES (:id, :anno, 15.00, false)`,
      { replacements: { id: socio.utente.id, anno: annoPassato } }
    );

    const res = await request(app).put(`${API}/quota_annuale`)
      .set('Authorization', admin.auth)
      .send({ valore: 40, aggiorna_quote_non_pagate: true });

    expect(res.body.quote_aggiornate).toBe(0);
    expect(Number((await quotaDi(socio.utente.id, annoPassato)).importo)).toBe(15);
  });
});

describe('Storico delle variazioni', () => {
  test('ogni cambio viene registrato con autore e valori', async () => {
    await request(app).put(`${API}/quota_annuale`)
      .set('Authorization', admin.auth).send({ valore: 20 });
    await request(app).put(`${API}/quota_annuale`)
      .set('Authorization', admin.auth).send({ valore: 25 });

    const res = await request(app).get(`${API}/quota_annuale/storico`)
      .set('Authorization', admin.auth);

    expect(res.status).toBe(200);
    expect(res.body.storico).toHaveLength(2);
    // Ordine decrescente: il piu' recente per primo.
    expect(res.body.storico[0].valore_precedente).toBe('20.00');
    expect(res.body.storico[0].valore_nuovo).toBe('25.00');
    expect(res.body.storico[1].valore_precedente).toBe('15.00');
    expect(res.body.storico[1].valore_nuovo).toBe('20.00');
    expect(res.body.storico[0].nome).toBe(admin.utente.nome);
  });

  test('lo storico e\' riservato all\'admin', async () => {
    const res = await request(app).get(`${API}/quota_annuale/storico`)
      .set('Authorization', socio.auth);
    expect(res.status).toBe(403);
  });

  test('storico di una chiave inesistente: 404', async () => {
    const res = await request(app).get(`${API}/inventata/storico`)
      .set('Authorization', admin.auth);
    expect(res.status).toBe(404);
  });
});


describe('Interruttore dei messaggi interni', () => {
  const MSG = '/api/v1/messaggi';

  test('di partenza la chat e\' accesa e i messaggi rispondono', async () => {
    const res = await request(app).get(`${MSG}/conversazioni`).set('Authorization', socio.auth);
    expect(res.status).not.toBe(503);
  });

  test('un admin la spegne e il server rifiuta gli invii', async () => {
    const spegni = await request(app).put(`${API}/chat_attiva`)
      .set('Authorization', admin.auth).send({ valore: 'false' });
    expect(spegni.status).toBe(200);
    expect(spegni.body.valore).toBe('false');

    // Il blocco vale anche per chi chiama l'API direttamente, non solo per
    // chi passa dal menu dell'app.
    const invio = await request(app).post(MSG)
      .set('Authorization', socio.auth)
      .send({ destinatario_id: admin.utente.id, contenuto: 'ciao' });
    expect(invio.status).toBe(503);
    expect(invio.body.chat_attiva).toBe(false);

    const lettura = await request(app).get(`${MSG}/conversazioni`).set('Authorization', socio.auth);
    expect(lettura.status).toBe(503);
  });

  test('a chat spenta il contatore risponde zero invece di un errore', async () => {
    await request(app).put(`${API}/chat_attiva`)
      .set('Authorization', admin.auth).send({ valore: 'false' });

    // L'intestazione di ogni pagina interroga questo indirizzo di continuo:
    // deve restare silenzioso, altrimenti ogni socio vedrebbe errori in
    // console per una sezione che e' soltanto chiusa.
    const res = await request(app).get(`${MSG}/non-letti`).set('Authorization', socio.auth);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
  });

  test('riaccendendola i messaggi tornano', async () => {
    await request(app).put(`${API}/chat_attiva`)
      .set('Authorization', admin.auth).send({ valore: 'false' });
    const riaccendi = await request(app).put(`${API}/chat_attiva`)
      .set('Authorization', admin.auth).send({ valore: 'true' });
    expect(riaccendi.body.valore).toBe('true');

    const res = await request(app).get(`${MSG}/conversazioni`).set('Authorization', socio.auth);
    expect(res.status).not.toBe(503);
  });

  test('solo un admin puo\' spegnerla', async () => {
    const res = await request(app).put(`${API}/chat_attiva`)
      .set('Authorization', socio.auth).send({ valore: 'false' });
    expect(res.status).toBe(403);
  });

  test('accetta si/no e rifiuta i valori che non sono ne\' vero ne\' falso', async () => {
    const si = await request(app).put(`${API}/chat_attiva`)
      .set('Authorization', admin.auth).send({ valore: 'no' });
    expect(si.body.valore).toBe('false');

    const boh = await request(app).put(`${API}/chat_attiva`)
      .set('Authorization', admin.auth).send({ valore: 'forse' });
    expect(boh.status).toBe(400);
  });
});
