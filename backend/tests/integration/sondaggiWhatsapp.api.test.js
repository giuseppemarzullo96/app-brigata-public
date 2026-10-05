const { sequelize } = require('../../src/config/database');
const { creaUtenteConToken, pulisciUtentiTest } = require('../helpers/fixtures');
const { registraVoto } = require('../../src/services/sondaggiWhatsapp.service');
const { NON_POSSO } = require('../../src/utils/sondaggiTurno');

/**
 * Dal voto su WhatsApp al posto assegnato.
 *
 * Il punto delicato non e' assegnare, e' riconciliare: WhatsApp non manda "ho
 * aggiunto questa scelta", manda ogni volta l'elenco completo delle opzioni
 * spuntate in quel momento. Chi cambia idea produce un messaggio con
 * un'opzione in meno, e questi test servono soprattutto a garantire che quel
 * caso liberi il posto invece di accumularne un altro.
 */

const DATA = '2027-03-06';
let turnoId;

async function creaTurnoConSlot(quanti, tipo = 'frutta', porzioni = 20) {
  const [turno] = await sequelize.query(
    `INSERT INTO turni_cucina (data_turno, tipo_turno, numero_porzioni)
     VALUES (:data, 'cena', 60) RETURNING id`,
    { replacements: { data: DATA }, type: sequelize.QueryTypes.SELECT }
  );

  const slot = [];
  for (let i = 0; i < quanti; i++) {
    const [s] = await sequelize.query(
      `INSERT INTO slot_turno (turno_id, tipo_slot, numero_porzioni, stato)
       VALUES (:turnoId, :tipo, :porzioni, 'libero') RETURNING id`,
      {
        replacements: { turnoId: turno.id, tipo, porzioni },
        type: sequelize.QueryTypes.SELECT,
      }
    );
    slot.push(s.id);
  }
  return { turnoId: turno.id, slot };
}

/** Un sondaggio gia' pubblicato, con una opzione per slot. */
async function creaSondaggio(turno, slot, tipo = 'frutta', waMessageId = 'MSG-TEST-1') {
  const [sondaggio] = await sequelize.query(
    `INSERT INTO sondaggi_whatsapp (turno_id, tipo_slot, gruppo_jid, wa_message_id, domanda, stato)
     VALUES (:turnoId, :tipo, '120363000000000000@g.us', :waMessageId, 'chi puo dare una mano?', 'aperto')
     RETURNING id`,
    { replacements: { turnoId: turno, tipo, waMessageId }, type: sequelize.QueryTypes.SELECT }
  );

  const etichette = [];
  for (let i = 0; i < slot.length; i++) {
    const etichetta = `${i + 1}° posto - 20 mele`;
    await sequelize.query(
      `INSERT INTO opzioni_sondaggio_whatsapp (sondaggio_id, slot_id, etichetta)
       VALUES (:sondaggioId, :slotId, :etichetta)`,
      {
        replacements: { sondaggioId: sondaggio.id, slotId: slot[i], etichetta },
        type: sequelize.QueryTypes.INSERT,
      }
    );
    etichette.push(etichetta);
  }
  return { sondaggioId: sondaggio.id, etichette, waMessageId };
}

async function statoSlot(slotId) {
  const [s] = await sequelize.query(
    'SELECT stato, user_id FROM slot_turno WHERE id = :id',
    { replacements: { id: slotId }, type: sequelize.QueryTypes.SELECT }
  );
  return s;
}

const voto = (waMessageId, etichette, chi = {}) => ({
  waMessageId,
  lid: chi.lid || '44160971190503',
  telefono: chi.telefono || '393330000000',
  pushName: chi.pushName || 'Marzullo',
  etichette,
});

beforeAll(async () => {
  await sequelize.authenticate();
});

afterAll(async () => {
  await sequelize.close();
});

beforeEach(async () => {
  await sequelize.query(`DELETE FROM partecipazioni_attivita WHERE data_attivita = '${DATA}'`);
  await sequelize.query(`DELETE FROM turni_cucina WHERE data_turno = '${DATA}'`);
  await sequelize.query("DELETE FROM users WHERE email LIKE 'wa-%@fittizio.labrigataodv.it'");
  await pulisciUtentiTest(sequelize);
});

describe('Chi vota viene riconosciuto o registrato', () => {
  test('un numero sconosciuto diventa un segnaposto col nome WhatsApp', async () => {
    const { turnoId: t, slot } = await creaTurnoConSlot(3);
    const { etichette, waMessageId } = await creaSondaggio(t, slot);

    const esito = await registraVoto(sequelize, voto(waMessageId, [etichette[0]]));

    expect(esito.anagraficaCreata).toBe(true);
    const [creato] = await sequelize.query(
      'SELECT nome, telefono, wa_lid, fittizio FROM users WHERE id = :id',
      { replacements: { id: esito.utenteId }, type: sequelize.QueryTypes.SELECT }
    );
    // Il nome WhatsApp e' molto piu' utile del numero nudo da rinominare poi.
    expect(creato.nome).toBe('Marzullo');
    expect(creato.telefono).toBe('393330000000');
    expect(creato.fittizio).toBe(true);
  });

  test('un socio gia in archivio viene riconosciuto dal numero, non duplicato', async () => {
    const socio = await creaUtenteConToken(sequelize, { ruolo: 'socio_volontario' });
    // Scritto come lo scriverebbe una persona, non in formato internazionale.
    await sequelize.query("UPDATE users SET telefono = '333 1234567' WHERE id = :id", {
      replacements: { id: socio.utente.id }, type: sequelize.QueryTypes.UPDATE,
    });

    const { turnoId: t, slot } = await creaTurnoConSlot(2);
    const { etichette, waMessageId } = await creaSondaggio(t, slot);

    const esito = await registraVoto(
      sequelize,
      voto(waMessageId, [etichette[0]], { telefono: '393331234567', lid: 'LID-NUOVO' })
    );

    expect(esito.anagraficaCreata).toBe(false);
    expect(esito.utenteId).toBe(socio.utente.id);
  });

  test('al primo riconoscimento gli viene salvato il lid, che non cambia mai', async () => {
    const socio = await creaUtenteConToken(sequelize, { ruolo: 'socio_volontario' });
    await sequelize.query("UPDATE users SET telefono = '+39 333 9999999' WHERE id = :id", {
      replacements: { id: socio.utente.id }, type: sequelize.QueryTypes.UPDATE,
    });

    const { turnoId: t, slot } = await creaTurnoConSlot(2);
    const { etichette, waMessageId } = await creaSondaggio(t, slot);

    await registraVoto(sequelize, voto(waMessageId, [etichette[0]], {
      telefono: '393339999999', lid: 'LID-STABILE',
    }));

    const [dopo] = await sequelize.query('SELECT wa_lid FROM users WHERE id = :id', {
      replacements: { id: socio.utente.id }, type: sequelize.QueryTypes.SELECT,
    });
    expect(dopo.wa_lid).toBe('LID-STABILE');
  });

  test('due voti della stessa persona non creano due anagrafiche', async () => {
    const { turnoId: t, slot } = await creaTurnoConSlot(3);
    const { etichette, waMessageId } = await creaSondaggio(t, slot);

    const primo = await registraVoto(sequelize, voto(waMessageId, [etichette[0]]));
    const secondo = await registraVoto(sequelize, voto(waMessageId, [etichette[0], etichette[1]]));

    expect(secondo.utenteId).toBe(primo.utenteId);
    expect(secondo.anagraficaCreata).toBe(false);
  });
});

describe('Il voto assegna i posti', () => {
  test('una spunta assegna quel posto preciso', async () => {
    const { turnoId: t, slot } = await creaTurnoConSlot(3);
    const { etichette, waMessageId } = await creaSondaggio(t, slot);

    const esito = await registraVoto(sequelize, voto(waMessageId, [etichette[1]]));

    expect(esito.assegnati).toEqual([slot[1]]);
    expect((await statoSlot(slot[1])).stato).toBe('assegnato');
    // Gli altri non si muovono.
    expect((await statoSlot(slot[0])).stato).toBe('libero');
    expect((await statoSlot(slot[2])).stato).toBe('libero');
  });

  test('una persona puo prendersi piu posti nello stesso sondaggio', async () => {
    const { turnoId: t, slot } = await creaTurnoConSlot(3);
    const { etichette, waMessageId } = await creaSondaggio(t, slot);

    const esito = await registraVoto(sequelize, voto(waMessageId, [etichette[0], etichette[2]]));

    expect(esito.assegnati).toHaveLength(2);
    expect((await statoSlot(slot[0])).stato).toBe('assegnato');
    expect((await statoSlot(slot[2])).stato).toBe('assegnato');
  });

  test('assegnare registra anche la partecipazione, come una prenotazione normale', async () => {
    const { turnoId: t, slot } = await creaTurnoConSlot(2);
    const { etichette, waMessageId } = await creaSondaggio(t, slot);

    const esito = await registraVoto(sequelize, voto(waMessageId, [etichette[0]]));

    const righe = await sequelize.query(
      'SELECT id FROM partecipazioni_attivita WHERE slot_id = :slotId AND user_id = :userId',
      {
        replacements: { slotId: slot[0], userId: esito.utenteId },
        type: sequelize.QueryTypes.SELECT,
      }
    );
    expect(righe).toHaveLength(1);
  });
});

describe('«Questa volta non posso»', () => {
  test('chi vota solo «non posso» non prende nessun posto', async () => {
    const { turnoId: t, slot } = await creaTurnoConSlot(2);
    const { waMessageId } = await creaSondaggio(t, slot);

    const esito = await registraVoto(sequelize, voto(waMessageId, [NON_POSSO]));

    expect(esito.assegnati).toEqual([]);
    expect((await statoSlot(slot[0])).stato).toBe('libero');
    expect((await statoSlot(slot[1])).stato).toBe('libero');
  });

  test('chi passa da un posto a «non posso» lo libera', async () => {
    const { turnoId: t, slot } = await creaTurnoConSlot(2);
    const { etichette, waMessageId } = await creaSondaggio(t, slot);

    await registraVoto(sequelize, voto(waMessageId, [etichette[0]]));
    const esito = await registraVoto(sequelize, voto(waMessageId, [NON_POSSO]));

    expect(esito.liberati).toEqual([slot[0]]);
    expect((await statoSlot(slot[0])).stato).toBe('libero');
  });
});

describe('Chi cambia idea libera il posto', () => {
  test('togliere una spunta libera quel posto, non un altro', async () => {
    const { turnoId: t, slot } = await creaTurnoConSlot(3);
    const { etichette, waMessageId } = await creaSondaggio(t, slot);

    await registraVoto(sequelize, voto(waMessageId, [etichette[0], etichette[1]]));
    const esito = await registraVoto(sequelize, voto(waMessageId, [etichette[1]]));

    expect(esito.liberati).toEqual([slot[0]]);
    expect((await statoSlot(slot[0])).stato).toBe('libero');
    expect((await statoSlot(slot[1])).stato).toBe('assegnato');
  });

  test('togliere tutte le spunte libera tutto', async () => {
    const { turnoId: t, slot } = await creaTurnoConSlot(3);
    const { etichette, waMessageId } = await creaSondaggio(t, slot);

    await registraVoto(sequelize, voto(waMessageId, [etichette[0], etichette[1]]));
    const esito = await registraVoto(sequelize, voto(waMessageId, []));

    expect(esito.liberati).toHaveLength(2);
    expect((await statoSlot(slot[0])).stato).toBe('libero');
    expect((await statoSlot(slot[1])).stato).toBe('libero');
  });

  test('liberando sparisce anche la partecipazione', async () => {
    const { turnoId: t, slot } = await creaTurnoConSlot(2);
    const { etichette, waMessageId } = await creaSondaggio(t, slot);

    const primo = await registraVoto(sequelize, voto(waMessageId, [etichette[0]]));
    await registraVoto(sequelize, voto(waMessageId, []));

    const righe = await sequelize.query(
      'SELECT id FROM partecipazioni_attivita WHERE slot_id = :slotId AND user_id = :userId',
      {
        replacements: { slotId: slot[0], userId: primo.utenteId },
        type: sequelize.QueryTypes.SELECT,
      }
    );
    expect(righe).toHaveLength(0);
  });

  test('un ripensamento ripetuto non moltiplica le assegnazioni', async () => {
    const { turnoId: t, slot } = await creaTurnoConSlot(3);
    const { etichette, waMessageId } = await creaSondaggio(t, slot);

    // Lo stesso andirivieni osservato nel test reale su WhatsApp.
    await registraVoto(sequelize, voto(waMessageId, [etichette[0]]));
    await registraVoto(sequelize, voto(waMessageId, [etichette[1]]));
    await registraVoto(sequelize, voto(waMessageId, [etichette[2]]));
    await registraVoto(sequelize, voto(waMessageId, [etichette[0]]));

    const assegnati = await sequelize.query(
      "SELECT id FROM slot_turno WHERE turno_id = :t AND stato = 'assegnato'",
      { replacements: { t }, type: sequelize.QueryTypes.SELECT }
    );
    expect(assegnati).toHaveLength(1);
  });
});

describe('Se lo prende il primo che vota', () => {
  test('la seconda persona sulla stessa opzione non prende il posto: il primo resta', async () => {
    const { turnoId: t, slot } = await creaTurnoConSlot(2);
    const { etichette, waMessageId } = await creaSondaggio(t, slot);

    const primo = await registraVoto(sequelize, voto(waMessageId, [etichette[0]]));
    const secondo = await registraVoto(sequelize, voto(waMessageId, [etichette[0]], {
      lid: 'LID-ALTRO', telefono: '393480000000', pushName: 'Anna',
    }));

    expect(secondo.assegnati).toHaveLength(0);
    expect(secondo.occupati).toEqual([slot[0]]);
    // Il posto resta di chi e' arrivato prima.
    expect((await statoSlot(slot[0])).user_id).toBe(primo.utenteId);
  });
});

describe('Chi toglie il voto passa il posto al prossimo in lista', () => {
  const ANNA = { lid: 'LID-ANNA', telefono: '393480000001', pushName: 'Anna' };
  const BRUNO = { lid: 'LID-BRUNO', telefono: '393480000002', pushName: 'Bruno' };

  async function note(slotId) {
    const [s] = await sequelize.query('SELECT note FROM slot_turno WHERE id = :id', {
      replacements: { id: slotId }, type: sequelize.QueryTypes.SELECT,
    });
    return s.note || '';
  }

  test('chi vota un posto gia preso entra in lista d attesa', async () => {
    const { turnoId: t, slot } = await creaTurnoConSlot(2);
    const { etichette, waMessageId } = await creaSondaggio(t, slot);

    await registraVoto(sequelize, voto(waMessageId, [etichette[0]]));
    const anna = await registraVoto(sequelize, voto(waMessageId, [etichette[0]], ANNA));

    expect(anna.inAttesa).toEqual([slot[0]]);
    expect(await note(slot[0])).toMatch(/Votato anche da Anna su WhatsApp: in lista d'attesa/);
  });

  test('il posto liberato passa al secondo, e poi al terzo', async () => {
    const { turnoId: t, slot } = await creaTurnoConSlot(2);
    const { etichette, waMessageId } = await creaSondaggio(t, slot);

    await registraVoto(sequelize, voto(waMessageId, [etichette[0]]));
    const anna = await registraVoto(sequelize, voto(waMessageId, [etichette[0]], ANNA));
    const bruno = await registraVoto(sequelize, voto(waMessageId, [etichette[0]], BRUNO));

    // Il primo si sfila: tocca ad Anna, che aveva votato prima di Bruno.
    const primo = await registraVoto(sequelize, voto(waMessageId, []));
    expect(primo.scalati).toEqual([{ slotId: slot[0], userId: anna.utenteId }]);
    expect((await statoSlot(slot[0])).user_id).toBe(anna.utenteId);

    // Si sfila anche Anna: tocca a Bruno.
    await registraVoto(sequelize, voto(waMessageId, [], ANNA));
    expect((await statoSlot(slot[0])).user_id).toBe(bruno.utenteId);

    // E se si sfila Bruno, non c'e' piu' nessuno: il posto torna libero.
    await registraVoto(sequelize, voto(waMessageId, [], BRUNO));
    expect((await statoSlot(slot[0])).stato).toBe('libero');
  });

  test('chi riceve il posto dalla lista ha anche la partecipazione', async () => {
    const { turnoId: t, slot } = await creaTurnoConSlot(1);
    const { etichette, waMessageId } = await creaSondaggio(t, slot);

    await registraVoto(sequelize, voto(waMessageId, [etichette[0]]));
    const anna = await registraVoto(sequelize, voto(waMessageId, [etichette[0]], ANNA));
    await registraVoto(sequelize, voto(waMessageId, []));

    const partecipazioni = await sequelize.query(
      'SELECT user_id FROM partecipazioni_attivita WHERE slot_id = :s',
      { replacements: { s: slot[0] }, type: sequelize.QueryTypes.SELECT }
    );
    expect(partecipazioni.map((p) => p.user_id)).toEqual([anna.utenteId]);
  });

  test('chi esce dalla lista non riceve piu il posto', async () => {
    const { turnoId: t, slot } = await creaTurnoConSlot(1);
    const { etichette, waMessageId } = await creaSondaggio(t, slot);

    await registraVoto(sequelize, voto(waMessageId, [etichette[0]]));
    await registraVoto(sequelize, voto(waMessageId, [etichette[0]], ANNA));
    await registraVoto(sequelize, voto(waMessageId, [NON_POSSO], ANNA));
    await registraVoto(sequelize, voto(waMessageId, []));

    expect((await statoSlot(slot[0])).stato).toBe('libero');
    expect(await note(slot[0])).toMatch(/Anna ha tolto il voto su WhatsApp: esce dalla lista d'attesa/);
  });

  test('le note raccontano tutto, sotto quello che aveva scritto il gestore', async () => {
    const { turnoId: t, slot } = await creaTurnoConSlot(1);
    await sequelize.query("UPDATE slot_turno SET note = 'Storico Drive (mele)' WHERE id = :s", {
      replacements: { s: slot[0] }, type: sequelize.QueryTypes.UPDATE,
    });
    const { etichette, waMessageId } = await creaSondaggio(t, slot);

    await registraVoto(sequelize, voto(waMessageId, [etichette[0]]));
    await registraVoto(sequelize, voto(waMessageId, [etichette[0]], ANNA));
    await registraVoto(sequelize, voto(waMessageId, []));

    const righe = (await note(slot[0])).split('\n');
    expect(righe[0]).toBe('Storico Drive (mele)');
    expect(righe[1]).toMatch(/^\d\d\/\d\d \d\d:\d\d · Preso da Marzullo con il sondaggio WhatsApp$/);
    expect(righe[2]).toMatch(/Votato anche da Anna su WhatsApp: in lista d'attesa$/);
    expect(righe[3]).toMatch(/Marzullo ha tolto il voto su WhatsApp: il posto passa a Anna, primo in lista d'attesa$/);
  });

  test('chi ha gia il posto dal gestore e lo vota non finisce in lista', async () => {
    const { turnoId: t, slot } = await creaTurnoConSlot(1);
    const { etichette, waMessageId } = await creaSondaggio(t, slot);

    const primo = await registraVoto(sequelize, voto(waMessageId, []));
    await sequelize.query("UPDATE slot_turno SET user_id = :u, stato = 'assegnato' WHERE id = :s", {
      replacements: { u: primo.utenteId, s: slot[0] }, type: sequelize.QueryTypes.UPDATE,
    });
    const esito = await registraVoto(sequelize, voto(waMessageId, [etichette[0]]));

    expect(esito.inAttesa).toEqual([]);
    expect(await note(slot[0])).not.toMatch(/lista d'attesa/);
  });
});

describe('Il sondaggio non scavalca il gestore', () => {
  test('non libera un posto che nel frattempo e stato riassegnato a mano', async () => {
    const { turnoId: t, slot } = await creaTurnoConSlot(2);
    const { etichette, waMessageId } = await creaSondaggio(t, slot);

    await registraVoto(sequelize, voto(waMessageId, [etichette[0]]));

    // Il gestore riassegna quel posto a un'altra persona dall'app.
    const altro = await creaUtenteConToken(sequelize, { ruolo: 'socio_volontario' });
    await sequelize.query(
      "UPDATE slot_turno SET user_id = :u, stato = 'assegnato' WHERE id = :s",
      { replacements: { u: altro.utente.id, s: slot[0] }, type: sequelize.QueryTypes.UPDATE }
    );

    // Chi aveva votato toglie la spunta: non deve poter liberare un posto
    // che ormai non e' piu' suo.
    const esito = await registraVoto(sequelize, voto(waMessageId, []));

    expect(esito.liberati).toHaveLength(0);
    const finale = await statoSlot(slot[0]);
    expect(finale.stato).toBe('assegnato');
    expect(finale.user_id).toBe(altro.utente.id);
  });
});

describe('Il gestore che vota per conto di un altro', () => {
  async function note(slotId) {
    const [r] = await sequelize.query('SELECT note FROM slot_turno WHERE id = :id', {
      replacements: { id: slotId }, type: sequelize.QueryTypes.SELECT,
    });
    return r.note || '';
  }

  test('togliendo il voto libera il posto anche se lo aveva riassegnato', async () => {
    const { turnoId: t, slot } = await creaTurnoConSlot(2);
    const { etichette, waMessageId } = await creaSondaggio(t, slot);

    const gestore = await creaUtenteConToken(sequelize, { ruolo: 'gestore_cucine', categoria_socio: 'volontario' });
    await sequelize.query("UPDATE users SET telefono = '393330000099' WHERE id = :id", {
      replacements: { id: gestore.utente.id }, type: sequelize.QueryTypes.UPDATE,
    });
    const GESTORE = { lid: 'LID-GESTORE', telefono: '393330000099', pushName: 'Gestore' };

    // Il gestore vota sul gruppo per chi si e' offerto a voce...
    const preso = await registraVoto(sequelize, voto(waMessageId, [etichette[0]], GESTORE));
    expect(preso.assegnati).toEqual([slot[0]]);

    // ...e dall'app mette il posto a nome di quella persona.
    const offerto = await creaUtenteConToken(sequelize, { ruolo: 'socio_volontario' });
    await sequelize.query(
      "UPDATE slot_turno SET user_id = :u, stato = 'assegnato' WHERE id = :s",
      { replacements: { u: offerto.utente.id, s: slot[0] }, type: sequelize.QueryTypes.UPDATE }
    );

    // La persona non puo' piu' venire: il gestore toglie il voto.
    const esito = await registraVoto(sequelize, voto(waMessageId, [], GESTORE));

    expect(esito.liberati).toEqual([slot[0]]);
    const finale = await statoSlot(slot[0]);
    expect(finale.stato).toBe('libero');
    expect(finale.user_id).toBeNull();
    expect(await note(slot[0])).toMatch(/che aveva preso per Mario Rossi torna libero/);
  });
});

describe('Voti che non si applicano', () => {
  test('un sondaggio mai visto viene ignorato in silenzio', async () => {
    const esito = await registraVoto(sequelize, voto('MSG-INESISTENTE', ['qualcosa']));
    expect(esito.ignorato).toBe('sondaggio-sconosciuto');
  });

  test('un sondaggio chiuso non assegna piu niente', async () => {
    const { turnoId: t, slot } = await creaTurnoConSlot(2);
    const { etichette, waMessageId, sondaggioId } = await creaSondaggio(t, slot);
    await sequelize.query("UPDATE sondaggi_whatsapp SET stato = 'chiuso' WHERE id = :id", {
      replacements: { id: sondaggioId }, type: sequelize.QueryTypes.UPDATE,
    });

    const esito = await registraVoto(sequelize, voto(waMessageId, [etichette[0]]));

    expect(esito.ignorato).toBe('sondaggio-chiuso');
    expect((await statoSlot(slot[0])).stato).toBe('libero');
  });

  test("un'etichetta che non corrisponde a nessuna opzione non fa danni", async () => {
    const { turnoId: t, slot } = await creaTurnoConSlot(2);
    const { waMessageId } = await creaSondaggio(t, slot);

    const esito = await registraVoto(sequelize, voto(waMessageId, ['99° posto - 20 mele']));

    expect(esito.assegnati).toHaveLength(0);
    expect((await statoSlot(slot[0])).stato).toBe('libero');
  });
});
