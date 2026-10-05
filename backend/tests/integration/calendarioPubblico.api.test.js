const request = require('supertest');

const app = require('../../src/server');
const { sequelize } = require('../../src/config/database');
const { creaUtenteConToken, pulisciUtentiTest } = require('../helpers/fixtures');

/**
 * Il calendario pubblico e' l'unica pagina dell'app aperta a chi non ha un
 * account: questi test fissano che si apra solo col codice giusto, che il
 * codice non trapeli, e che dalla pagina non escano telefoni ed email.
 */

const LINK = '/api/v1/impostazioni/calendario-pubblico';
const PUBBLICO = '/api/v1/pubblico/calendario';
const DATA = '2027-05-08';

let admin;
let socio;
let volontaria;

async function pulisci() {
  await sequelize.query(`DELETE FROM turni_cucina WHERE data_turno = '${DATA}'`);
  await sequelize.query("DELETE FROM impostazioni WHERE chiave = 'calendario_pubblico_codice'");
  await pulisciUtentiTest(sequelize);
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
  socio = await creaUtenteConToken(sequelize, { ruolo: 'socio_volontario', categoria_socio: 'volontario' });
  volontaria = await creaUtenteConToken(sequelize, { ruolo: 'socio_volontario', categoria_socio: 'volontario' });
  await sequelize.query(
    "UPDATE users SET nome = 'Roberta', cognome = 'Prova', telefono = '333 9998887' WHERE id = :id",
    { replacements: { id: volontaria.utente.id } }
  );

  const [turno] = await sequelize.query(
    `INSERT INTO turni_cucina (data_turno, tipo_turno, numero_porzioni, note_generali, created_by)
     VALUES (:d, 'cena', 55, 'nota interna da non mostrare', :u) RETURNING id`,
    { replacements: { d: DATA, u: admin.utente.id }, type: sequelize.QueryTypes.SELECT }
  );
  await sequelize.query(
    `INSERT INTO slot_turno (turno_id, tipo_slot, numero_porzioni, stato, user_id, note) VALUES
       (:t, 'frutta', 20, 'assegnato', :v, '25/09 10:00 · Preso da Roberta Prova con il sondaggio WhatsApp'),
       (:t, 'frutta', 20, 'libero', NULL, NULL),
       (:t, 'primi', 15, 'libero', NULL, NULL)`,
    { replacements: { t: turno.id, v: volontaria.utente.id } }
  );
});

async function creaLink() {
  const res = await request(app).post(LINK).set('Authorization', admin.auth);
  return res.body.codice;
}

describe('Il link', () => {
  test('finche non lo si crea, nessun codice apre il calendario', async () => {
    const res = await request(app).get(`${PUBBLICO}/qualsiasi?mese=2027-05`);
    expect(res.status).toBe(404);
  });

  test('lo crea solo un admin', async () => {
    const res = await request(app).post(LINK).set('Authorization', socio.auth);
    expect(res.status).toBe(403);
  });

  test('con il codice giusto si apre senza accesso, con uno sbagliato no', async () => {
    const codice = await creaLink();
    expect(codice).toMatch(/^[A-Za-z0-9_-]{20,}$/);

    expect((await request(app).get(`${PUBBLICO}/${codice}?mese=2027-05`)).status).toBe(200);
    expect((await request(app).get(`${PUBBLICO}/${codice}x?mese=2027-05`)).status).toBe(404);
  });

  test('cambiando il link, quello vecchio smette di funzionare', async () => {
    const vecchio = await creaLink();
    const nuovo = await creaLink();
    expect(nuovo).not.toBe(vecchio);
    expect((await request(app).get(`${PUBBLICO}/${vecchio}?mese=2027-05`)).status).toBe(404);
    expect((await request(app).get(`${PUBBLICO}/${nuovo}?mese=2027-05`)).status).toBe(200);
  });

  test('disattivato, non si apre piu', async () => {
    const codice = await creaLink();
    await request(app).delete(LINK).set('Authorization', admin.auth);
    expect((await request(app).get(`${PUBBLICO}/${codice}?mese=2027-05`)).status).toBe(404);
  });

  test('il codice non compare nelle impostazioni che ogni socio puo leggere', async () => {
    const codice = await creaLink();
    const res = await request(app).get('/api/v1/impostazioni').set('Authorization', socio.auth);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(codice);
  });
});

describe('Cosa mostra', () => {
  test('i turni del mese, con le pietanze in ordine e chi porta cosa', async () => {
    const codice = await creaLink();
    const res = await request(app).get(`${PUBBLICO}/${codice}?mese=2027-05`);

    expect(res.body.mese).toBe('2027-05');
    const turno = res.body.turni.find((t) => t.data === DATA);
    expect(turno).toMatchObject({ tipo: 'cena', porzioni: 55, totale: 3, coperti: 1 });
    expect(turno.portate.map((p) => p.tipo)).toEqual(['primi', 'frutta']);

    const frutta = turno.portate.find((p) => p.tipo === 'frutta');
    // I due posti nascono nello stesso istante: l'ordine fra loro non conta.
    expect(frutta.posti).toHaveLength(2);
    expect(frutta.posti).toEqual(expect.arrayContaining([
      { quantita: '20 pezzi', persona: 'Roberta Prova' },
      { quantita: '20 pezzi', persona: null },
    ]));
  });

  test('non escono telefoni, email, identificativi ne note', async () => {
    const codice = await creaLink();
    const testo = JSON.stringify((await request(app).get(`${PUBBLICO}/${codice}?mese=2027-05`)).body);

    expect(testo).not.toContain('333');
    expect(testo).not.toContain('@');
    expect(testo).not.toContain(volontaria.utente.id);
    expect(testo).not.toContain('nota interna');
    expect(testo).not.toContain('sondaggio WhatsApp');
  });

  test('un mese scritto male non rompe niente: si torna al mese corrente', async () => {
    const codice = await creaLink();
    const res = await request(app).get(`${PUBBLICO}/${codice}?mese=2027-13';DROP`);
    expect(res.status).toBe(200);
    expect(res.body.mese).toMatch(/^\d{4}-\d{2}$/);
  });
});
