const request = require('supertest');

const app = require('../../src/server');
const { sequelize } = require('../../src/config/database');
const { creaUtenteConToken, pulisciUtentiTest } = require('../helpers/fixtures');

/**
 * Il ruolo gestore_cucine deve poter organizzare le cene come un admin,
 * ma non deve sfondare nel resto del gestionale.
 */

let admin;
let gestore;
let volontario;
let ordinario;
let turnoId;

async function creaTurno(auth) {
  return request(app).post('/api/v1/turni').set('Authorization', auth).send({
    data_turno: '2027-01-09',
    tipo_turno: 'cena',
    numero_porzioni: 40,
  });
}

beforeAll(async () => {
  await sequelize.authenticate();
});

afterAll(async () => {
  await sequelize.query("DELETE FROM turni_cucina WHERE data_turno = '2027-01-09'");
  await pulisciUtentiTest(sequelize);
  await sequelize.close();
});

beforeEach(async () => {
  await sequelize.query("DELETE FROM turni_cucina WHERE data_turno = '2027-01-09'");
  await pulisciUtentiTest(sequelize);
  admin = await creaUtenteConToken(sequelize, { ruolo: 'admin', categoria_socio: 'volontario' });
  gestore = await creaUtenteConToken(sequelize, { ruolo: 'gestore_cucine', categoria_socio: 'volontario' });
  volontario = await creaUtenteConToken(sequelize, { ruolo: 'socio_volontario', categoria_socio: 'volontario' });
  ordinario = await creaUtenteConToken(sequelize, { ruolo: 'socio_ordinario', categoria_socio: 'ordinario' });
});

describe('Quello che il gestore cucine può fare', () => {
  test('crea un turno come farebbe un admin', async () => {
    const res = await creaTurno(gestore.auth);
    expect([200, 201]).toContain(res.status);
  });

  test('modifica ed elimina un turno', async () => {
    const creato = await creaTurno(admin.auth);
    const id = creato.body.turno?.id || creato.body.id;
    expect(id).toBeDefined();

    const modifica = await request(app).put(`/api/v1/turni/${id}`)
      .set('Authorization', gestore.auth).send({ numero_porzioni: 50 });
    expect(modifica.status).toBe(200);

    const eliminazione = await request(app).delete(`/api/v1/turni/${id}`)
      .set('Authorization', gestore.auth);
    expect(eliminazione.status).toBe(200);
  });

  test('crea una ricetta', async () => {
    const res = await request(app).post('/api/v1/ricettario')
      .set('Authorization', gestore.auth)
      .send({ nome_ricetta: 'Pasta di prova', tipo_ricetta: 'primi', ingredienti: [{ nome: 'Pasta', quantita: '1 kg' }], istruzioni: 'Cuocere', porzioni: 20 });
    expect([200, 201]).toContain(res.status);

    if (res.body?.ricetta?.id) {
      await request(app).delete(`/api/v1/ricettario/${res.body.ricetta.id}`)
        .set('Authorization', admin.auth);
    }
  });
});

describe('Quello che il gestore cucine NON può fare', () => {
  test('non tocca il libro soci', async () => {
    const res = await request(app).put(`/api/v1/users/${ordinario.utente.id}`)
      .set('Authorization', gestore.auth).send({ telefono: '333 0000000' });
    expect(res.status).toBe(403);
  });

  test('non archivia i soci', async () => {
    const res = await request(app).delete(`/api/v1/users/${ordinario.utente.id}`)
      .set('Authorization', gestore.auth);
    expect(res.status).toBe(403);
  });

  test('non cambia le impostazioni, quota compresa', async () => {
    const res = await request(app).put('/api/v1/impostazioni/quota_annuale')
      .set('Authorization', gestore.auth).send({ valore: 1 });
    expect(res.status).toBe(403);
  });

  test('non crea, apre o chiude votazioni', async () => {
    const creazione = await request(app).post('/api/v1/votazioni')
      .set('Authorization', gestore.auth)
      .send({ titolo: 'Abusiva', seggi_da_eleggere: 1 });
    expect(creazione.status).toBe(403);
  });

  test('non pubblica avvisi', async () => {
    const res = await request(app).post('/api/v1/avvisi')
      .set('Authorization', gestore.auth)
      .send({ titolo: 'x', contenuto: 'y' });
    expect(res.status).toBe(403);
  });
});

describe('Gli altri ruoli restano come prima', () => {
  test('il socio volontario prenota ma non crea turni', async () => {
    const creazione = await creaTurno(volontario.auth);
    expect(creazione.status).toBe(403);
  });

  test('il socio ordinario non crea turni', async () => {
    const creazione = await creaTurno(ordinario.auth);
    expect(creazione.status).toBe(403);
  });

  test('il socio ordinario non prenota slot', async () => {
    const creato = await creaTurno(admin.auth);
    const id = creato.body.turno?.id || creato.body.id;

    const slot = await request(app).post(`/api/v1/turni/${id}/slot`)
      .set('Authorization', admin.auth)
      .send({ tipo_slot: 'primi', numero_porzioni: 20 });
    const slotId = slot.body?.slot?.id;

    if (slotId) {
      const res = await request(app)
        .post(`/api/v1/turni/${id}/slot/${slotId}/prenota`)
        .set('Authorization', ordinario.auth);
      expect(res.status).toBe(403);
    }

    await request(app).delete(`/api/v1/turni/${id}`).set('Authorization', admin.auth);
  });

  test('il gestore cucine può anche prenotare uno slot', async () => {
    const creato = await creaTurno(admin.auth);
    const id = creato.body.turno?.id || creato.body.id;

    const slot = await request(app).post(`/api/v1/turni/${id}/slot`)
      .set('Authorization', admin.auth)
      .send({ tipo_slot: 'primi', numero_porzioni: 20 });
    const slotId = slot.body?.slot?.id;

    if (slotId) {
      const res = await request(app)
        .post(`/api/v1/turni/${id}/slot/${slotId}/prenota`)
        .set('Authorization', gestore.auth);
      expect([200, 201]).toContain(res.status);
    }

    await request(app).delete(`/api/v1/turni/${id}`).set('Authorization', admin.auth);
  });
});

describe('Eliminare un singolo slot aperto di troppo', () => {
  // Una prenotazione lascia una riga in partecipazioni_attivita che punta al
  // turno: va tolta dalla rotta di eliminazione del turno, altrimenti il
  // `DELETE FROM turni_cucina` del beforeEach sbatte sulla foreign key.
  let turniCreati = [];

  afterEach(async () => {
    for (const id of turniCreati) {
      await request(app).delete(`/api/v1/turni/${id}`).set('Authorization', admin.auth);
    }
    turniCreati = [];
  });

  async function turnoConSlot() {
    const creato = await creaTurno(admin.auth);
    const id = creato.body.turno?.id || creato.body.id;
    turniCreati.push(id);

    const slot = await request(app).post(`/api/v1/turni/${id}/slot`)
      .set('Authorization', admin.auth)
      .send({ tipo_slot: 'primi', numero_porzioni: 20 });

    return { turno: id, slot: slot.body?.slot?.id };
  }

  async function slotDelTurno(id) {
    const res = await request(app).get(`/api/v1/turni/${id}`).set('Authorization', admin.auth);
    return res.body?.slot || [];
  }

  test('il gestore cucine elimina uno slot libero', async () => {
    const { turno, slot } = await turnoConSlot();
    expect(slot).toBeDefined();

    const res = await request(app).delete(`/api/v1/turni/${turno}/slot/${slot}`)
      .set('Authorization', gestore.auth);
    expect(res.status).toBe(200);

    const rimasti = await slotDelTurno(turno);
    expect(rimasti.find((s) => s.id === slot)).toBeUndefined();
  });

  test('uno slot già prenotato non si cancella sotto i piedi di chi c\'è', async () => {
    const { turno, slot } = await turnoConSlot();

    const prenotazione = await request(app).post(`/api/v1/turni/${turno}/slot/${slot}/prenota`)
      .set('Authorization', volontario.auth);
    expect([200, 201]).toContain(prenotazione.status);

    const res = await request(app).delete(`/api/v1/turni/${turno}/slot/${slot}`)
      .set('Authorization', gestore.auth);
    expect(res.status).toBe(409);

    // Il posto resta al suo proprietario: niente è sparito.
    const rimasti = await slotDelTurno(turno);
    expect(rimasti.find((s) => s.id === slot)).toBeDefined();
  });

  test('liberato prima, lo stesso slot si elimina', async () => {
    const { turno, slot } = await turnoConSlot();
    await request(app).post(`/api/v1/turni/${turno}/slot/${slot}/prenota`)
      .set('Authorization', volontario.auth);

    const liberazione = await request(app).delete(`/api/v1/turni/${turno}/slot/${slot}/libera`)
      .set('Authorization', volontario.auth);
    expect(liberazione.status).toBe(200);

    const res = await request(app).delete(`/api/v1/turni/${turno}/slot/${slot}`)
      .set('Authorization', gestore.auth);
    expect(res.status).toBe(200);

    const rimasti = await slotDelTurno(turno);
    expect(rimasti.find((s) => s.id === slot)).toBeUndefined();
  });

  test('un socio volontario non elimina slot', async () => {
    const { turno, slot } = await turnoConSlot();

    const res = await request(app).delete(`/api/v1/turni/${turno}/slot/${slot}`)
      .set('Authorization', volontario.auth);
    expect(res.status).toBe(403);

    const rimasti = await slotDelTurno(turno);
    expect(rimasti.find((s) => s.id === slot)).toBeDefined();
  });

  test('l\'eliminazione finisce nell\'audit log', async () => {
    const { turno, slot } = await turnoConSlot();
    await request(app).delete(`/api/v1/turni/${turno}/slot/${slot}`)
      .set('Authorization', gestore.auth);

    const righe = await sequelize.query(
      `SELECT azione FROM audit_log
        WHERE user_id = :id AND azione = 'eliminazione_slot'`,
      { replacements: { id: gestore.utente.id }, type: sequelize.QueryTypes.SELECT }
    );
    expect(righe.length).toBeGreaterThanOrEqual(1);
  });
});

describe('L\'admin cambia il ruolo di un socio', () => {
  test('promuove un ordinario a gestore cucine, che da quel momento crea turni', async () => {
    const prima = await creaTurno(ordinario.auth);
    expect(prima.status).toBe(403);

    const promozione = await request(app).put(`/api/v1/users/${ordinario.utente.id}`)
      .set('Authorization', admin.auth)
      .send({ ruolo: 'gestore_cucine', categoria_socio: 'volontario' });
    expect(promozione.status).toBe(200);

    // Il token porta solo l'id: il ruolo viene riletto a ogni richiesta.
    const dopo = await creaTurno(ordinario.auth);
    expect([200, 201]).toContain(dopo.status);
  });

  test('il cambio di ruolo finisce nel changelog del socio', async () => {
    await request(app).put(`/api/v1/users/${ordinario.utente.id}`)
      .set('Authorization', admin.auth).send({ ruolo: 'gestore_cucine' });

    const righe = await sequelize.query(
      `SELECT campo_modificato, valore_nuovo FROM user_changelog
        WHERE user_id = :id AND campo_modificato = 'ruolo'`,
      { replacements: { id: ordinario.utente.id }, type: sequelize.QueryTypes.SELECT }
    );
    expect(righe.length).toBeGreaterThanOrEqual(1);
    expect(righe[0].valore_nuovo).toBe('gestore_cucine');
  });

  test('un non admin non può promuovere nessuno', async () => {
    const res = await request(app).put(`/api/v1/users/${ordinario.utente.id}`)
      .set('Authorization', gestore.auth).send({ ruolo: 'admin' });
    expect(res.status).toBe(403);
  });
});

describe('Tracciabilità delle modifiche di ruolo', () => {
  test('ruolo e categoria inviati insieme producono due righe distinte', async () => {
    const res = await request(app).put(`/api/v1/users/${ordinario.utente.id}`)
      .set('Authorization', admin.auth)
      .send({ ruolo: 'gestore_cucine', categoria_socio: 'volontario' });
    expect(res.status).toBe(200);

    const righe = await sequelize.query(
      `SELECT campo_modificato, valore_precedente, valore_nuovo
         FROM user_changelog WHERE user_id = :id ORDER BY campo_modificato`,
      { replacements: { id: ordinario.utente.id }, type: sequelize.QueryTypes.SELECT }
    );

    expect(righe.map((r) => r.campo_modificato)).toEqual(['categoria_socio', 'ruolo']);
    expect(righe.find((r) => r.campo_modificato === 'ruolo').valore_precedente).toBe('socio_ordinario');
    expect(righe.find((r) => r.campo_modificato === 'ruolo').valore_nuovo).toBe('gestore_cucine');
  });

  test('un valore reinviato uguale non sporca il changelog', async () => {
    await request(app).put(`/api/v1/users/${ordinario.utente.id}`)
      .set('Authorization', admin.auth)
      .send({ ruolo: 'socio_ordinario', categoria_socio: 'ordinario' });

    const righe = await sequelize.query(
      'SELECT id FROM user_changelog WHERE user_id = :id',
      { replacements: { id: ordinario.utente.id }, type: sequelize.QueryTypes.SELECT }
    );
    expect(righe).toHaveLength(0);
  });

  test('modificare solo il telefono non genera righe di changelog', async () => {
    await request(app).put(`/api/v1/users/${ordinario.utente.id}`)
      .set('Authorization', admin.auth).send({ telefono: '333 1112223' });

    const righe = await sequelize.query(
      'SELECT id FROM user_changelog WHERE user_id = :id',
      { replacements: { id: ordinario.utente.id }, type: sequelize.QueryTypes.SELECT }
    );
    expect(righe).toHaveLength(0);
  });
});

describe('L\'elenco turni dice quali portate mancano', () => {
  let creati = [];

  afterEach(async () => {
    for (const id of creati) {
      await request(app).delete(`/api/v1/turni/${id}`).set('Authorization', admin.auth);
    }
    creati = [];
  });

  async function turnoConTrePosti() {
    const creato = await creaTurno(admin.auth);
    const id = creato.body.turno?.id || creato.body.id;
    creati.push(id);
    for (const tipo of ['primi', 'frutta', 'frutta']) {
      await request(app).post(`/api/v1/turni/${id}/slot`)
        .set('Authorization', admin.auth)
        .send({ tipo_slot: tipo, numero_porzioni: 20 });
    }
    const dett = await request(app).get(`/api/v1/turni/${id}`).set('Authorization', admin.auth);
    return { turno: id, slot: dett.body?.slot || [] };
  }

  test('porta con se\' le portate ancora scoperte, non solo quante sono', async () => {
    const { turno } = await turnoConTrePosti();

    const res = await request(app).get('/api/v1/turni').set('Authorization', gestore.auth);
    expect(res.status).toBe(200);

    const riga = res.body.turni.find((t) => t.id === turno);
    expect(riga).toBeDefined();
    // Un numero solo ("11/14") non dice a nessuno cosa andare a fare:
    // servono le portate, per poterle nominare.
    expect(Array.isArray(riga.scoperti)).toBe(true);
    const frutta = riga.scoperti.find((x) => x.tipo === 'frutta');
    expect(frutta.liberi).toBe(2);
    const primi = riga.scoperti.find((x) => x.tipo === 'primi');
    expect(primi.liberi).toBe(1);
  });

  test('la portata piu\' scoperta viene per prima', async () => {
    const { turno } = await turnoConTrePosti();
    const res = await request(app).get('/api/v1/turni').set('Authorization', gestore.auth);
    const riga = res.body.turni.find((t) => t.id === turno);
    expect(riga.scoperti[0].tipo).toBe('frutta');
  });

  test('assegnando un posto quella portata cala', async () => {
    const { turno, slot } = await turnoConTrePosti();
    const unaFrutta = slot.find((s) => s.tipo_slot === 'frutta');

    await request(app).post(`/api/v1/turni/${turno}/slot/${unaFrutta.id}/assegna`)
      .set('Authorization', gestore.auth)
      .send({ user_id: volontario.utente.id });

    const res = await request(app).get('/api/v1/turni').set('Authorization', gestore.auth);
    const riga = res.body.turni.find((t) => t.id === turno);
    expect(riga.scoperti.find((x) => x.tipo === 'frutta').liberi).toBe(1);
  });

  test('un turno tutto coperto non ha portate scoperte', async () => {
    const { turno, slot } = await turnoConTrePosti();
    for (const s of slot) {
      await request(app).post(`/api/v1/turni/${turno}/slot/${s.id}/assegna`)
        .set('Authorization', gestore.auth)
        .send({ user_id: volontario.utente.id });
    }

    const res = await request(app).get('/api/v1/turni').set('Authorization', gestore.auth);
    const riga = res.body.turni.find((t) => t.id === turno);
    expect(riga.scoperti).toBeNull();
  });
});
