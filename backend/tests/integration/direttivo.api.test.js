const fs = require('fs');
const path = require('path');
const request = require('supertest');

const app = require('../../src/server');
const { sequelize } = require('../../src/config/database');
const { pulisciVotazioni } = require('../helpers/testDb');
const { creaUtenteConToken, pulisciUtentiTest } = require('../helpers/fixtures');
const { estraiTestoNormalizzato } = require('../helpers/pdf');

let admin;
let consigliere;
let socio;

const TEST = "SELECT id FROM users WHERE email LIKE '%@test.local'";

async function pulisciDirettivo() {
  await sequelize.query(`DELETE FROM avvisi WHERE created_by IN (${TEST})`);
  await sequelize.query(`DELETE FROM assemblee WHERE created_by IN (${TEST})`);
  await sequelize.query(`DELETE FROM cariche_sociali WHERE user_id IN (${TEST})`);
}

const oggi = () => new Date().toISOString().slice(0, 10);

async function nominaConsigliere(utente, { dal = '2026-01-01', al = null, carica = 'consigliere' } = {}) {
  const res = await request(app).post('/api/v1/cariche').set('Authorization', admin.auth)
    .send({ user_id: utente.id, carica, dal, al });
  expect(res.status).toBe(201);
  return res.body.carica;
}

async function creaRiunioneConsiglio(extra = {}) {
  const res = await request(app).post('/api/v1/assemblee').set('Authorization', admin.auth).send({
    titolo: 'Riunione del Consiglio',
    data_assemblea: new Date(Date.now() + 86400000).toISOString(),
    ordine_del_giorno: '1) Bilancio preventivo',
    tipo_assemblea: 'consiglio',
    ...extra,
  });
  expect(res.status).toBe(201);
  return res.body.assemblea;
}

const pdfDa = (req) => req.buffer(true).parse((r, cb) => {
  const pezzi = [];
  r.on('data', (c) => pezzi.push(Buffer.from(c)));
  r.on('end', () => cb(null, Buffer.concat(pezzi)));
});

beforeAll(async () => {
  await sequelize.authenticate();
});

afterAll(async () => {
  await pulisciDirettivo();
  await pulisciVotazioni(sequelize);
  await pulisciUtentiTest(sequelize);
  await sequelize.close();
});

beforeEach(async () => {
  await pulisciDirettivo();
  await pulisciVotazioni(sequelize);
  await pulisciUtentiTest(sequelize);
  admin = await creaUtenteConToken(sequelize, { ruolo: 'admin', categoria_socio: 'volontario' });
  consigliere = await creaUtenteConToken(sequelize, { ruolo: 'socio_ordinario', categoria_socio: 'ordinario' });
  socio = await creaUtenteConToken(sequelize, { ruolo: 'socio_ordinario', categoria_socio: 'ordinario' });
});

describe('Cariche sociali', () => {
  test('la composizione del Consiglio e\' visibile ai soci, modificabile solo dall\'admin', async () => {
    await nominaConsigliere(consigliere.utente, { carica: 'presidente' });

    const lista = await request(app).get('/api/v1/cariche').set('Authorization', socio.auth);
    expect(lista.status).toBe(200);
    expect(lista.body.cariche.map((c) => c.user_id)).toContain(consigliere.utente.id);

    const vietato = await request(app).post('/api/v1/cariche').set('Authorization', socio.auth)
      .send({ user_id: socio.utente.id, carica: 'consigliere', dal: oggi() });
    expect(vietato.status).toBe(403);
  });

  test('rifiuta date incoerenti e cariche inesistenti', async () => {
    const date = await request(app).post('/api/v1/cariche').set('Authorization', admin.auth)
      .send({ user_id: socio.utente.id, carica: 'consigliere', dal: '2026-05-01', al: '2026-01-01' });
    expect(date.status).toBe(400);
    const carica = await request(app).post('/api/v1/cariche').set('Authorization', admin.auth)
      .send({ user_id: socio.utente.id, carica: 'tesoriere', dal: oggi() });
    expect(carica.status).toBe(400);
  });

  test('un mandato chiuso esce dall\'elenco corrente ma resta nello storico', async () => {
    const carica = await nominaConsigliere(consigliere.utente);
    const chiusura = await request(app).put(`/api/v1/cariche/${carica.id}`).set('Authorization', admin.auth)
      .send({ al: '2026-02-01' });
    expect(chiusura.status).toBe(200);

    const correnti = await request(app).get('/api/v1/cariche').set('Authorization', admin.auth);
    expect(correnti.body.cariche.find((c) => c.id === carica.id)).toBeUndefined();
    const storico = await request(app).get('/api/v1/cariche?tutte=1').set('Authorization', admin.auth);
    expect(storico.body.cariche.find((c) => c.id === carica.id)).toBeDefined();
  });

  test('registra come consiglieri gli eletti di una votazione chiusa, senza duplicarli', async () => {
    const creazione = await request(app).post('/api/v1/votazioni').set('Authorization', admin.auth).send({
      titolo: 'Rinnovo', seggi_da_eleggere: 1, preferenze_max: 1,
      candidati: [{ nome: 'Eletto', cognome: 'Futuro', user_id: socio.utente.id }, { nome: 'Senza', cognome: 'Voti' }],
    });
    const id = creazione.body.votazione.id;
    await request(app).post(`/api/v1/votazioni/${id}/apri`).set('Authorization', admin.auth);
    const dettaglio = await request(app).get(`/api/v1/votazioni/${id}`).set('Authorization', admin.auth);
    const candidato = dettaglio.body.candidati.find((c) => c.user_id === socio.utente.id);
    await request(app).post(`/api/v1/votazioni/${id}/vota`).set('Authorization', admin.auth)
      .send({ candidati: [candidato.id] });
    await request(app).post(`/api/v1/votazioni/${id}/chiudi`).set('Authorization', admin.auth);

    const prima = await request(app).post(`/api/v1/cariche/da-votazione/${id}`).set('Authorization', admin.auth);
    expect(prima.status).toBe(200);
    expect(prima.body.registrati).toHaveLength(1);

    const seconda = await request(app).post(`/api/v1/cariche/da-votazione/${id}`).set('Authorization', admin.auth);
    expect(seconda.body.registrati).toHaveLength(0);
    expect(seconda.body.saltati[0].motivo).toMatch(/in carica/);
  });
});

describe('Riunioni del Consiglio riservate', () => {
  test('i soci non le vedono, i consiglieri e gli admin si', async () => {
    await nominaConsigliere(consigliere.utente);
    const riunione = await creaRiunioneConsiglio();

    const listaSocio = await request(app).get('/api/v1/assemblee').set('Authorization', socio.auth);
    expect(listaSocio.body.assemblee.map((a) => a.id)).not.toContain(riunione.id);
    expect((await request(app).get(`/api/v1/assemblee/${riunione.id}`).set('Authorization', socio.auth)).status)
      .toBe(404);
    expect((await request(app).get(`/api/v1/assemblee/${riunione.id}/presenze`).set('Authorization', socio.auth)).status)
      .toBe(404);

    const listaConsigliere = await request(app).get('/api/v1/assemblee').set('Authorization', consigliere.auth);
    expect(listaConsigliere.body.assemblee.map((a) => a.id)).toContain(riunione.id);
    expect((await request(app).get(`/api/v1/assemblee/${riunione.id}`).set('Authorization', admin.auth)).status)
      .toBe(200);
  });

  test('un ex consigliere vede le riunioni del suo mandato, non quelle successive', async () => {
    await nominaConsigliere(consigliere.utente, { dal: '2025-01-01', al: '2025-12-31' });
    const delMandato = await creaRiunioneConsiglio({ data_assemblea: '2025-06-10T17:00:00Z' });
    const successiva = await creaRiunioneConsiglio({ data_assemblea: '2026-03-10T17:00:00Z' });

    expect((await request(app).get(`/api/v1/assemblee/${delMandato.id}`).set('Authorization', consigliere.auth)).status)
      .toBe(200);
    expect((await request(app).get(`/api/v1/assemblee/${successiva.id}`).set('Authorization', consigliere.auth)).status)
      .toBe(404);
  });

  test('l\'avviso automatico va ai soli consiglieri in carica', async () => {
    await nominaConsigliere(consigliere.utente);
    const riunione = await creaRiunioneConsiglio();
    const [[avviso]] = await sequelize.query(
      'SELECT destinatari FROM avvisi WHERE assemblea_id = :id', { replacements: { id: riunione.id } }
    );
    expect(avviso.destinatari).toEqual([`utente:${consigliere.utente.id}`]);
  });

  test('le assemblee ordinarie restano visibili a tutti', async () => {
    const res = await request(app).post('/api/v1/assemblee').set('Authorization', admin.auth).send({
      titolo: 'Assemblea ordinaria', data_assemblea: new Date().toISOString(), tipo_assemblea: 'ordinaria',
    });
    const lista = await request(app).get('/api/v1/assemblee').set('Authorization', socio.auth);
    expect(lista.body.assemblee.map((a) => a.id)).toContain(res.body.assemblea.id);
  });
});

describe('Verbale del Consiglio', () => {
  test('si compila con presenti e delibere, e il PDF lo scaricano solo i consiglieri', async () => {
    await nominaConsigliere(consigliere.utente, { carica: 'presidente' });
    await nominaConsigliere(admin.utente, { carica: 'segretario' });
    const riunione = await creaRiunioneConsiglio();

    const salvataggio = await request(app)
      .put(`/api/v1/assemblee/${riunione.id}/dati-verbale-consiglio`).set('Authorization', admin.auth)
      .send({
        presidente: 'Presidente Prova',
        segretario: 'Segretario Prova',
        presenti: [consigliere.utente.id, admin.utente.id],
        delibere: [{ oggetto: 'Approvazione del bilancio preventivo', favorevoli: 2, contrari: 0, astenuti: 0 }],
      });
    expect(salvataggio.status).toBe(200);
    expect(salvataggio.body.esito.valido).toBe(true);
    expect(salvataggio.body.esito.delibere[0].unanimita).toBe(true);

    const pdf = await pdfDa(request(app).get(`/api/v1/assemblee/${riunione.id}/verbale-consiglio`)
      .set('Authorization', consigliere.auth));
    expect(pdf.status).toBe(200);
    const testo = estraiTestoNormalizzato(pdf.body).replace(/\s+/g, '');
    expect(testo).toContain('VERBALEDIRIUNIONEDELCONSIGLIODIRETTIVO');
    expect(testo).toContain('Approvazionedelbilanciopreventivo');
    expect(testo).toContain('all\'unanimità');

    expect((await request(app).get(`/api/v1/assemblee/${riunione.id}/verbale-consiglio`)
      .set('Authorization', socio.auth)).status).toBe(404);
  });

  test('rifiuta piu\' voti che presenti (nel Consiglio non ci sono deleghe)', async () => {
    await nominaConsigliere(consigliere.utente);
    await nominaConsigliere(admin.utente);
    const riunione = await creaRiunioneConsiglio();
    const res = await request(app)
      .put(`/api/v1/assemblee/${riunione.id}/dati-verbale-consiglio`).set('Authorization', admin.auth)
      .send({ presenti: [admin.utente.id], delibere: [{ oggetto: 'X', favorevoli: 2 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/deleghe/);
  });

  test('non accetta fra i presenti chi non e\' consigliere', async () => {
    await nominaConsigliere(consigliere.utente);
    const riunione = await creaRiunioneConsiglio();
    const res = await request(app)
      .put(`/api/v1/assemblee/${riunione.id}/dati-verbale-consiglio`).set('Authorization', admin.auth)
      .send({ presenti: [socio.utente.id] });
    expect(res.status).toBe(400);
  });
});

describe('Verbali caricati: solo con accesso', () => {
  const cartella = path.resolve(process.env.UPLOAD_PATH || './uploads', 'verbali');
  const nomeFile = 'test_verbale_riservato.pdf';

  beforeAll(() => {
    fs.mkdirSync(cartella, { recursive: true });
    fs.writeFileSync(path.join(cartella, nomeFile), '%PDF-1.4 test');
  });
  afterAll(() => fs.rmSync(path.join(cartella, nomeFile), { force: true }));

  test('il link statico non funziona piu\'', async () => {
    const res = await request(app).get(`/uploads/verbali/${nomeFile}`);
    expect(res.status).toBe(404);
  });

  test('il verbale di un\'assemblea si scarica con l\'accesso; quello del Consiglio solo dai consiglieri', async () => {
    await nominaConsigliere(consigliere.utente);
    const ordinaria = await request(app).post('/api/v1/assemblee').set('Authorization', admin.auth).send({
      titolo: 'Ordinaria', data_assemblea: new Date().toISOString(), tipo_assemblea: 'ordinaria',
    });
    const riunione = await creaRiunioneConsiglio();
    await sequelize.query(
      'UPDATE assemblee SET verbale_path = :p WHERE id IN (:ids)',
      { replacements: { p: `/uploads/verbali/${nomeFile}`, ids: [ordinaria.body.assemblea.id, riunione.id] } }
    );

    expect((await request(app).get(`/api/v1/assemblee/${ordinaria.body.assemblea.id}/verbale`)).status).toBe(401);
    expect((await request(app).get(`/api/v1/assemblee/${ordinaria.body.assemblea.id}/verbale`)
      .set('Authorization', socio.auth)).status).toBe(200);
    expect((await request(app).get(`/api/v1/assemblee/${riunione.id}/verbale`)
      .set('Authorization', socio.auth)).status).toBe(404);
    expect((await request(app).get(`/api/v1/assemblee/${riunione.id}/verbale`)
      .set('Authorization', consigliere.auth)).status).toBe(200);
  });
});

describe('Allegati del verbale', () => {
  // I file caricati dai test restano su disco anche quando le righe spariscono
  // con le assemblee: si tolgono qui, riconoscendoli dal nome.
  afterAll(() => {
    const cartella = path.resolve(process.env.UPLOAD_PATH || './uploads', 'verbali');
    if (!fs.existsSync(cartella)) return;
    fs.readdirSync(cartella)
      .filter((f) => /^(foglio_firme|relazione|firme)_\d+_\d+\.pdf$/.test(f))
      .forEach((f) => fs.rmSync(path.join(cartella, f), { force: true }));
  });

  const allega = (utente, id, nome = 'foglio-firme.pdf', titolo = 'Foglio firme') => request(app)
    .post(`/api/v1/assemblee/${id}/allegati`).set('Authorization', utente.auth)
    .field('titolo', titolo)
    .attach('allegato_verbale', Buffer.from('%PDF-1.4 allegato'), nome);

  test('l\'admin carica, i soci scaricano; tipi non ammessi rifiutati', async () => {
    const ordinaria = (await request(app).post('/api/v1/assemblee').set('Authorization', admin.auth).send({
      titolo: 'Ordinaria', data_assemblea: new Date().toISOString(), tipo_assemblea: 'ordinaria',
    })).body.assemblea;

    expect((await allega(socio, ordinaria.id)).status).toBe(403);
    expect((await allega(admin, ordinaria.id, 'script.exe')).status).toBe(400);

    const caricato = await allega(admin, ordinaria.id);
    expect(caricato.status).toBe(201);
    const allegatoId = caricato.body.allegato.id;

    const dettaglio = await request(app).get(`/api/v1/assemblee/${ordinaria.id}`).set('Authorization', socio.auth);
    expect(dettaglio.body.allegati[0].titolo).toBe('Foglio firme');
    expect(dettaglio.body.allegati[0].path_file).toBeUndefined();

    const scaricato = await request(app).get(`/api/v1/assemblee/${ordinaria.id}/allegati/${allegatoId}`)
      .set('Authorization', socio.auth);
    expect(scaricato.status).toBe(200);

    expect((await request(app).delete(`/api/v1/assemblee/${ordinaria.id}/allegati/${allegatoId}`)
      .set('Authorization', admin.auth)).status).toBe(200);
    expect((await request(app).get(`/api/v1/assemblee/${ordinaria.id}/allegati/${allegatoId}`)
      .set('Authorization', socio.auth)).status).toBe(404);
  });

  test('gli allegati di una riunione del Consiglio li scaricano solo i consiglieri', async () => {
    await nominaConsigliere(consigliere.utente);
    const riunione = await creaRiunioneConsiglio();
    const { body } = await allega(admin, riunione.id, 'relazione.pdf', 'Relazione');
    const url = `/api/v1/assemblee/${riunione.id}/allegati/${body.allegato.id}`;
    expect((await request(app).get(url).set('Authorization', socio.auth)).status).toBe(404);
    expect((await request(app).get(url).set('Authorization', consigliere.auth)).status).toBe(200);

    const pdf = await pdfDa(request(app).get(`/api/v1/assemblee/${riunione.id}/verbale-consiglio`)
      .set('Authorization', consigliere.auth));
    expect(estraiTestoNormalizzato(pdf.body).replace(/\s+/g, '')).toContain('Allegati:A)Relazione');
  });

  test('il verbale della votazione elenca gli allegati dell\'assemblea collegata', async () => {
    const assemblea = (await request(app).post('/api/v1/assemblee').set('Authorization', admin.auth).send({
      titolo: 'Elettiva', data_assemblea: new Date().toISOString(), tipo_assemblea: 'ordinaria',
    })).body.assemblea;
    await allega(admin, assemblea.id, 'firme.pdf', 'Foglio firme');

    const creazione = await request(app).post('/api/v1/votazioni').set('Authorization', admin.auth).send({
      titolo: 'Rinnovo', seggi_da_eleggere: 1, preferenze_max: 1, assemblea_id: assemblea.id,
      candidati: [{ nome: 'A', cognome: 'B' }],
    });
    const id = creazione.body.votazione.id;
    await request(app).post(`/api/v1/votazioni/${id}/apri`).set('Authorization', admin.auth);
    await request(app).post(`/api/v1/votazioni/${id}/chiudi`).set('Authorization', admin.auth);

    const pdf = await pdfDa(request(app).get(`/api/v1/votazioni/${id}/verbale`).set('Authorization', admin.auth));
    expect(estraiTestoNormalizzato(pdf.body).replace(/\s+/g, '')).toContain('B)Fogliofirme');
  });
});

describe('Convocazione in PDF', () => {
  test('la genera l\'admin, con il nome del Presidente in carica; i soci no', async () => {
    await nominaConsigliere(consigliere.utente, { carica: 'presidente', dal: '2024-01-01' });
    const assemblea = (await request(app).post('/api/v1/assemblee').set('Authorization', admin.auth).send({
      titolo: 'Ordinaria', data_assemblea: '2026-10-21T19:00:00Z', tipo_assemblea: 'ordinaria',
      luogo: 'Salerno', ordine_del_giorno: '1. Bilancio',
    })).body.assemblea;

    const pdf = await pdfDa(request(app).get(`/api/v1/assemblee/${assemblea.id}/convocazione-pdf?data=2026-09-29`)
      .set('Authorization', admin.auth));
    expect(pdf.status).toBe(200);
    const testo = estraiTestoNormalizzato(pdf.body).replace(/\s+/g, '');
    expect(testo).toContain('Oggetto:Convocazionedell');
    expect(testo).toContain(`${consigliere.utente.nome}${consigliere.utente.cognome}`.replace(/\s+/g, ''));

    expect((await request(app).get(`/api/v1/assemblee/${assemblea.id}/convocazione-pdf`)
      .set('Authorization', socio.auth)).status).toBe(403);
  });
});

describe('Carta intestata', () => {
  const LOGO = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'frontend', 'public', 'logo-labrigata.png'));
  const CHIAVI = ['carta_intestata_intestazione', 'carta_intestata_piepagina', 'carta_intestata_logo'];

  afterEach(async () => {
    const [righe] = await sequelize.query(
      "SELECT valore FROM impostazioni WHERE chiave = 'carta_intestata_logo'"
    );
    const logo = righe[0]?.valore;
    if (logo) fs.rmSync(path.resolve(process.env.UPLOAD_PATH || './uploads', logo.replace(/^\/uploads\//, '')), { force: true });
    await sequelize.query('DELETE FROM impostazioni WHERE chiave IN (:chiavi)', { replacements: { chiavi: CHIAVI } });
    await sequelize.query('DELETE FROM impostazioni_storico WHERE chiave IN (:chiavi)', { replacements: { chiavi: CHIAVI } });
  });

  test('l\'admin salva l\'HTML e carica il logo; i soci no', async () => {
    const salva = await request(app).put('/api/v1/impostazioni/carta_intestata_intestazione')
      .set('Authorization', admin.auth).send({ valore: '<p align="center"><b>CARTA DI PROVA</b></p>' });
    expect(salva.status).toBe(200);
    expect((await request(app).put('/api/v1/impostazioni/carta_intestata_piepagina')
      .set('Authorization', socio.auth).send({ valore: 'x' })).status).toBe(403);

    // Il percorso del logo non si scrive a mano: solo caricando un'immagine.
    expect((await request(app).put('/api/v1/impostazioni/carta_intestata_logo')
      .set('Authorization', admin.auth).send({ valore: '/etc/passwd' })).status).toBe(400);

    const non = await request(app).post('/api/v1/impostazioni/carta-intestata/logo')
      .set('Authorization', admin.auth).attach('logo_carta', Buffer.from('non sono un png'), 'finto.png');
    expect(non.status).toBe(400);

    const logo = await request(app).post('/api/v1/impostazioni/carta-intestata/logo')
      .set('Authorization', admin.auth).attach('logo_carta', LOGO, 'logo.png');
    expect(logo.status).toBe(200);
    expect((await request(app).get('/api/v1/impostazioni/carta-intestata/logo')
      .set('Authorization', socio.auth)).status).toBe(200);
  });

  test('l\'anteprima usa il testo non ancora salvato', async () => {
    const pdf = await pdfDa(request(app).post('/api/v1/impostazioni/carta-intestata/anteprima')
      .set('Authorization', admin.auth)
      .send({ intestazione: '<p><b>INTESTAZIONE NUOVA</b></p>', piepagina: '<p>piede {pagina}</p>' }));
    expect(pdf.status).toBe(200);
    const testo = estraiTestoNormalizzato(pdf.body).replace(/\s+/g, '');
    expect(testo).toContain('INTESTAZIONENUOVA');
    expect(testo).toContain('piede1');
    expect((await request(app).post('/api/v1/impostazioni/carta-intestata/anteprima')
      .set('Authorization', socio.auth).send({})).status).toBe(403);
  });

  test('verbali e convocazioni usano la carta intestata salvata', async () => {
    await request(app).put('/api/v1/impostazioni/carta_intestata_piepagina')
      .set('Authorization', admin.auth).send({ valore: '<p>PIEDE SALVATO</p>' });
    const assemblea = (await request(app).post('/api/v1/assemblee').set('Authorization', admin.auth).send({
      titolo: 'Ordinaria', data_assemblea: '2026-10-21T19:00:00Z', tipo_assemblea: 'ordinaria',
    })).body.assemblea;
    const pdf = await pdfDa(request(app).get(`/api/v1/assemblee/${assemblea.id}/convocazione-pdf`)
      .set('Authorization', admin.auth));
    expect(estraiTestoNormalizzato(pdf.body).replace(/\s+/g, '')).toContain('PIEDESALVATO');
  });
});
