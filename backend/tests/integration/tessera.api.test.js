const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const app = require('../../src/server');
const { sequelize } = require('../../src/config/database');
const { creaUtenteConToken, pulisciUtentiTest } = require('../helpers/fixtures');
const { annoCorrente, tesseraDi } = require('../../src/utils/tessera');

/**
 * La tessera digitale: spetta solo a chi e' in regola con la quota
 * dell'anno, il QR porta a una verifica che non lascia uscire altro del
 * socio, e i due wallet ricevono una tessera firmata con i dati giusti.
 *
 * I certificati Apple e il service account Google sono finti, generati qui:
 * bastano a verificare cosa si firma, non che Apple e Google lo accettino.
 */

const ANNO = annoCorrente();
let cartella;
let chiavePubblicaGoogle;
let socio;

async function pagaQuota(userId, anno = ANNO, pagata = true) {
  await sequelize.query(
    `INSERT INTO quote_associative (user_id, anno, importo, pagata) VALUES (:id, :anno, 15.00, :pagata)`,
    { replacements: { id: userId, anno, pagata } }
  );
}

async function codiceDi(userId) {
  const [u] = await sequelize.query('SELECT codice_tessera, numero_tessera FROM users WHERE id = :id', {
    replacements: { id: userId }, type: sequelize.QueryTypes.SELECT,
  });
  return u;
}

/** I file di uno zip non compresso (come lo scrive passkit-generator). */
function fileDelloZip(buffer) {
  const file = {};
  let i = 0;
  while (buffer.readUInt32LE(i) === 0x04034b50) {
    const dimensione = buffer.readUInt32LE(i + 18);
    const lungNome = buffer.readUInt16LE(i + 26);
    const lungExtra = buffer.readUInt16LE(i + 28);
    const nome = buffer.toString('utf8', i + 30, i + 30 + lungNome);
    const inizio = i + 30 + lungNome + lungExtra;
    file[nome] = buffer.subarray(inizio, inizio + dimensione);
    i = inizio + dimensione;
  }
  return file;
}

function configuraWallet() {
  cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'tessera-test-'));
  const f = (nome) => path.join(cartella, nome);
  const openssl = (...args) => execFileSync('openssl', args, { stdio: 'ignore' });
  openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=WWDR finto',
    '-keyout', f('wwdr.key'), '-out', f('wwdr.pem'));
  openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=Pass finto',
    '-keyout', f('pass.key'), '-out', f('pass.pem'));

  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  chiavePubblicaGoogle = publicKey.export({ type: 'spki', format: 'pem' });
  fs.writeFileSync(f('google.json'), JSON.stringify({
    client_email: 'wallet@progetto-finto.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  }));

  Object.assign(process.env, {
    APPLE_WALLET_PASS_TYPE_ID: 'pass.it.labrigataodv.tessera',
    APPLE_WALLET_TEAM_ID: 'ABCDE12345',
    APPLE_WALLET_CERT: f('pass.pem'),
    APPLE_WALLET_KEY: f('pass.key'),
    APPLE_WALLET_WWDR: f('wwdr.pem'),
    GOOGLE_WALLET_ISSUER_ID: '3388000000012345678',
    GOOGLE_WALLET_CREDENZIALI: f('google.json'),
  });
}

const VARIABILI = ['APPLE_WALLET_PASS_TYPE_ID', 'APPLE_WALLET_TEAM_ID', 'APPLE_WALLET_CERT', 'APPLE_WALLET_KEY',
  'APPLE_WALLET_WWDR', 'GOOGLE_WALLET_ISSUER_ID', 'GOOGLE_WALLET_CREDENZIALI'];

beforeAll(async () => {
  await sequelize.authenticate();
  configuraWallet();
});

afterAll(async () => {
  VARIABILI.forEach((v) => delete process.env[v]);
  fs.rmSync(cartella, { recursive: true, force: true });
  await pulisciUtentiTest(sequelize);
  await sequelize.close();
});

beforeEach(async () => {
  await pulisciUtentiTest(sequelize);
  socio = await creaUtenteConToken(sequelize, { ruolo: 'socio_volontario', categoria_socio: 'volontario', nome: 'Lucia', cognome: 'Bianchi' });
});

describe('Chi riceve la tessera', () => {
  test('senza la quota dell\'anno pagata non c\'e\' tessera ne\' numero', async () => {
    await pagaQuota(socio.utente.id, ANNO - 1);
    await pagaQuota(socio.utente.id, ANNO, false);

    const res = await request(app).get('/api/v1/tessera').set('Authorization', socio.auth);

    expect(res.status).toBe(200);
    expect(res.body.stato).toBe('quota_non_pagata');
    expect(res.body.tessera).toBeNull();
    expect((await codiceDi(socio.utente.id)).numero_tessera).toBeNull();

    const apple = await request(app).get('/api/v1/tessera/apple').set('Authorization', socio.auth);
    expect(apple.status).toBe(403);
    const google = await request(app).get('/api/v1/tessera/google').set('Authorization', socio.auth);
    expect(google.status).toBe(403);
  });

  test('con la quota pagata riceve il numero, che resta lo stesso', async () => {
    await pagaQuota(socio.utente.id);

    const prima = await request(app).get('/api/v1/tessera').set('Authorization', socio.auth);
    const dopo = await request(app).get('/api/v1/tessera').set('Authorization', socio.auth);

    expect(prima.body.stato).toBe('valida');
    expect(prima.body.tessera).toMatchObject({ intestatario: 'Lucia Bianchi', anno: ANNO, scadenza: `31/12/${ANNO}` });
    expect(prima.body.tessera.numero).toMatch(/^\d{4,}$/);
    expect(dopo.body.tessera.numero).toBe(prima.body.tessera.numero);
    expect(prima.body.wallet).toEqual({ apple: true, google: true });

    const { codice_tessera: codice } = await codiceDi(socio.utente.id);
    expect(prima.body.tessera.urlVerifica).toMatch(new RegExp(`/verifica-tessera/${codice}$`));
  });

  test('due soci ricevono numeri diversi', async () => {
    const altro = await creaUtenteConToken(sequelize, { ruolo: 'socio_volontario', categoria_socio: 'volontario' });
    await pagaQuota(socio.utente.id);
    await pagaQuota(altro.utente.id);

    const a = await request(app).get('/api/v1/tessera').set('Authorization', socio.auth);
    const b = await request(app).get('/api/v1/tessera').set('Authorization', altro.auth);

    expect(a.body.tessera.numero).not.toBe(b.body.tessera.numero);
  });

  // Archiviati e sospesi non entrano nell'app: la regola si prova sul modulo.
  test.each(['archiviato', 'sospeso', 'fittizio'])('un account %s non la riceve anche se ha pagato', async (colonna) => {
    await pagaQuota(socio.utente.id);
    await sequelize.query(`UPDATE users SET ${colonna} = true WHERE id = :id`, { replacements: { id: socio.utente.id } });

    const dati = await tesseraDi(socio.utente.id);
    expect(dati.stato).toBe('non_valida');
    expect(dati.tessera).toBeNull();
  });

  test('serve l\'accesso', async () => {
    expect((await request(app).get('/api/v1/tessera')).status).toBe(401);
  });
});

describe('Verifica dal QR', () => {
  test('mostra intestatario, numero e stato, e nient\'altro', async () => {
    await pagaQuota(socio.utente.id);
    const tessera = await request(app).get('/api/v1/tessera').set('Authorization', socio.auth);
    const { codice_tessera: codice } = await codiceDi(socio.utente.id);

    const res = await request(app).get(`/api/v1/pubblico/tessera/${codice}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      intestatario: 'Lucia Bianchi', numero: tessera.body.tessera.numero, anno: ANNO, stato: 'valida',
      categoria: 'Socio volontario', carica: null, ruolo: null,
    });
  });

  test('dice la verita\' di oggi, non quella del giorno in cui e\' stata aggiunta', async () => {
    await pagaQuota(socio.utente.id);
    await request(app).get('/api/v1/tessera').set('Authorization', socio.auth);
    const { codice_tessera: codice } = await codiceDi(socio.utente.id);
    await sequelize.query('UPDATE users SET sospeso = true WHERE id = :id', { replacements: { id: socio.utente.id } });

    const res = await request(app).get(`/api/v1/pubblico/tessera/${codice}`);
    expect(res.body.stato).toBe('non_valida');
  });

  test('un codice inesistente o malformato risponde 404', async () => {
    expect((await request(app).get(`/api/v1/pubblico/tessera/${'0'.repeat(32)}`)).status).toBe(404);
    expect((await request(app).get(`/api/v1/pubblico/tessera/${socio.utente.id}`)).status).toBe(404);
  });

  test('chi non ha mai avuto la tessera non si verifica', async () => {
    const { codice_tessera: codice } = await codiceDi(socio.utente.id);
    expect((await request(app).get(`/api/v1/pubblico/tessera/${codice}`)).status).toBe(404);
  });
});

describe('Qualifica sulla tessera', () => {
  async function nomina(userId, carica, dal, al = null) {
    await sequelize.query(
      `INSERT INTO cariche_sociali (user_id, carica, dal, al) VALUES (:userId, :carica, :dal, :al)`,
      { replacements: { userId, carica, dal, al } }
    );
  }

  test('la carica in corso nel Consiglio compare su tessera e verifica, la piu\' alta se piu\' d\'una', async () => {
    await pagaQuota(socio.utente.id);
    await nomina(socio.utente.id, 'consigliere', '2024-09-05');
    await nomina(socio.utente.id, 'vicepresidente', '2025-01-10');

    const res = await request(app).get('/api/v1/tessera').set('Authorization', socio.auth);
    expect(res.body.tessera).toMatchObject({ categoria: 'Socio volontario', carica: 'Vicepresidente', ruolo: null });

    const { codice_tessera: codice } = await codiceDi(socio.utente.id);
    const verifica = await request(app).get(`/api/v1/pubblico/tessera/${codice}`);
    expect(verifica.body.carica).toBe('Vicepresidente');
  });

  test('una carica conclusa non compare', async () => {
    await pagaQuota(socio.utente.id);
    await nomina(socio.utente.id, 'presidente', '2020-01-01', '2023-12-31');

    const res = await request(app).get('/api/v1/tessera').set('Authorization', socio.auth);
    expect(res.body.tessera.carica).toBeNull();
  });

  test('il gestore cucine ha il ruolo, l\'admin no', async () => {
    const gestore = await creaUtenteConToken(sequelize, { ruolo: 'gestore_cucine', categoria_socio: 'volontario' });
    const admin = await creaUtenteConToken(sequelize, { ruolo: 'admin', categoria_socio: 'volontario' });
    await pagaQuota(gestore.utente.id);
    await pagaQuota(admin.utente.id);

    expect((await request(app).get('/api/v1/tessera').set('Authorization', gestore.auth)).body.tessera.ruolo).toBe('Gestore cucine');
    expect((await request(app).get('/api/v1/tessera').set('Authorization', admin.auth)).body.tessera.ruolo).toBeNull();
  });

  test('nel pass Apple e nella tessera Google', async () => {
    await pagaQuota(socio.utente.id);
    await nomina(socio.utente.id, 'presidente', '2024-09-05');

    const link = await request(app).get('/api/v1/tessera/apple').set('Authorization', socio.auth);
    const res = await request(app).get(new URL(link.body.url).pathname).buffer(true).parse((r, cb) => {
      const parti = [];
      r.on('data', (c) => parti.push(c));
      r.on('end', () => cb(null, Buffer.concat(parti)));
    });
    const pass = JSON.parse(fileDelloZip(res.body)['pass.json'].toString('utf8'));
    expect(pass.generic.primaryFields[0].label).toBe('SOCIO VOLONTARIO');
    expect(pass.generic.auxiliaryFields).toEqual([{ key: 'carica', label: 'CONSIGLIO DIRETTIVO', value: 'Presidente' }]);

    const google = await request(app).get('/api/v1/tessera/google').set('Authorization', socio.auth);
    const dati = jwt.verify(google.body.url.split('/').pop(), chiavePubblicaGoogle, { algorithms: ['RS256'] });
    const [oggetto] = dati.payload.genericObjects;
    expect(oggetto.subheader.defaultValue.value).toBe(`Socio volontario · ${ANNO}`);
    expect(oggetto.textModulesData).toContainEqual({ id: 'carica', header: 'Consiglio direttivo', body: 'Presidente' });
    expect(oggetto.textModulesData.find((m) => m.id === 'ruolo')).toBeUndefined();
  });
});

describe('Apple Wallet', () => {
  test('il link porta a un .pkpass firmato con i dati della tessera', async () => {
    await pagaQuota(socio.utente.id);
    const link = await request(app).get('/api/v1/tessera/apple').set('Authorization', socio.auth);
    expect(link.status).toBe(200);

    const percorso = new URL(link.body.url).pathname;
    expect(percorso).toMatch(/^\/api\/v1\/pubblico\/tessera-apple\//);

    const res = await request(app).get(percorso).buffer(true).parse((r, cb) => {
      const parti = [];
      r.on('data', (c) => parti.push(c));
      r.on('end', () => cb(null, Buffer.concat(parti)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/vnd.apple.pkpass');

    const file = fileDelloZip(res.body);
    expect(Object.keys(file)).toEqual(expect.arrayContaining(['pass.json', 'manifest.json', 'signature', 'icon.png', 'logo.png']));

    const pass = JSON.parse(file['pass.json'].toString('utf8'));
    const { codice_tessera: codice } = await codiceDi(socio.utente.id);
    expect(pass.passTypeIdentifier).toBe('pass.it.labrigataodv.tessera');
    expect(pass.serialNumber).toBe(`${socio.utente.id}-${ANNO}`);
    expect(pass.generic.primaryFields[0].value).toBe('Lucia Bianchi');
    expect(pass.barcodes[0].message).toMatch(new RegExp(`/verifica-tessera/${codice}$`));
    expect(new Date(pass.expirationDate)).toEqual(new Date(`${ANNO}-12-31T23:59:59+01:00`));
  });

  test('un gettone falso o di un altro scopo non scarica nulla', async () => {
    await pagaQuota(socio.utente.id);
    const sessione = socio.token;
    const altroScopo = jwt.sign({ scopo: 'altro' }, process.env.JWT_SECRET, { subject: socio.utente.id });

    expect((await request(app).get(`/api/v1/pubblico/tessera-apple/${sessione}`)).status).toBe(404);
    expect((await request(app).get(`/api/v1/pubblico/tessera-apple/${altroScopo}`)).status).toBe(404);
    expect((await request(app).get('/api/v1/pubblico/tessera-apple/nonvalido')).status).toBe(404);
  });

  test('il gettone non basta se nel frattempo la tessera non spetta piu\'', async () => {
    await pagaQuota(socio.utente.id);
    const link = await request(app).get('/api/v1/tessera/apple').set('Authorization', socio.auth);
    await sequelize.query('UPDATE users SET sospeso = true WHERE id = :id', { replacements: { id: socio.utente.id } });

    expect((await request(app).get(new URL(link.body.url).pathname)).status).toBe(403);
  });
});

describe('Google Wallet', () => {
  test('il link contiene la tessera firmata col service account', async () => {
    await pagaQuota(socio.utente.id);
    const res = await request(app).get('/api/v1/tessera/google').set('Authorization', socio.auth);

    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^https:\/\/pay\.google\.com\/gp\/v\/save\//);

    const firmato = res.body.url.split('/').pop();
    const dati = jwt.verify(firmato, chiavePubblicaGoogle, { algorithms: ['RS256'] });
    expect(dati).toMatchObject({ iss: 'wallet@progetto-finto.iam.gserviceaccount.com', aud: 'google', typ: 'savetowallet' });

    const [oggetto] = dati.payload.genericObjects;
    const { codice_tessera: codice } = await codiceDi(socio.utente.id);
    expect(oggetto.id).toBe(`3388000000012345678.socio_${ANNO}_${socio.utente.id.replace(/-/g, '')}`);
    expect(oggetto.classId).toBe(dati.payload.genericClasses[0].id);
    expect(oggetto.header.defaultValue.value).toBe('Lucia Bianchi');
    expect(oggetto.barcode.value).toMatch(new RegExp(`/verifica-tessera/${codice}$`));
  });
});

describe('Senza configurazione', () => {
  test('i wallet risultano spenti e i link rispondono 503', async () => {
    const salvate = Object.fromEntries(VARIABILI.map((v) => [v, process.env[v]]));
    VARIABILI.forEach((v) => delete process.env[v]);
    try {
      await pagaQuota(socio.utente.id);
      const res = await request(app).get('/api/v1/tessera').set('Authorization', socio.auth);
      expect(res.body.wallet).toEqual({ apple: false, google: false });
      expect(res.body.tessera).not.toBeNull();
      expect((await request(app).get('/api/v1/tessera/apple').set('Authorization', socio.auth)).status).toBe(503);
      expect((await request(app).get('/api/v1/tessera/google').set('Authorization', socio.auth)).status).toBe(503);
    } finally {
      Object.assign(process.env, salvate);
    }
  });
});
