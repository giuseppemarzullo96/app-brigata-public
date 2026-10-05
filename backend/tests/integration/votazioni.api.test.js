const request = require('supertest');

const app = require('../../src/server');
const { sequelize } = require('../../src/config/database');
const { pulisciVotazioni } = require('../helpers/testDb');
const { creaUtenteConToken, pulisciUtentiTest } = require('../helpers/fixtures');

const API = '/api/v1/votazioni';

let admin;
let socio;

/** Crea una votazione in bozza con N candidati e la restituisce. */
async function creaVotazione(overrides = {}, numCandidati = 5) {
  const candidati = Array.from({ length: numCandidati }, (_, i) => ({
    nome: `Nome${i + 1}`,
    cognome: `Cognome${i + 1}`,
  }));

  const res = await request(app)
    .post(API)
    .set('Authorization', admin.auth)
    .send({
      titolo: 'Rinnovo consiglio direttivo',
      seggi_da_eleggere: 3,
      preferenze_max: 3,
      candidati,
      ...overrides,
    });

  expect(res.status).toBe(201);
  return res.body.votazione;
}

async function candidatiDi(votazioneId, token = admin.auth) {
  const res = await request(app).get(`${API}/${votazioneId}`).set('Authorization', token);
  return res.body.candidati;
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
  admin = await creaUtenteConToken(sequelize, { ruolo: 'admin', categoria_socio: 'volontario', nome: 'Admin' });
  socio = await creaUtenteConToken(sequelize, { ruolo: 'socio_ordinario', categoria_socio: 'ordinario', nome: 'Socio' });
});

describe('Ciclo di vita completo', () => {
  test('bozza -> apertura -> voti -> chiusura -> risultati', async () => {
    const votazione = await creaVotazione();
    expect(votazione.stato).toBe('bozza');

    const apertura = await request(app)
      .post(`${API}/${votazione.id}/apri`)
      .set('Authorization', admin.auth);
    expect(apertura.status).toBe(200);
    // Admin + socio sono entrambi aventi diritto.
    expect(apertura.body.aventi_diritto).toBe(2);

    const candidati = await candidatiDi(votazione.id);

    // Il socio vota 3 preferenze, l'admin 2.
    const v1 = await request(app)
      .post(`${API}/${votazione.id}/vota`)
      .set('Authorization', socio.auth)
      .send({ candidati: [candidati[0].id, candidati[1].id, candidati[2].id] });
    expect(v1.status).toBe(200);
    expect(v1.body.preferenze_espresse).toBe(3);

    const v2 = await request(app)
      .post(`${API}/${votazione.id}/vota`)
      .set('Authorization', admin.auth)
      .send({ candidati: [candidati[0].id, candidati[3].id] });
    expect(v2.status).toBe(200);

    const chiusura = await request(app)
      .post(`${API}/${votazione.id}/chiudi`)
      .set('Authorization', admin.auth);
    expect(chiusura.status).toBe(200);

    const risultati = await request(app)
      .get(`${API}/${votazione.id}/risultati`)
      .set('Authorization', socio.auth);
    expect(risultati.status).toBe(200);

    const esito = risultati.body.esito;
    expect(esito.aventi_diritto).toBe(2);
    expect(esito.votanti).toBe(2);
    expect(esito.affluenza_percentuale).toBe(100);
    expect(esito.preferenze_espresse).toBe(5);

    const voti = Object.fromEntries(esito.risultati.map((r) => [r.id, r.voti]));
    expect(voti[candidati[0].id]).toBe(2);
    expect(voti[candidati[1].id]).toBe(1);
    expect(voti[candidati[3].id]).toBe(1);
    expect(voti[candidati[4].id]).toBe(0);
  });

  test('la scheda bianca conta nell\'affluenza ma non assegna preferenze', async () => {
    const votazione = await creaVotazione();
    await request(app).post(`${API}/${votazione.id}/apri`).set('Authorization', admin.auth);

    const bianca = await request(app)
      .post(`${API}/${votazione.id}/vota`)
      .set('Authorization', socio.auth)
      .send({ scheda_bianca: true });
    expect(bianca.status).toBe(200);
    expect(bianca.body.preferenze_espresse).toBe(0);

    await request(app).post(`${API}/${votazione.id}/chiudi`).set('Authorization', admin.auth);
    const { body } = await request(app)
      .get(`${API}/${votazione.id}/risultati`)
      .set('Authorization', admin.auth);

    expect(body.esito.votanti).toBe(1);
    expect(body.esito.schede_bianche).toBe(1);
    expect(body.esito.schede_valide).toBe(0);
    expect(body.esito.preferenze_espresse).toBe(0);
  });
});

describe('Autorizzazioni', () => {
  test('senza token tutte le rotte rispondono 401', async () => {
    const votazione = await creaVotazione();
    const rotte = [
      request(app).get(API),
      request(app).get(`${API}/${votazione.id}`),
      request(app).post(API).send({ titolo: 'x', seggi_da_eleggere: 1 }),
      request(app).post(`${API}/${votazione.id}/vota`).send({ candidati: [] }),
    ];
    const esiti = await Promise.all(rotte);
    esiti.forEach((r) => expect(r.status).toBe(401));
  });

  test('un socio non admin non puo\' creare, aprire, chiudere o modificare', async () => {
    const votazione = await creaVotazione();

    const creazione = await request(app).post(API).set('Authorization', socio.auth)
      .send({ titolo: 'Abusiva', seggi_da_eleggere: 1 });
    expect(creazione.status).toBe(403);

    const apertura = await request(app).post(`${API}/${votazione.id}/apri`)
      .set('Authorization', socio.auth);
    expect(apertura.status).toBe(403);

    const modifica = await request(app).put(`${API}/${votazione.id}`)
      .set('Authorization', socio.auth).send({ titolo: 'Cambiato' });
    expect(modifica.status).toBe(403);

    const candidato = await request(app).post(`${API}/${votazione.id}/candidati`)
      .set('Authorization', socio.auth).send({ nome: 'A', cognome: 'B' });
    expect(candidato.status).toBe(403);

    const chiusura = await request(app).post(`${API}/${votazione.id}/chiudi`)
      .set('Authorization', socio.auth);
    expect(chiusura.status).toBe(403);
  });

  test('il socio non vede le votazioni in bozza', async () => {
    const votazione = await creaVotazione();

    const elenco = await request(app).get(API).set('Authorization', socio.auth);
    expect(elenco.body.votazioni.find((v) => v.id === votazione.id)).toBeUndefined();

    const dettaglio = await request(app).get(`${API}/${votazione.id}`).set('Authorization', socio.auth);
    expect(dettaglio.status).toBe(404);

    // L'admin invece la vede.
    const elencoAdmin = await request(app).get(API).set('Authorization', admin.auth);
    expect(elencoAdmin.body.votazioni.find((v) => v.id === votazione.id)).toBeDefined();
  });

  test('l\'affluenza in diretta e\' riservata all\'admin', async () => {
    const votazione = await creaVotazione();
    await request(app).post(`${API}/${votazione.id}/apri`).set('Authorization', admin.auth);

    const socioRes = await request(app).get(`${API}/${votazione.id}/affluenza`)
      .set('Authorization', socio.auth);
    expect(socioRes.status).toBe(403);

    const adminRes = await request(app).get(`${API}/${votazione.id}/affluenza`)
      .set('Authorization', admin.auth);
    expect(adminRes.status).toBe(200);
  });
});

describe('Segretezza dello scrutinio', () => {
  test('i risultati sono negati a urne aperte, anche all\'admin', async () => {
    const votazione = await creaVotazione();
    await request(app).post(`${API}/${votazione.id}/apri`).set('Authorization', admin.auth);

    const candidati = await candidatiDi(votazione.id);
    await request(app).post(`${API}/${votazione.id}/vota`).set('Authorization', socio.auth)
      .send({ candidati: [candidati[0].id] });

    const admRes = await request(app).get(`${API}/${votazione.id}/risultati`)
      .set('Authorization', admin.auth);
    expect(admRes.status).toBe(403);
    expect(admRes.body.stato).toBe('aperta');

    const socioRes = await request(app).get(`${API}/${votazione.id}/risultati`)
      .set('Authorization', socio.auth);
    expect(socioRes.status).toBe(403);
  });

  test('i risultati sono negati anche su votazione in bozza', async () => {
    const votazione = await creaVotazione();
    const res = await request(app).get(`${API}/${votazione.id}/risultati`)
      .set('Authorization', admin.auth);
    expect(res.status).toBe(403);
  });

  test('l\'affluenza non espone alcun conteggio per candidato', async () => {
    const votazione = await creaVotazione();
    await request(app).post(`${API}/${votazione.id}/apri`).set('Authorization', admin.auth);
    const candidati = await candidatiDi(votazione.id);
    await request(app).post(`${API}/${votazione.id}/vota`).set('Authorization', socio.auth)
      .send({ candidati: [candidati[0].id] });

    const res = await request(app).get(`${API}/${votazione.id}/affluenza`)
      .set('Authorization', admin.auth);

    expect(res.body.votanti).toBe(1);
    const serializzato = JSON.stringify(res.body);
    candidati.forEach((c) => expect(serializzato).not.toContain(c.id));
    expect(serializzato).not.toMatch(/voti/i);
  });

  test('il dettaglio a urne aperte non rivela i conteggi', async () => {
    const votazione = await creaVotazione();
    await request(app).post(`${API}/${votazione.id}/apri`).set('Authorization', admin.auth);
    const candidati = await candidatiDi(votazione.id);
    await request(app).post(`${API}/${votazione.id}/vota`).set('Authorization', socio.auth)
      .send({ candidati: [candidati[0].id, candidati[1].id] });

    const res = await request(app).get(`${API}/${votazione.id}`).set('Authorization', admin.auth);
    expect(JSON.stringify(res.body)).not.toMatch(/"voti"/);
  });

  test('nessun record collega un voto al suo elettore', async () => {
    const votazione = await creaVotazione();
    await request(app).post(`${API}/${votazione.id}/apri`).set('Authorization', admin.auth);
    const candidati = await candidatiDi(votazione.id);
    await request(app).post(`${API}/${votazione.id}/vota`).set('Authorization', socio.auth)
      .send({ candidati: [candidati[0].id] });

    // Nelle tabelle dell'urna non esiste alcuna colonna riconducibile all'utente.
    const colonne = await sequelize.query(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_name IN ('schede_votazione', 'voti_votazione')`,
      { type: sequelize.QueryTypes.SELECT }
    );
    const sospette = colonne.filter((c) => /user|socio|elettore|votante/i.test(c.column_name));
    expect(sospette).toEqual([]);

    // L'unica traccia e' che ha votato, senza il contenuto della scheda.
    const [traccia] = await sequelize.query(
      `SELECT ha_votato FROM aventi_diritto_votazione
        WHERE votazione_id = :v AND user_id = :u`,
      { replacements: { v: votazione.id, u: socio.utente.id }, type: sequelize.QueryTypes.SELECT }
    );
    expect(traccia.ha_votato).toBe(true);
  });

  test('l\'audit log non registra il contenuto della scheda', async () => {
    const votazione = await creaVotazione();
    await request(app).post(`${API}/${votazione.id}/apri`).set('Authorization', admin.auth);
    const candidati = await candidatiDi(votazione.id);

    await request(app).post(`${API}/${votazione.id}/vota`).set('Authorization', socio.auth)
      .send({ candidati: [candidati[0].id, candidati[1].id] });

    // Attende l'eventuale scrittura asincrona dell'audit log.
    await new Promise((r) => setTimeout(r, 300));

    const righe = await sequelize.query(
      `SELECT dettagli::text AS dettagli FROM audit_log WHERE user_id = :u`,
      { replacements: { u: socio.utente.id }, type: sequelize.QueryTypes.SELECT }
    );

    righe.forEach((riga) => {
      candidati.forEach((c) => expect(riga.dettagli).not.toContain(c.id));
    });
  });
});

describe('Integrita\' del voto', () => {
  test('non si puo\' votare due volte', async () => {
    const votazione = await creaVotazione();
    await request(app).post(`${API}/${votazione.id}/apri`).set('Authorization', admin.auth);
    const candidati = await candidatiDi(votazione.id);

    const primo = await request(app).post(`${API}/${votazione.id}/vota`)
      .set('Authorization', socio.auth).send({ candidati: [candidati[0].id] });
    expect(primo.status).toBe(200);

    const secondo = await request(app).post(`${API}/${votazione.id}/vota`)
      .set('Authorization', socio.auth).send({ candidati: [candidati[1].id] });
    expect(secondo.status).toBe(409);

    const [{ totale }] = await sequelize.query(
      `SELECT COUNT(*)::int AS totale FROM schede_votazione WHERE votazione_id = :v`,
      { replacements: { v: votazione.id }, type: sequelize.QueryTypes.SELECT }
    );
    expect(totale).toBe(1);
  });

  test('due invii simultanei producono una sola scheda', async () => {
    const votazione = await creaVotazione();
    await request(app).post(`${API}/${votazione.id}/apri`).set('Authorization', admin.auth);
    const candidati = await candidatiDi(votazione.id);

    const [a, b] = await Promise.all([
      request(app).post(`${API}/${votazione.id}/vota`).set('Authorization', socio.auth)
        .send({ candidati: [candidati[0].id] }),
      request(app).post(`${API}/${votazione.id}/vota`).set('Authorization', socio.auth)
        .send({ candidati: [candidati[1].id] }),
    ]);

    const esiti = [a.status, b.status].sort();
    expect(esiti).toEqual([200, 409]);

    const [{ totale }] = await sequelize.query(
      `SELECT COUNT(*)::int AS totale FROM schede_votazione WHERE votazione_id = :v`,
      { replacements: { v: votazione.id }, type: sequelize.QueryTypes.SELECT }
    );
    expect(totale).toBe(1);

    const [{ preferenze }] = await sequelize.query(
      `SELECT COUNT(*)::int AS preferenze FROM voti_votazione vv
         JOIN schede_votazione s ON s.id = vv.scheda_id
        WHERE s.votazione_id = :v`,
      { replacements: { v: votazione.id }, type: sequelize.QueryTypes.SELECT }
    );
    expect(preferenze).toBe(1);
  });

  test('piu\' preferenze del consentito: rifiutate e nessuna scheda creata', async () => {
    const votazione = await creaVotazione();
    await request(app).post(`${API}/${votazione.id}/apri`).set('Authorization', admin.auth);
    const candidati = await candidatiDi(votazione.id);

    const res = await request(app).post(`${API}/${votazione.id}/vota`)
      .set('Authorization', socio.auth)
      .send({ candidati: candidati.slice(0, 4).map((c) => c.id) });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/al massimo 3/);

    const [{ totale }] = await sequelize.query(
      `SELECT COUNT(*)::int AS totale FROM schede_votazione WHERE votazione_id = :v`,
      { replacements: { v: votazione.id }, type: sequelize.QueryTypes.SELECT }
    );
    expect(totale).toBe(0);

    // E l'elettore resta libero di votare correttamente.
    const ok = await request(app).post(`${API}/${votazione.id}/vota`)
      .set('Authorization', socio.auth).send({ candidati: [candidati[0].id] });
    expect(ok.status).toBe(200);
  });

  test('stesso candidato due volte sulla stessa scheda: rifiutato', async () => {
    const votazione = await creaVotazione();
    await request(app).post(`${API}/${votazione.id}/apri`).set('Authorization', admin.auth);
    const candidati = await candidatiDi(votazione.id);

    const res = await request(app).post(`${API}/${votazione.id}/vota`)
      .set('Authorization', socio.auth)
      .send({ candidati: [candidati[0].id, candidati[0].id] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/due volte/);
  });

  test('preferenza a un candidato di un\'altra votazione: rifiutata', async () => {
    const prima = await creaVotazione();
    const seconda = await creaVotazione({ titolo: 'Altra votazione' });
    await request(app).post(`${API}/${prima.id}/apri`).set('Authorization', admin.auth);

    const candidatiAltrui = await candidatiDi(seconda.id);
    const res = await request(app).post(`${API}/${prima.id}/vota`)
      .set('Authorization', socio.auth)
      .send({ candidati: [candidatiAltrui[0].id] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/non corrispondono/);
  });

  test('preferenza con id inesistente: rifiutata', async () => {
    const votazione = await creaVotazione();
    await request(app).post(`${API}/${votazione.id}/apri`).set('Authorization', admin.auth);

    const res = await request(app).post(`${API}/${votazione.id}/vota`)
      .set('Authorization', socio.auth)
      .send({ candidati: ['11111111-1111-1111-1111-111111111111'] });

    expect(res.status).toBe(400);
  });

  test('scheda senza preferenze e senza flag bianca: rifiutata', async () => {
    const votazione = await creaVotazione();
    await request(app).post(`${API}/${votazione.id}/apri`).set('Authorization', admin.auth);

    const res = await request(app).post(`${API}/${votazione.id}/vota`)
      .set('Authorization', socio.auth).send({ candidati: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/almeno una preferenza/);
  });

  test('non si vota su votazione in bozza o chiusa', async () => {
    const votazione = await creaVotazione();

    const inBozza = await request(app).post(`${API}/${votazione.id}/vota`)
      .set('Authorization', socio.auth).send({ scheda_bianca: true });
    expect(inBozza.status).toBe(409);

    await request(app).post(`${API}/${votazione.id}/apri`).set('Authorization', admin.auth);
    await request(app).post(`${API}/${votazione.id}/chiudi`).set('Authorization', admin.auth);

    const chiusa = await request(app).post(`${API}/${votazione.id}/vota`)
      .set('Authorization', socio.auth).send({ scheda_bianca: true });
    expect(chiusa.status).toBe(409);
  });

  test('chi non e\' nello snapshot non puo\' votare', async () => {
    const votazione = await creaVotazione();
    await request(app).post(`${API}/${votazione.id}/apri`).set('Authorization', admin.auth);

    // Utente creato DOPO l'apertura: non e' avente diritto.
    const tardivo = await creaUtenteConToken(sequelize, { nome: 'Tardivo' });
    const res = await request(app).post(`${API}/${votazione.id}/vota`)
      .set('Authorization', tardivo.auth).send({ scheda_bianca: true });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/aventi diritto/);
  });
});

describe('Snapshot dell\'elettorato', () => {
  test('l\'elettorato e\' congelato all\'apertura', async () => {
    const votazione = await creaVotazione();
    await request(app).post(`${API}/${votazione.id}/apri`).set('Authorization', admin.auth);

    await creaUtenteConToken(sequelize, { nome: 'Nuovo' });

    const res = await request(app).get(`${API}/${votazione.id}/affluenza`)
      .set('Authorization', admin.auth);
    // Restano i 2 presenti all'apertura, non 3.
    expect(res.body.aventi_diritto).toBe(2);
  });

  test('gli enti fittizi e gli esterni non entrano nell\'elettorato', async () => {
    await creaUtenteConToken(sequelize, { nome: 'Ente', fittizio: true, ruolo: 'esterno', categoria_socio: 'esterno' });
    await creaUtenteConToken(sequelize, { nome: 'Esterno', ruolo: 'esterno', categoria_socio: 'esterno' });

    const votazione = await creaVotazione();
    const res = await request(app).post(`${API}/${votazione.id}/apri`).set('Authorization', admin.auth);

    expect(res.body.aventi_diritto).toBe(2);
  });

  test('i soci sospesi o archiviati non entrano nell\'elettorato', async () => {
    await creaUtenteConToken(sequelize, { nome: 'Sospeso', sospeso: true });
    await creaUtenteConToken(sequelize, { nome: 'Archiviato', archiviato: true });
    await creaUtenteConToken(sequelize, { nome: 'Disattivato', attivo: false });

    const votazione = await creaVotazione();
    const res = await request(app).post(`${API}/${votazione.id}/apri`).set('Authorization', admin.auth);

    expect(res.body.aventi_diritto).toBe(2);
  });

  test('la sospensione dopo l\'apertura blocca comunque il voto (a livello di autenticazione)', async () => {
    const elettore = await creaUtenteConToken(sequelize, { nome: 'Poi Sospeso' });
    const votazione = await creaVotazione();
    await request(app).post(`${API}/${votazione.id}/apri`).set('Authorization', admin.auth);

    await sequelize.query('UPDATE users SET sospeso = true WHERE id = :id', {
      replacements: { id: elettore.utente.id },
    });

    const res = await request(app).post(`${API}/${votazione.id}/vota`)
      .set('Authorization', elettore.auth).send({ scheda_bianca: true });

    expect(res.status).toBe(403);
    expect(res.body.sospeso).toBe(true);

    // Resta comunque contato fra gli aventi diritto: il quorum del verbale
    // non cambia per effetto di una sospensione successiva all'apertura.
    const affluenza = await request(app).get(`${API}/${votazione.id}/affluenza`)
      .set('Authorization', admin.auth);
    expect(affluenza.body.aventi_diritto).toBe(3);
    expect(affluenza.body.votanti).toBe(0);
  });

  test('destinatari per categoria: vota solo la categoria indicata', async () => {
    await creaUtenteConToken(sequelize, { nome: 'Volontario', categoria_socio: 'volontario' });

    const votazione = await creaVotazione({ destinatari: ['volontario'] });
    const res = await request(app).post(`${API}/${votazione.id}/apri`).set('Authorization', admin.auth);

    // Admin (volontario) + il volontario appena creato. Il socio ordinario resta fuori.
    expect(res.body.aventi_diritto).toBe(2);

    const escluso = await request(app).post(`${API}/${votazione.id}/vota`)
      .set('Authorization', socio.auth).send({ scheda_bianca: true });
    expect(escluso.status).toBe(403);
  });
});

describe('Validazione e regole di configurazione', () => {
  test('titolo mancante: 400', async () => {
    const res = await request(app).post(API).set('Authorization', admin.auth)
      .send({ seggi_da_eleggere: 3 });
    expect(res.status).toBe(400);
  });

  test('seggi non validi: 400', async () => {
    for (const seggi of [0, -1, 'tre', 1.5]) {
      const res = await request(app).post(API).set('Authorization', admin.auth)
        .send({ titolo: 'Test', seggi_da_eleggere: seggi });
      expect(res.status).toBe(400);
    }
  });

  test('preferenze superiori ai seggi: 400', async () => {
    const res = await request(app).post(API).set('Authorization', admin.auth)
      .send({ titolo: 'Test', seggi_da_eleggere: 3, preferenze_max: 4 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/non possono superare/);
  });

  test('preferenze_max assente: assume il numero di seggi', async () => {
    const res = await request(app).post(API).set('Authorization', admin.auth)
      .send({ titolo: 'Test', seggi_da_eleggere: 3 });
    expect(res.status).toBe(201);
    expect(res.body.votazione.preferenze_max).toBe(3);
  });

  test('preferenze inferiori ai seggi sono ammesse (voto limitato)', async () => {
    const votazione = await creaVotazione({ seggi_da_eleggere: 3, preferenze_max: 2 });
    await request(app).post(`${API}/${votazione.id}/apri`).set('Authorization', admin.auth);
    const candidati = await candidatiDi(votazione.id);

    const troppe = await request(app).post(`${API}/${votazione.id}/vota`)
      .set('Authorization', socio.auth)
      .send({ candidati: [candidati[0].id, candidati[1].id, candidati[2].id] });
    expect(troppe.status).toBe(400);

    const giuste = await request(app).post(`${API}/${votazione.id}/vota`)
      .set('Authorization', socio.auth)
      .send({ candidati: [candidati[0].id, candidati[1].id] });
    expect(giuste.status).toBe(200);
  });

  test('apertura senza candidati: rifiutata', async () => {
    const votazione = await creaVotazione({}, 0);
    const res = await request(app).post(`${API}/${votazione.id}/apri`).set('Authorization', admin.auth);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/candidati/);
  });

  test('candidati in numero inferiore ai seggi: apertura rifiutata', async () => {
    const votazione = await creaVotazione({ seggi_da_eleggere: 3 }, 2);
    const res = await request(app).post(`${API}/${votazione.id}/apri`).set('Authorization', admin.auth);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/meno dei seggi/);
  });

  test('doppia apertura: rifiutata', async () => {
    const votazione = await creaVotazione();
    await request(app).post(`${API}/${votazione.id}/apri`).set('Authorization', admin.auth);
    const seconda = await request(app).post(`${API}/${votazione.id}/apri`).set('Authorization', admin.auth);
    expect(seconda.status).toBe(409);
  });

  test('doppia chiusura: rifiutata', async () => {
    const votazione = await creaVotazione();
    await request(app).post(`${API}/${votazione.id}/apri`).set('Authorization', admin.auth);
    await request(app).post(`${API}/${votazione.id}/chiudi`).set('Authorization', admin.auth);
    const seconda = await request(app).post(`${API}/${votazione.id}/chiudi`).set('Authorization', admin.auth);
    expect(seconda.status).toBe(409);
  });

  test('chiusura di una votazione mai aperta: rifiutata', async () => {
    const votazione = await creaVotazione();
    const res = await request(app).post(`${API}/${votazione.id}/chiudi`).set('Authorization', admin.auth);
    expect(res.status).toBe(409);
  });
});

describe('Immutabilita\' a urne aperte', () => {
  test('non si modifica la votazione dopo l\'apertura', async () => {
    const votazione = await creaVotazione();
    await request(app).post(`${API}/${votazione.id}/apri`).set('Authorization', admin.auth);

    const res = await request(app).put(`${API}/${votazione.id}`)
      .set('Authorization', admin.auth).send({ seggi_da_eleggere: 5 });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/non e' piu' in bozza|bozza/);
  });

  test('non si aggiungono candidati dopo l\'apertura', async () => {
    const votazione = await creaVotazione();
    await request(app).post(`${API}/${votazione.id}/apri`).set('Authorization', admin.auth);

    const res = await request(app).post(`${API}/${votazione.id}/candidati`)
      .set('Authorization', admin.auth).send({ nome: 'Tardivo', cognome: 'Candidato' });

    expect(res.status).toBe(409);
  });

  test('non si rimuovono candidati dopo l\'apertura', async () => {
    const votazione = await creaVotazione();
    const candidati = await candidatiDi(votazione.id);
    await request(app).post(`${API}/${votazione.id}/apri`).set('Authorization', admin.auth);

    const res = await request(app).delete(`${API}/${votazione.id}/candidati/${candidati[0].id}`)
      .set('Authorization', admin.auth);

    expect(res.status).toBe(409);
  });

  test('in bozza candidati aggiungibili e rimovibili', async () => {
    const votazione = await creaVotazione({}, 3);

    const aggiunta = await request(app).post(`${API}/${votazione.id}/candidati`)
      .set('Authorization', admin.auth).send({ nome: 'Quarto', cognome: 'Candidato' });
    expect(aggiunta.status).toBe(201);

    const rimozione = await request(app)
      .delete(`${API}/${votazione.id}/candidati/${aggiunta.body.candidato.id}`)
      .set('Authorization', admin.auth);
    expect(rimozione.status).toBe(200);

    expect(await candidatiDi(votazione.id)).toHaveLength(3);
  });

  test('lo stesso socio non puo\' essere candidato due volte', async () => {
    const candidato = await creaUtenteConToken(sequelize, { nome: 'Candidato' });
    const votazione = await creaVotazione({}, 3);

    const prima = await request(app).post(`${API}/${votazione.id}/candidati`)
      .set('Authorization', admin.auth)
      .send({ user_id: candidato.utente.id, nome: 'Candidato', cognome: 'Rossi' });
    expect(prima.status).toBe(201);

    const seconda = await request(app).post(`${API}/${votazione.id}/candidati`)
      .set('Authorization', admin.auth)
      .send({ user_id: candidato.utente.id, nome: 'Candidato', cognome: 'Rossi' });
    expect(seconda.status).toBe(409);
  });
});

describe('Eliminazione della bozza', () => {
  test('una bozza puo\' essere eliminata dall\'admin', async () => {
    const votazione = await creaVotazione();

    const res = await request(app).delete(`${API}/${votazione.id}`).set('Authorization', admin.auth);
    expect(res.status).toBe(200);

    const dopo = await request(app).get(`${API}/${votazione.id}`).set('Authorization', admin.auth);
    expect(dopo.status).toBe(404);

    // I candidati spariscono con la votazione (ON DELETE CASCADE).
    const [{ totale }] = await sequelize.query(
      'SELECT COUNT(*)::int AS totale FROM candidati_votazione WHERE votazione_id = :v',
      { replacements: { v: votazione.id }, type: sequelize.QueryTypes.SELECT }
    );
    expect(totale).toBe(0);
  });

  test('una votazione aperta non puo\' essere eliminata', async () => {
    const votazione = await creaVotazione();
    await request(app).post(`${API}/${votazione.id}/apri`).set('Authorization', admin.auth);

    const res = await request(app).delete(`${API}/${votazione.id}`).set('Authorization', admin.auth);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/bozza/);
  });

  test('una votazione chiusa non puo\' essere eliminata: resta agli atti', async () => {
    const votazione = await creaVotazione();
    await request(app).post(`${API}/${votazione.id}/apri`).set('Authorization', admin.auth);
    await request(app).post(`${API}/${votazione.id}/chiudi`).set('Authorization', admin.auth);

    const res = await request(app).delete(`${API}/${votazione.id}`).set('Authorization', admin.auth);
    expect(res.status).toBe(409);

    const dopo = await request(app).get(`${API}/${votazione.id}`).set('Authorization', admin.auth);
    expect(dopo.status).toBe(200);
  });

  test('un socio non puo\' eliminare nemmeno una bozza', async () => {
    const votazione = await creaVotazione();
    const res = await request(app).delete(`${API}/${votazione.id}`).set('Authorization', socio.auth);
    expect(res.status).toBe(403);
  });

  test('404 eliminando una votazione inesistente', async () => {
    const res = await request(app)
      .delete(`${API}/11111111-1111-1111-1111-111111111111`)
      .set('Authorization', admin.auth);
    expect(res.status).toBe(404);
  });
});

describe('Modifica della bozza', () => {
  test('titolo, seggi e preferenze sono modificabili in bozza', async () => {
    const votazione = await creaVotazione();

    const res = await request(app).put(`${API}/${votazione.id}`)
      .set('Authorization', admin.auth)
      .send({ titolo: 'Titolo corretto', seggi_da_eleggere: 5, preferenze_max: 2 });

    expect(res.status).toBe(200);
    expect(res.body.votazione.titolo).toBe('Titolo corretto');
    expect(res.body.votazione.seggi_da_eleggere).toBe(5);
    expect(res.body.votazione.preferenze_max).toBe(2);
  });

  test('la modifica rispetta il vincolo preferenze <= seggi', async () => {
    const votazione = await creaVotazione();
    const res = await request(app).put(`${API}/${votazione.id}`)
      .set('Authorization', admin.auth)
      .send({ seggi_da_eleggere: 2, preferenze_max: 5 });
    expect(res.status).toBe(400);
  });

  test('i campi non inviati restano invariati', async () => {
    const votazione = await creaVotazione();
    const res = await request(app).put(`${API}/${votazione.id}`)
      .set('Authorization', admin.auth)
      .send({ titolo: 'Solo il titolo' });

    expect(res.status).toBe(200);
    expect(res.body.votazione.seggi_da_eleggere).toBe(votazione.seggi_da_eleggere);
    expect(res.body.votazione.preferenze_max).toBe(votazione.preferenze_max);
  });
});

describe('Risorse inesistenti', () => {
  const INESISTENTE = '11111111-1111-1111-1111-111111111111';

  test('404 su votazione inesistente', async () => {
    const rotte = await Promise.all([
      request(app).get(`${API}/${INESISTENTE}`).set('Authorization', admin.auth),
      request(app).post(`${API}/${INESISTENTE}/apri`).set('Authorization', admin.auth),
      request(app).post(`${API}/${INESISTENTE}/chiudi`).set('Authorization', admin.auth),
      request(app).get(`${API}/${INESISTENTE}/risultati`).set('Authorization', admin.auth),
    ]);
    rotte.forEach((r) => expect(r.status).toBe(404));
  });

  test('404 rimuovendo un candidato inesistente', async () => {
    const votazione = await creaVotazione();
    const res = await request(app)
      .delete(`${API}/${votazione.id}/candidati/${INESISTENTE}`)
      .set('Authorization', admin.auth);
    expect(res.status).toBe(404);
  });
});
