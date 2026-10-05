const request = require('supertest');

const app = require('../../src/server');
const { sequelize } = require('../../src/config/database');
const { creaUtenteConToken, pulisciUtentiTest } = require('../helpers/fixtures');

const PASSWORD = 'password-di-test';

let socio;
let altro;

beforeAll(async () => {
  await sequelize.authenticate();
});

afterAll(async () => {
  await sequelize.close();
});

beforeEach(async () => {
  await pulisciUtentiTest(sequelize);
  socio = await creaUtenteConToken(sequelize, { ruolo: 'socio_ordinario', nome: 'Socio' });
  altro = await creaUtenteConToken(sequelize, { ruolo: 'socio_ordinario', nome: 'Altro' });
});

async function emailDi(userId) {
  const [u] = await sequelize.query('SELECT email FROM users WHERE id = :id', {
    replacements: { id: userId },
    type: sequelize.QueryTypes.SELECT,
  });
  return u.email;
}

describe('Cambio email del proprio profilo', () => {
  test('con la password corretta l\'email cambia e si puo\' rientrare', async () => {
    const nuova = 'nuova.email@test.local';

    const res = await request(app)
      .post('/api/v1/auth/change-email')
      .set('Authorization', socio.auth)
      .send({ nuova_email: nuova, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(nuova);
    expect(await emailDi(socio.utente.id)).toBe(nuova);

    // Il login funziona con la nuova email...
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: nuova, password: PASSWORD });
    expect(login.status).toBe(200);

    // ...e non funziona piu' con la vecchia.
    const vecchio = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: socio.utente.email, password: PASSWORD });
    expect(vecchio.status).toBe(401);
  });

  test('il token gia' + ' emesso resta valido dopo il cambio', async () => {
    await request(app).post('/api/v1/auth/change-email')
      .set('Authorization', socio.auth)
      .send({ nuova_email: 'ancora.valido@test.local', password: PASSWORD });

    // L'autenticazione si basa sull'id, non sull'email dentro al token.
    const me = await request(app).get('/api/v1/auth/me').set('Authorization', socio.auth);
    expect(me.status).toBe(200);
  });

  test('senza password corretta viene rifiutato', async () => {
    const res = await request(app)
      .post('/api/v1/auth/change-email')
      .set('Authorization', socio.auth)
      .send({ nuova_email: 'tentativo@test.local', password: 'sbagliata' });

    expect(res.status).toBe(401);
    expect(await emailDi(socio.utente.id)).toBe(socio.utente.email);
  });

  test('senza autenticazione risponde 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/change-email')
      .send({ nuova_email: 'anonimo@test.local', password: PASSWORD });
    expect(res.status).toBe(401);
  });

  test('un\'email gia\' usata da un altro socio viene rifiutata', async () => {
    const res = await request(app)
      .post('/api/v1/auth/change-email')
      .set('Authorization', socio.auth)
      .send({ nuova_email: altro.utente.email, password: PASSWORD });

    expect(res.status).toBe(409);
    expect(await emailDi(socio.utente.id)).toBe(socio.utente.email);
  });

  test('il confronto con le email esistenti ignora le maiuscole', async () => {
    const res = await request(app)
      .post('/api/v1/auth/change-email')
      .set('Authorization', socio.auth)
      .send({ nuova_email: altro.utente.email.toUpperCase(), password: PASSWORD });

    expect(res.status).toBe(409);
  });

  test('l\'email viene normalizzata in minuscolo e senza spazi', async () => {
    const res = await request(app)
      .post('/api/v1/auth/change-email')
      .set('Authorization', socio.auth)
      .send({ nuova_email: '   MaIuScOlE@Test.Local  ', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('maiuscole@test.local');

    // La normalizzazione e' cio' che rende possibile il login successivo,
    // visto che il confronto in fase di accesso e' esatto.
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'maiuscole@test.local', password: PASSWORD });
    expect(login.status).toBe(200);
  });

  test('gli indirizzi malformati vengono rifiutati', async () => {
    for (const email of ['senza-chiocciola', 'due@@chiocciole.it', 'niente@dominio', '@solo-dominio.it', 'spazi nel@mezzo.it']) {
      const res = await request(app)
        .post('/api/v1/auth/change-email')
        .set('Authorization', socio.auth)
        .send({ nuova_email: email, password: PASSWORD });
      expect(res.status).toBe(400);
    }
    expect(await emailDi(socio.utente.id)).toBe(socio.utente.email);
  });

  test('campi mancanti: 400', async () => {
    const senzaEmail = await request(app).post('/api/v1/auth/change-email')
      .set('Authorization', socio.auth).send({ password: PASSWORD });
    expect(senzaEmail.status).toBe(400);

    const senzaPassword = await request(app).post('/api/v1/auth/change-email')
      .set('Authorization', socio.auth).send({ nuova_email: 'x@test.local' });
    expect(senzaPassword.status).toBe(400);
  });

  test('reinserire la propria email attuale: 400', async () => {
    const res = await request(app).post('/api/v1/auth/change-email')
      .set('Authorization', socio.auth)
      .send({ nuova_email: socio.utente.email, password: PASSWORD });
    expect(res.status).toBe(400);
  });

  test('il cambio viene registrato nel changelog del socio', async () => {
    await request(app).post('/api/v1/auth/change-email')
      .set('Authorization', socio.auth)
      .send({ nuova_email: 'tracciata@test.local', password: PASSWORD });

    const righe = await sequelize.query(
      `SELECT campo_modificato, valore_precedente, valore_nuovo
         FROM user_changelog WHERE user_id = :id AND campo_modificato = 'email'`,
      { replacements: { id: socio.utente.id }, type: sequelize.QueryTypes.SELECT }
    );

    expect(righe).toHaveLength(1);
    expect(righe[0].valore_precedente).toBe(socio.utente.email);
    expect(righe[0].valore_nuovo).toBe('tracciata@test.local');
  });

  test('la password non finisce nell\'audit log', async () => {
    await request(app).post('/api/v1/auth/change-email')
      .set('Authorization', socio.auth)
      .send({ nuova_email: 'riservata@test.local', password: PASSWORD });

    await new Promise((r) => setTimeout(r, 300));

    const righe = await sequelize.query(
      'SELECT dettagli::text AS dettagli FROM audit_log WHERE user_id = :id',
      { replacements: { id: socio.utente.id }, type: sequelize.QueryTypes.SELECT }
    );
    righe.forEach((riga) => expect(riga.dettagli).not.toContain(PASSWORD));
  });
});

describe('Cambio telefono del proprio profilo', () => {
  test('il socio puo\' modificare il proprio numero', async () => {
    const res = await request(app)
      .put(`/api/v1/users/${socio.utente.id}`)
      .set('Authorization', socio.auth)
      .send({ telefono: '333 1234567' });

    expect(res.status).toBe(200);

    const [u] = await sequelize.query('SELECT telefono FROM users WHERE id = :id', {
      replacements: { id: socio.utente.id },
      type: sequelize.QueryTypes.SELECT,
    });
    expect(u.telefono).toBe('333 1234567');
  });

  test('il socio puo\' svuotare il proprio numero', async () => {
    await request(app).put(`/api/v1/users/${socio.utente.id}`)
      .set('Authorization', socio.auth).send({ telefono: '333 1234567' });

    const res = await request(app).put(`/api/v1/users/${socio.utente.id}`)
      .set('Authorization', socio.auth).send({ telefono: '' });
    expect(res.status).toBe(200);

    const [u] = await sequelize.query('SELECT telefono FROM users WHERE id = :id', {
      replacements: { id: socio.utente.id },
      type: sequelize.QueryTypes.SELECT,
    });
    expect(u.telefono).toBe('');
  });

  test('un socio non puo\' modificare il profilo di un altro', async () => {
    const res = await request(app)
      .put(`/api/v1/users/${altro.utente.id}`)
      .set('Authorization', socio.auth)
      .send({ telefono: '333 0000000' });

    expect(res.status).toBe(403);
  });

  test('un socio non puo\' promuoversi ad admin modificando il proprio profilo', async () => {
    await request(app)
      .put(`/api/v1/users/${socio.utente.id}`)
      .set('Authorization', socio.auth)
      .send({ telefono: '333 1234567', ruolo: 'admin', categoria_socio: 'volontario' });

    const [u] = await sequelize.query(
      'SELECT ruolo, categoria_socio FROM users WHERE id = :id',
      { replacements: { id: socio.utente.id }, type: sequelize.QueryTypes.SELECT }
    );
    expect(u.ruolo).toBe('socio_ordinario');
    expect(u.categoria_socio).toBe('ordinario');
  });

  test('l\'email non e\' modificabile dalla rotta di aggiornamento profilo', async () => {
    await request(app)
      .put(`/api/v1/users/${socio.utente.id}`)
      .set('Authorization', socio.auth)
      .send({ email: 'scorciatoia@test.local' });

    // Deve restare invariata: il cambio email passa solo da /auth/change-email,
    // che richiede la password.
    expect(await emailDi(socio.utente.id)).toBe(socio.utente.email);
  });
});

describe('Cambio password del proprio profilo', () => {
  test('con la password corretta cambia e il nuovo accesso funziona', async () => {
    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', socio.auth)
      .send({ currentPassword: PASSWORD, newPassword: 'nuova-password-lunga' });

    expect(res.status).toBe(200);

    const nuovo = await request(app).post('/api/v1/auth/login')
      .send({ email: socio.utente.email, password: 'nuova-password-lunga' });
    expect(nuovo.status).toBe(200);

    const vecchio = await request(app).post('/api/v1/auth/login')
      .send({ email: socio.utente.email, password: PASSWORD });
    expect(vecchio.status).toBe(401);
  });

  test('password corrente sbagliata: rifiutato', async () => {
    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', socio.auth)
      .send({ currentPassword: 'non-e-questa', newPassword: 'nuova-password-lunga' });
    expect(res.status).toBe(401);

    // La vecchia resta valida.
    const login = await request(app).post('/api/v1/auth/login')
      .send({ email: socio.utente.email, password: PASSWORD });
    expect(login.status).toBe(200);
  });

  test('password nuova troppo corta: rifiutata', async () => {
    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', socio.auth)
      .send({ currentPassword: PASSWORD, newPassword: 'corta' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 caratteri/);
  });

  test('campi mancanti: 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', socio.auth).send({ currentPassword: PASSWORD });
    expect(res.status).toBe(400);
  });

  test('senza autenticazione: 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: PASSWORD, newPassword: 'nuova-password-lunga' });
    expect(res.status).toBe(401);
  });

  test('le password non finiscono nell\'audit log', async () => {
    await request(app).post('/api/v1/auth/change-password')
      .set('Authorization', socio.auth)
      .send({ currentPassword: PASSWORD, newPassword: 'nuova-password-lunga' });

    await new Promise((r) => setTimeout(r, 300));

    const righe = await sequelize.query(
      'SELECT dettagli::text AS dettagli FROM audit_log WHERE user_id = :id',
      { replacements: { id: socio.utente.id }, type: sequelize.QueryTypes.SELECT }
    );
    righe.forEach((r) => {
      expect(r.dettagli).not.toContain(PASSWORD);
      expect(r.dettagli).not.toContain('nuova-password-lunga');
    });
  });
});
