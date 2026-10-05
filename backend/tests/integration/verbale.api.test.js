const request = require('supertest');

const app = require('../../src/server');
const { sequelize } = require('../../src/config/database');
const { pulisciVotazioni } = require('../helpers/testDb');
const { creaUtenteConToken, pulisciUtentiTest } = require('../helpers/fixtures');
const { estraiTestoNormalizzato } = require('../helpers/pdf');

const API = '/api/v1/votazioni';

let admin;
let socio;

/** Crea, apre, fa votare e chiude una votazione. Restituisce id e candidati. */
async function votazioneConclusa() {
  const creazione = await request(app).post(API).set('Authorization', admin.auth).send({
    titolo: 'Rinnovo consiglio direttivo',
    seggi_da_eleggere: 3,
    preferenze_max: 3,
    candidati: [
      { nome: 'Anna', cognome: 'Alfieri' },
      { nome: 'Bruno', cognome: 'Bianchi' },
      { nome: 'Carla', cognome: 'Conti' },
      { nome: 'Dario', cognome: 'Desiderio' },
    ],
  });
  const votazione = creazione.body.votazione;

  await request(app).post(`${API}/${votazione.id}/apri`).set('Authorization', admin.auth);

  const dettaglio = await request(app).get(`${API}/${votazione.id}`).set('Authorization', admin.auth);
  const candidati = dettaglio.body.candidati;

  await request(app).post(`${API}/${votazione.id}/vota`).set('Authorization', socio.auth)
    .send({ candidati: [candidati[0].id, candidati[1].id, candidati[2].id] });
  await request(app).post(`${API}/${votazione.id}/vota`).set('Authorization', admin.auth)
    .send({ candidati: [candidati[0].id] });

  await request(app).post(`${API}/${votazione.id}/chiudi`).set('Authorization', admin.auth);

  return { votazione, candidati };
}

beforeAll(async () => {
  await sequelize.authenticate();
});

afterAll(async () => {
  // Le votazioni residue trattengono i loro creatori via votazioni.created_by,
  // che non ha ON DELETE CASCADE: senza questa pulizia il file di test
  // successivo non riesce piu' a cancellare gli utenti di prova.
  await pulisciVotazioni(sequelize);
  await pulisciUtentiTest(sequelize);
  await sequelize.close();
});

beforeEach(async () => {
  await pulisciVotazioni(sequelize);
  await pulisciUtentiTest(sequelize);
  admin = await creaUtenteConToken(sequelize, { ruolo: 'admin', categoria_socio: 'volontario' });
  socio = await creaUtenteConToken(sequelize, { ruolo: 'socio_ordinario', categoria_socio: 'ordinario' });
});

describe('Verbale PDF', () => {
  test('non e\' scaricabile finche\' le urne sono aperte', async () => {
    const creazione = await request(app).post(API).set('Authorization', admin.auth).send({
      titolo: 'In corso',
      seggi_da_eleggere: 1,
      candidati: [{ nome: 'Anna', cognome: 'Alfieri' }],
    });
    const id = creazione.body.votazione.id;

    const inBozza = await request(app).get(`${API}/${id}/verbale`).set('Authorization', admin.auth);
    expect(inBozza.status).toBe(403);

    await request(app).post(`${API}/${id}/apri`).set('Authorization', admin.auth);
    const aperta = await request(app).get(`${API}/${id}/verbale`).set('Authorization', admin.auth);
    expect(aperta.status).toBe(403);
  });

  test('a urne chiuse restituisce un PDF con i dati dello scrutinio', async () => {
    const { votazione } = await votazioneConclusa();

    const res = await request(app)
      .get(`${API}/${votazione.id}/verbale`)
      .set('Authorization', admin.auth)
      .buffer(true)
      .parse((r, cb) => {
        const pezzi = [];
        r.on('data', (c) => pezzi.push(Buffer.from(c)));
        r.on('end', () => cb(null, Buffer.concat(pezzi)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain('.pdf');
    expect(res.body.slice(0, 5).toString()).toBe('%PDF-');

    const testo = estraiTestoNormalizzato(res.body);
    expect(testo).toContain('VERBALE DI ASSEMBLEA ORDINARIA DEI SOCI');
    expect(testo).toContain('Rinnovo consiglio direttivo');
    expect(testo).toContain('Aventi diritto al voto: 2');
    expect(testo).toContain('Votanti: 2');
    expect(testo).toContain('Alfieri');
  });

  test('e\' accessibile anche al socio non admin (i risultati sono pubblici)', async () => {
    const { votazione } = await votazioneConclusa();
    const res = await request(app).get(`${API}/${votazione.id}/verbale`).set('Authorization', socio.auth);
    expect(res.status).toBe(200);
  });
});

describe('Export CSV', () => {
  test('non e\' disponibile a urne aperte', async () => {
    const creazione = await request(app).post(API).set('Authorization', admin.auth).send({
      titolo: 'In corso', seggi_da_eleggere: 1, candidati: [{ nome: 'A', cognome: 'B' }],
    });
    const id = creazione.body.votazione.id;
    await request(app).post(`${API}/${id}/apri`).set('Authorization', admin.auth);

    const res = await request(app).get(`${API}/${id}/export`).set('Authorization', admin.auth);
    expect(res.status).toBe(403);
  });

  test('e\' riservato all\'admin', async () => {
    const { votazione } = await votazioneConclusa();
    const res = await request(app).get(`${API}/${votazione.id}/export`).set('Authorization', socio.auth);
    expect(res.status).toBe(403);
  });

  test('produce un CSV con una riga per candidato e gli eletti marcati', async () => {
    const { votazione } = await votazioneConclusa();

    const res = await request(app).get(`${API}/${votazione.id}/export`).set('Authorization', admin.auth);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);

    const righe = res.text.replace(/^﻿/, '').trim().split('\n');
    // Intestazione + 4 candidati.
    expect(righe).toHaveLength(5);
    expect(righe[0]).toContain('"Posizione"');
    expect(righe[0]).toContain('"Eletto"');

    // Alfieri ha 2 preferenze ed e' primo.
    expect(righe[1]).toContain('"Alfieri"');
    expect(righe[1]).toContain(',2,');
    expect(righe[1]).toContain('SI');

    // Desiderio non ha preferenze e non e' eletto.
    const desiderio = righe.find((r) => r.includes('Desiderio'));
    expect(desiderio).toContain(',0,');
    expect(desiderio.endsWith('NO,NO')).toBe(true);
  });
});

describe('Dati del verbale e registro presenze', () => {
  const URL = (id) => `${API}/${id}/dati-verbale`;

  test('sono riservati all\'admin', async () => {
    const { votazione } = await votazioneConclusa();
    expect((await request(app).get(URL(votazione.id)).set('Authorization', socio.auth)).status).toBe(403);
    expect((await request(app).put(URL(votazione.id)).set('Authorization', socio.auth).send({})).status).toBe(403);
  });

  test('restituiscono il registro con votanti e quota dell\'anno', async () => {
    const { votazione } = await votazioneConclusa();
    const anno = new Date().getFullYear();
    await sequelize.query(
      'INSERT INTO quote_associative (user_id, anno, importo, pagata) VALUES (:id, :anno, 15, true)',
      { replacements: { id: socio.utente.id, anno } }
    );

    const res = await request(app).get(URL(votazione.id)).set('Authorization', admin.auth);
    expect(res.status).toBe(200);
    expect(res.body.registro).toHaveLength(2);
    const rigaSocio = res.body.registro.find((r) => r.user_id === socio.utente.id);
    expect(rigaSocio.ha_votato).toBe(true);
    expect(rigaSocio.quota_in_regola).toBe(true);
    expect(res.body.presenze.votanti_non_in_regola).toBe(1);
  });

  test('salvano seduta e presenze, e il verbale li riporta', async () => {
    const { votazione } = await votazioneConclusa();

    const res = await request(app).put(URL(votazione.id)).set('Authorization', admin.auth).send({
      dati: {
        presidente: 'Giuseppe Marzullo',
        segretario: 'Alfredo Micoloni',
        convocazione: 'seconda',
        componenti_consiglio: 5,
        rinnovo_parziale: true,
      },
      registro: [
        { user_id: admin.utente.id, presenza: 'in_sala' },
        { user_id: socio.utente.id, presenza: 'delega', delegato_user_id: admin.utente.id },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.presenze.per_delega).toBe(1);

    const pdf = await request(app)
      .get(`${API}/${votazione.id}/verbale`)
      .set('Authorization', admin.auth)
      .buffer(true)
      .parse((r, cb) => {
        const pezzi = [];
        r.on('data', (c) => pezzi.push(Buffer.from(c)));
        r.on('end', () => cb(null, Buffer.concat(pezzi)));
      });
    const testo = estraiTestoNormalizzato(pdf.body).replace(/\s+/g, '');
    expect(testo).toContain('GiuseppeMarzullo');
    expect(testo).toContain('secondaconvocazione');
    expect(testo).toContain('REGISTROPRESENZE');
    expect(testo).toContain('perdelega');
  });

  test('rifiutano deleghe a chi non e\' presente e consiglieri fuori dai limiti', async () => {
    const { votazione } = await votazioneConclusa();

    const delega = await request(app).put(URL(votazione.id)).set('Authorization', admin.auth).send({
      registro: [
        { user_id: admin.utente.id, presenza: 'assente' },
        { user_id: socio.utente.id, presenza: 'delega', delegato_user_id: admin.utente.id },
      ],
    });
    expect(delega.status).toBe(400);

    const consiglieri = await request(app).put(URL(votazione.id)).set('Authorization', admin.auth)
      .send({ dati: { componenti_consiglio: 9 } });
    expect(consiglieri.status).toBe(400);
  });

  test('non esistono per una votazione in bozza', async () => {
    const creazione = await request(app).post(API).set('Authorization', admin.auth).send({
      titolo: 'Bozza', seggi_da_eleggere: 1, candidati: [{ nome: 'A', cognome: 'B' }],
    });
    const res = await request(app).get(URL(creazione.body.votazione.id)).set('Authorization', admin.auth);
    expect(res.status).toBe(409);
  });
});
