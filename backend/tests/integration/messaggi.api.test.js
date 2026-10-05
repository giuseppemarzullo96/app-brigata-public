const request = require('supertest');

const app = require('../../src/server');
const { sequelize } = require('../../src/config/database');
const { creaUtenteConToken, pulisciUtentiTest } = require('../helpers/fixtures');

/**
 * Messaggi interni.
 *
 * Il punto delicato e' la copia cifrata per il mittente. Un messaggio
 * end-to-end viene cifrato con una chiave derivata dalla pubblica di chi
 * legge: senza una seconda copia, chi lo ha scritto non puo' piu' rileggerlo,
 * e il server non lo ha mai visto in chiaro, quindi non puo' rimediare dopo.
 */

const API = '/api/v1/messaggi';

let mittente;
let destinatario;
let estraneo;

beforeAll(async () => {
  await sequelize.authenticate();
});

afterAll(async () => {
  await pulisciMessaggi();
  await pulisciUtentiTest(sequelize);
  await sequelize.close();
});

async function pulisciMessaggi() {
  await sequelize.query(
    "DELETE FROM messaggi_interni WHERE mittente_id IN (SELECT id FROM users WHERE email LIKE '%@test.local')"
  );
}

beforeEach(async () => {
  await pulisciMessaggi();
  await pulisciUtentiTest(sequelize);
  mittente = await creaUtenteConToken(sequelize, { nome: 'Mitt', ruolo: 'socio_volontario', categoria_socio: 'volontario' });
  destinatario = await creaUtenteConToken(sequelize, { nome: 'Dest', ruolo: 'socio_volontario', categoria_socio: 'volontario' });
  estraneo = await creaUtenteConToken(sequelize, { nome: 'Estraneo', ruolo: 'socio_volontario', categoria_socio: 'volontario' });
});

/** Un messaggio cifrato, con le due copie come le manda l'app. */
function messaggioCifrato(destinatarioId, extra = {}) {
  return {
    destinatario_id: destinatarioId,
    contenuto: 'cifrato-per-chi-legge',
    crittografato: 'true',
    iv: 'iv-destinatario',
    chiave_ephemeral: 'chiave-destinatario',
    contenuto_mittente: 'cifrato-per-chi-scrive',
    iv_mittente: 'iv-mittente',
    chiave_ephemeral_mittente: 'chiave-mittente',
    ...extra,
  };
}

describe('La copia cifrata per il mittente', () => {
  test('viene salvata insieme a quella del destinatario', async () => {
    const res = await request(app).post(API)
      .set('Authorization', mittente.auth)
      .send(messaggioCifrato(destinatario.utente.id));

    expect(res.status).toBe(201);
    const m = res.body.messaggio;
    expect(m.contenuto).toBe('cifrato-per-chi-legge');
    expect(m.contenuto_mittente).toBe('cifrato-per-chi-scrive');
    expect(m.iv_mittente).toBe('iv-mittente');
    expect(m.chiave_ephemeral_mittente).toBe('chiave-mittente');
  });

  test('le due copie sono diverse: non e\' lo stesso testo salvato due volte', async () => {
    const res = await request(app).post(API)
      .set('Authorization', mittente.auth)
      .send(messaggioCifrato(destinatario.utente.id));

    const m = res.body.messaggio;
    expect(m.contenuto).not.toBe(m.contenuto_mittente);
    expect(m.iv).not.toBe(m.iv_mittente);
    expect(m.chiave_ephemeral).not.toBe(m.chiave_ephemeral_mittente);
  });

  test('rileggendo la conversazione il mittente ritrova la propria copia', async () => {
    const invio = await request(app).post(API)
      .set('Authorization', mittente.auth)
      .send(messaggioCifrato(destinatario.utente.id));
    const conversazioneId = invio.body.messaggio.conversazione_id;

    // Questo e' il caso che prima si perdeva: l'app ricaricata, la memoria
    // svuotata, e il proprio messaggio illeggibile per sempre.
    const res = await request(app)
      .get(`${API}/conversazione/${conversazioneId}`)
      .set('Authorization', mittente.auth);

    expect(res.status).toBe(200);
    const m = res.body.messaggi.find((x) => x.mittente_id === mittente.utente.id);
    expect(m.contenuto_mittente).toBe('cifrato-per-chi-scrive');
    expect(m.iv_mittente).toBe('iv-mittente');
  });

  test('l\'anteprima nell\'elenco riporta la copia del mittente', async () => {
    await request(app).post(API)
      .set('Authorization', mittente.auth)
      .send(messaggioCifrato(destinatario.utente.id));

    const res = await request(app).get(`${API}/conversazioni`).set('Authorization', mittente.auth);
    expect(res.status).toBe(200);

    const conv = res.body.conversazioni.find((c) => c.altro_utente_id === destinatario.utente.id);
    expect(conv).toBeDefined();
    expect(conv.ultimo_messaggio_mittente_id).toBe(mittente.utente.id);
    expect(conv.ultimo_messaggio_contenuto_mittente).toBe('cifrato-per-chi-scrive');
    expect(conv.ultimo_messaggio_iv_mittente).toBe('iv-mittente');
    expect(conv.ultimo_messaggio_chiave_ephemeral_mittente).toBe('chiave-mittente');
  });

  test('un messaggio in chiaro resta senza copia, senza rompere niente', async () => {
    const res = await request(app).post(API)
      .set('Authorization', mittente.auth)
      .send({ destinatario_id: destinatario.utente.id, contenuto: 'ciao in chiaro' });

    expect(res.status).toBe(201);
    expect(res.body.messaggio.contenuto).toBe('ciao in chiaro');
    expect(res.body.messaggio.contenuto_mittente).toBeNull();
  });
});

describe('Una conversazione nasce con il primo messaggio', () => {
  test('senza conversazione_id il server ne crea una', async () => {
    const res = await request(app).post(API)
      .set('Authorization', mittente.auth)
      .send({ destinatario_id: destinatario.utente.id, contenuto: 'primo messaggio vero' });

    expect(res.status).toBe(201);
    expect(res.body.messaggio.conversazione_id).toBeTruthy();
  });

  test('il secondo messaggio finisce nella stessa conversazione', async () => {
    const primo = await request(app).post(API)
      .set('Authorization', mittente.auth)
      .send({ destinatario_id: destinatario.utente.id, contenuto: 'uno' });

    const secondo = await request(app).post(API)
      .set('Authorization', mittente.auth)
      .send({ destinatario_id: destinatario.utente.id, contenuto: 'due' });

    expect(secondo.body.messaggio.conversazione_id)
      .toBe(primo.body.messaggio.conversazione_id);
  });

  test('anche la risposta dell\'altro resta nella stessa conversazione', async () => {
    const primo = await request(app).post(API)
      .set('Authorization', mittente.auth)
      .send({ destinatario_id: destinatario.utente.id, contenuto: 'ci sei?' });

    const risposta = await request(app).post(API)
      .set('Authorization', destinatario.auth)
      .send({ destinatario_id: mittente.utente.id, contenuto: 'ci sono' });

    expect(risposta.body.messaggio.conversazione_id)
      .toBe(primo.body.messaggio.conversazione_id);
  });
});

describe('Chi puo\' leggere cosa', () => {
  test('un estraneo non apre la conversazione di altri due', async () => {
    const invio = await request(app).post(API)
      .set('Authorization', mittente.auth)
      .send({ destinatario_id: destinatario.utente.id, contenuto: 'fra noi due' });

    const res = await request(app)
      .get(`${API}/conversazione/${invio.body.messaggio.conversazione_id}`)
      .set('Authorization', estraneo.auth);

    expect(res.status).toBe(404);
  });

  test('l\'elenco mostra a ciascuno solo le proprie conversazioni', async () => {
    await request(app).post(API)
      .set('Authorization', mittente.auth)
      .send({ destinatario_id: destinatario.utente.id, contenuto: 'privato' });

    const res = await request(app).get(`${API}/conversazioni`).set('Authorization', estraneo.auth);
    const private_ = res.body.conversazioni.filter((c) => c.tipo_conversazione === 'privata');
    expect(private_).toHaveLength(0);
  });

  test('l\'elenco non espone le email degli altri soci', async () => {
    await request(app).post(API)
      .set('Authorization', mittente.auth)
      .send({ destinatario_id: destinatario.utente.id, contenuto: 'ciao' });

    const res = await request(app).get(`${API}/conversazioni`).set('Authorization', mittente.auth);
    const testo = JSON.stringify(res.body.conversazioni);
    expect(testo).not.toContain(destinatario.utente.email);
  });
});

describe('Il contatore dei non letti', () => {
  test('conta i messaggi ricevuti e non ancora aperti', async () => {
    await request(app).post(API)
      .set('Authorization', mittente.auth)
      .send({ destinatario_id: destinatario.utente.id, contenuto: 'uno' });
    await request(app).post(API)
      .set('Authorization', mittente.auth)
      .send({ destinatario_id: destinatario.utente.id, contenuto: 'due' });

    const res = await request(app).get(`${API}/non-letti`).set('Authorization', destinatario.auth);
    expect(res.body.count).toBe(2);
  });

  test('non conta quelli che ho scritto io', async () => {
    await request(app).post(API)
      .set('Authorization', mittente.auth)
      .send({ destinatario_id: destinatario.utente.id, contenuto: 'uno' });

    const res = await request(app).get(`${API}/non-letti`).set('Authorization', mittente.auth);
    expect(res.body.count).toBe(0);
  });

  test('aprendo la conversazione il contatore si azzera', async () => {
    const invio = await request(app).post(API)
      .set('Authorization', mittente.auth)
      .send({ destinatario_id: destinatario.utente.id, contenuto: 'leggimi' });

    await request(app)
      .get(`${API}/conversazione/${invio.body.messaggio.conversazione_id}`)
      .set('Authorization', destinatario.auth);

    const res = await request(app).get(`${API}/non-letti`).set('Authorization', destinatario.auth);
    expect(res.body.count).toBe(0);
  });
});

describe('Allegati', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');

  /** Crea un file finto con l'estensione voluta e ne restituisce il percorso. */
  function fileFinto(nome, contenuto = 'contenuto di prova') {
    // Cartella usa e getta, cosi' il file conserva il nome esatto: serve a
    // verificare che allegato_nome riporti l'originale.
    const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'allegati-'));
    const percorso = path.join(cartella, nome);
    fs.writeFileSync(percorso, contenuto);
    return percorso;
  }

  /**
   * Il percorso registrato nel messaggio deve puntare al file dove e' stato
   * davvero salvato. Se le due cose divergono il messaggio parte, la chat lo
   * mostra, e l'allegato non si apre mai: un guasto silenzioso.
   */
  async function inviaConAllegato(nome) {
    const percorso = fileFinto(nome);
    const res = await request(app).post(API)
      .set('Authorization', mittente.auth)
      .field('destinatario_id', destinatario.utente.id)
      .field('contenuto', `ecco ${nome}`)
      .attach('allegato_messaggio', percorso);
    fs.unlinkSync(percorso);
    return res;
  }

  function fileEsiste(allegatoPath) {
    // allegato_path e' del tipo /uploads/messaggi/audio/nome.aac
    const relativo = allegatoPath.replace(/^\/uploads\//, '');
    return fs.existsSync(path.join(process.env.UPLOAD_PATH || './uploads', relativo));
  }

  test('un\'immagine viene salvata dove il messaggio dice che sta', async () => {
    const res = await inviaConAllegato('foto.jpg');
    expect(res.status).toBe(201);
    const m = res.body.messaggio;
    expect(m.tipo_allegato).toBe('immagine');
    expect(m.allegato_path).toContain('/uploads/messaggi/immagini/');
    expect(fileEsiste(m.allegato_path)).toBe(true);
  });

  test('un audio .m4a viene salvato dove il messaggio dice che sta', async () => {
    const res = await inviaConAllegato('vocale.m4a');
    const m = res.body.messaggio;
    expect(m.tipo_allegato).toBe('audio');
    expect(fileEsiste(m.allegato_path)).toBe(true);
  });

  // Era il caso rotto: il controller lo chiamava audio, il middleware lo
  // posava fra i documenti, e il file non si apriva mai.
  test('un audio .aac viene salvato dove il messaggio dice che sta', async () => {
    const res = await inviaConAllegato('vocale.aac');
    const m = res.body.messaggio;
    expect(m.tipo_allegato).toBe('audio');
    expect(fileEsiste(m.allegato_path)).toBe(true);
  });

  test('un video viene salvato dove il messaggio dice che sta', async () => {
    const res = await inviaConAllegato('filmato.mp4');
    const m = res.body.messaggio;
    expect(m.tipo_allegato).toBe('video');
    expect(fileEsiste(m.allegato_path)).toBe(true);
  });

  test('un documento viene salvato dove il messaggio dice che sta', async () => {
    const res = await inviaConAllegato('scheda.pdf');
    const m = res.body.messaggio;
    expect(m.tipo_allegato).toBe('documento');
    expect(fileEsiste(m.allegato_path)).toBe(true);
  });

  test('nome e dimensione originali restano nel messaggio', async () => {
    const res = await inviaConAllegato('foto.jpg');
    const m = res.body.messaggio;
    expect(m.allegato_nome).toBe('foto.jpg');
    expect(m.allegato_dimensione).toBeGreaterThan(0);
  });

  test('una foto .heic dall\'iPhone viene accettata come immagine', async () => {
    const res = await inviaConAllegato('scatto.heic');
    const m = res.body.messaggio;
    expect(m.tipo_allegato).toBe('immagine');
    expect(fileEsiste(m.allegato_path)).toBe(true);
  });

  test('un tipo non ammesso viene rifiutato', async () => {
    const res = await inviaConAllegato('programma.exe');
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
