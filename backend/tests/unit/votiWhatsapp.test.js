const { estraiVoto, soloIdentificativo } = require('../../src/utils/votiWhatsapp');

/**
 * I casi qui sotto sono ritagliati su un payload REALE, catturato mandando un
 * sondaggio di prova su un gruppo e votandolo da iPhone (Evolution 2.3.7).
 * Se un aggiornamento di Evolution cambiasse la forma del pacchetto, sono
 * questi test a doverlo dire, prima che se ne accorgano i volontari trovando
 * un posto assegnato alla persona sbagliata.
 */

// Voto reale, ripulito solo delle parti che non leggiamo.
const VOTO_REALE = {
  key: {
    id: '3AE6A0F9CE94E2F289DA',
    fromMe: false,
    remoteJid: '120363000000000000@g.us',
    participant: '44160971190503@lid',
    addressingMode: 'lid',
    participantAlt: '393330000000@s.whatsapp.net',
  },
  pushName: 'Marzullo',
  messageType: 'pollUpdateMessage',
  message: {
    pollUpdateMessage: {
      vote: {
        encIv: '3ep5QvzIaCckN0fc',
        encPayload: 'oz1G/ma/b7t/FWwOpR2c1ufKjiucUuhHEdaxAwVVTYoFuBOaADiXvdNisjfDUeyAmiE=',
        selectedOptions: ['Primi - 4 posti (55 porzioni)'],
      },
      pollCreationMessageKey: {
        id: '3EB0B9BBB95417349E779C',
        fromMe: true,
        remoteJid: '120363000000000000@g.us',
      },
    },
  },
};

describe('Ritaglio degli identificativi', () => {
  test('toglie il suffisso dal numero e dal lid', () => {
    expect(soloIdentificativo('393330000000@s.whatsapp.net')).toBe('393330000000');
    expect(soloIdentificativo('44160971190503@lid')).toBe('44160971190503');
  });

  test('su valori assenti non inventa niente', () => {
    expect(soloIdentificativo(null)).toBeNull();
    expect(soloIdentificativo(undefined)).toBeNull();
  });
});

describe('Lettura di un voto vero', () => {
  test('estrae il sondaggio votato, non il messaggio del voto', () => {
    const voto = estraiVoto(VOTO_REALE);
    expect(voto.waMessageId).toBe('3EB0B9BBB95417349E779C');
  });

  test('estrae numero, lid e nome WhatsApp', () => {
    const voto = estraiVoto(VOTO_REALE);
    expect(voto.telefono).toBe('393330000000');
    expect(voto.lid).toBe('44160971190503');
    expect(voto.pushName).toBe('Marzullo');
  });

  test("estrae l'opzione in chiaro, ignorando la parte cifrata", () => {
    const voto = estraiVoto(VOTO_REALE);
    expect(voto.etichette).toEqual(['Primi - 4 posti (55 porzioni)']);
  });

  test('riporta il gruppo da cui arriva', () => {
    expect(estraiVoto(VOTO_REALE).gruppoJid).toBe('120363000000000000@g.us');
  });

  test('regge anche il pacchetto avvolto dal webhook', () => {
    const avvolto = { event: 'messages.upsert', instance: 'brigata', data: VOTO_REALE };
    expect(estraiVoto(avvolto).waMessageId).toBe('3EB0B9BBB95417349E779C');
  });
});

describe('Selezione multipla', () => {
  test('una persona che prende piu posti manda tutte le opzioni insieme', () => {
    const voto = estraiVoto({
      ...VOTO_REALE,
      message: {
        pollUpdateMessage: {
          ...VOTO_REALE.message.pollUpdateMessage,
          vote: { selectedOptions: ['1° posto - 20 mele', '3° posto - 20 mele'] },
        },
      },
    });
    expect(voto.etichette).toEqual(['1° posto - 20 mele', '3° posto - 20 mele']);
  });

  test('chi toglie tutte le spunte manda una lista vuota, non un errore', () => {
    const voto = estraiVoto({
      ...VOTO_REALE,
      message: {
        pollUpdateMessage: {
          ...VOTO_REALE.message.pollUpdateMessage,
          vote: { selectedOptions: [] },
        },
      },
    });
    expect(voto).not.toBeNull();
    expect(voto.etichette).toEqual([]);
  });
});

describe('Cosa non e un voto', () => {
  test('un messaggio di testo normale', () => {
    expect(estraiVoto({ key: { id: 'x' }, message: { conversation: 'ciao' } })).toBeNull();
  });

  test('la creazione del sondaggio stesso', () => {
    expect(estraiVoto({
      key: { id: 'y', fromMe: true },
      message: { pollCreationMessageV3: { name: 'domanda', options: [] } },
    })).toBeNull();
  });

  test('un voto che diciamo di aver mandato noi', () => {
    expect(estraiVoto({ ...VOTO_REALE, key: { ...VOTO_REALE.key, fromMe: true } })).toBeNull();
  });

  test('un voto senza riferimento al sondaggio', () => {
    expect(estraiVoto({
      key: VOTO_REALE.key,
      message: { pollUpdateMessage: { vote: { selectedOptions: ['a'] } } },
    })).toBeNull();
  });

  test('un voto da cui non si capisce chi ha votato', () => {
    expect(estraiVoto({
      key: { id: 'z', fromMe: false, remoteJid: '120@g.us' },
      message: VOTO_REALE.message,
    })).toBeNull();
  });

  test('spazzatura varia', () => {
    expect(estraiVoto(null)).toBeNull();
    expect(estraiVoto('ciao')).toBeNull();
    expect(estraiVoto({})).toBeNull();
  });
});
