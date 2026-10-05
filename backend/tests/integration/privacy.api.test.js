const request = require('supertest');

const app = require('../../src/server');
const { sequelize } = require('../../src/config/database');
const { creaUtenteConToken, pulisciUtentiTest } = require('../helpers/fixtures');

/**
 * Il libro soci non deve essere scaricabile da chiunque abbia un account.
 * L'elenco utenti serve ai menu a tendina anche ai non admin, ma con i soli
 * dati che servono a comporre un nome in una lista.
 */

const RISERVATI = ['email', 'telefono', 'indirizzo', 'citta', 'cap', 'note'];

let admin;
let socio;
let gestore;
let altro;

beforeAll(async () => {
  await sequelize.authenticate();
});

afterAll(async () => {
  await pulisciUtentiTest(sequelize);
  await sequelize.close();
});

beforeEach(async () => {
  await pulisciUtentiTest(sequelize);
  admin = await creaUtenteConToken(sequelize, { ruolo: 'admin', categoria_socio: 'volontario' });
  socio = await creaUtenteConToken(sequelize, { ruolo: 'socio_volontario', categoria_socio: 'volontario' });
  gestore = await creaUtenteConToken(sequelize, { ruolo: 'gestore_cucine', categoria_socio: 'volontario' });
  altro = await creaUtenteConToken(sequelize, {
    nome: 'Altro', ruolo: 'socio_volontario', categoria_socio: 'volontario',
  });

  await sequelize.query(
    "UPDATE users SET telefono = '333 9998887', indirizzo = 'Via Segreta 1', note = 'annotazione riservata' WHERE id = :id",
    { replacements: { id: altro.utente.id } }
  );
});

async function elenco(auth) {
  const res = await request(app).get('/api/v1/users').set('Authorization', auth);
  return { status: res.status, utenti: res.body.users || [] };
}

describe('Elenco soci: cosa vede chi non è admin', () => {
  test('non riceve email, telefono, indirizzo e note degli altri', async () => {
    const { status, utenti } = await elenco(socio.auth);
    expect(status).toBe(200);
    expect(utenti.length).toBeGreaterThan(0);

    const campi = Object.keys(utenti[0]);
    RISERVATI.forEach((c) => expect(campi).not.toContain(c));

    // Neanche cercando nell'intera risposta serializzata.
    const testo = JSON.stringify(utenti);
    expect(testo).not.toContain('333 9998887');
    expect(testo).not.toContain('Via Segreta 1');
    expect(testo).not.toContain('annotazione riservata');
    expect(testo).not.toContain(altro.utente.email);
  });

  test('riceve comunque quello che serve ai menu a tendina', async () => {
    const { utenti } = await elenco(socio.auth);
    const campi = Object.keys(utenti[0]);
    // 'attivo' e' nell'elenco perche' l'interfaccia ci filtra sopra: senza,
    // l'elenco chat e l'assegnazione di uno slot restano vuoti.
    ['id', 'nome', 'cognome', 'ruolo', 'fittizio', 'foto_profilo', 'attivo'].forEach((c) =>
      expect(campi).toContain(c)
    );
    expect(utenti.find((u) => u.id === altro.utente.id)).toBeDefined();
  });

  test('i filtri dell\'interfaccia trovano qualcuno: nessun menu a tendina vuoto', async () => {
    const { utenti } = await elenco(socio.auth);

    // Gli stessi filtri applicati da TurnoDetail (assegnazione slot) e
    // da Messaggi (avvio conversazione).
    const perAssegnazione = utenti.filter((u) => u.attivo && u.id !== socio.utente.id);
    const perChat = utenti.filter(
      (u) => u.id !== socio.utente.id && u.attivo &&
        (u.ruolo === 'admin' || ['volontario', 'ordinario'].includes(u.categoria_socio))
    );

    expect(perAssegnazione.length).toBeGreaterThan(0);
    expect(perChat.length).toBeGreaterThan(0);
  });

  test('il gestore cucine vede i nomi, che gli servono per assegnare gli slot, ma non i contatti', async () => {
    const { status, utenti } = await elenco(gestore.auth);
    expect(status).toBe(200);
    expect(utenti.length).toBeGreaterThan(0);
    RISERVATI.forEach((c) => expect(Object.keys(utenti[0])).not.toContain(c));
  });

  test('non vede soci sospesi o archiviati', async () => {
    const sospeso = await creaUtenteConToken(sequelize, { nome: 'Sospeso', sospeso: true });
    const archiviato = await creaUtenteConToken(sequelize, { nome: 'Archiviato', archiviato: true });

    const { utenti } = await elenco(socio.auth);
    const ids = utenti.map((u) => u.id);
    expect(ids).not.toContain(sospeso.utente.id);
    expect(ids).not.toContain(archiviato.utente.id);
  });

  test('non può cercare per email per indovinare gli indirizzi altrui', async () => {
    const res = await request(app)
      .get(`/api/v1/users?search=${encodeURIComponent(altro.utente.email)}`)
      .set('Authorization', socio.auth);
    expect(res.body.users).toHaveLength(0);
  });
});

describe('Elenco soci: l\'admin continua a vedere tutto', () => {
  test('riceve i campi completi del libro soci', async () => {
    const { status, utenti } = await elenco(admin.auth);
    expect(status).toBe(200);

    const campi = Object.keys(utenti[0]);
    RISERVATI.forEach((c) => expect(campi).toContain(c));

    const riga = utenti.find((u) => u.id === altro.utente.id);
    expect(riga.telefono).toBe('333 9998887');
    expect(riga.note).toBe('annotazione riservata');
  });

  test('vede anche i sospesi e può cercare per email', async () => {
    const sospeso = await creaUtenteConToken(sequelize, { nome: 'Sospeso', sospeso: true });

    const { utenti } = await elenco(admin.auth);
    expect(utenti.map((u) => u.id)).toContain(sospeso.utente.id);

    const ricerca = await request(app)
      .get(`/api/v1/users?search=${encodeURIComponent(altro.utente.email)}`)
      .set('Authorization', admin.auth);
    expect(ricerca.body.users).toHaveLength(1);
  });
});

describe('Il profilo di un altro socio resta chiuso', () => {
  test('un socio non apre la scheda di un altro', async () => {
    const res = await request(app).get(`/api/v1/users/${altro.utente.id}`)
      .set('Authorization', socio.auth);
    expect(res.status).toBe(403);
  });

  test('il proprio profilo si apre e contiene i propri dati', async () => {
    const res = await request(app).get(`/api/v1/users/${socio.utente.id}`)
      .set('Authorization', socio.auth);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(socio.utente.email);
  });
});

describe('Le note sono dell\'amministratore', () => {
  test('il socio non può scrivere le note del proprio profilo', async () => {
    await request(app).put(`/api/v1/users/${socio.utente.id}`)
      .set('Authorization', socio.auth)
      .send({ note: 'me le riscrivo io', telefono: '333 0000001' });

    const [u] = await sequelize.query(
      'SELECT note, telefono FROM users WHERE id = :id',
      { replacements: { id: socio.utente.id }, type: sequelize.QueryTypes.SELECT }
    );
    // Il telefono sì, le note no.
    expect(u.telefono).toBe('333 0000001');
    expect(u.note).not.toBe('me le riscrivo io');
  });

  test('il socio non cancella le note già scritte dall\'admin', async () => {
    await sequelize.query("UPDATE users SET note = 'quota da verificare' WHERE id = :id", {
      replacements: { id: socio.utente.id },
    });

    await request(app).put(`/api/v1/users/${socio.utente.id}`)
      .set('Authorization', socio.auth).send({ note: '' });

    const [u] = await sequelize.query('SELECT note FROM users WHERE id = :id', {
      replacements: { id: socio.utente.id }, type: sequelize.QueryTypes.SELECT,
    });
    expect(u.note).toBe('quota da verificare');
  });

  test('l\'admin le scrive senza problemi', async () => {
    const res = await request(app).put(`/api/v1/users/${socio.utente.id}`)
      .set('Authorization', admin.auth).send({ note: 'annotazione dell\'admin' });
    expect(res.status).toBe(200);

    const [u] = await sequelize.query('SELECT note FROM users WHERE id = :id', {
      replacements: { id: socio.utente.id }, type: sequelize.QueryTypes.SELECT,
    });
    expect(u.note).toBe('annotazione dell\'admin');
  });
});
