const { ripulisci, inizializza } = require('../../src/utils/monitoraggio');

/**
 * La raccolta errori manda i dati a un servizio esterno: quello che viene
 * rimosso dal payload e' l'unica cosa che impedisce a password, contatti dei
 * soci e contenuto delle schede elettorali di uscire dal server.
 */

describe('Ripulitura del payload inviato al raccoglitore errori', () => {
  test('rimuove le password in ogni loro forma', () => {
    const pulito = ripulisci({
      password: 'segreta',
      currentPassword: 'vecchia',
      newPassword: 'nuova',
    });
    expect(Object.values(pulito)).toEqual(['[rimosso]', '[rimosso]', '[rimosso]']);
  });

  test('rimuove il contenuto della scheda elettorale', () => {
    const pulito = ripulisci({ candidati: ['c1', 'c2', 'c3'], scheda_bianca: false });
    expect(pulito.candidati).toBe('[rimosso]');
    expect(pulito.scheda_bianca).toBe('[rimosso]');
  });

  test('rimuove i dati di contatto dei soci', () => {
    const pulito = ripulisci({
      email: 'mario@esempio.it',
      telefono: '333 1234567',
      indirizzo: 'Via Roma 1',
      codice_fiscale: 'RSSMRA80A01H501U',
      note: 'annotazione interna',
    });
    Object.values(pulito).forEach((v) => expect(v).toBe('[rimosso]'));
  });

  test('rimuove i campi annidati, non solo quelli di primo livello', () => {
    const pulito = ripulisci({
      body: { utente: { email: 'mario@esempio.it', nome: 'Mario' } },
    });
    expect(pulito.body.utente.email).toBe('[rimosso]');
    // Il nome resta: serve a capire il contesto e non e' un contatto.
    expect(pulito.body.utente.nome).toBe('Mario');
  });

  test('il confronto sui nomi dei campi ignora le maiuscole', () => {
    expect(ripulisci({ Password: 'x', EMAIL: 'y' })).toEqual({
      Password: '[rimosso]', EMAIL: '[rimosso]',
    });
  });

  test('lascia intatto quello che serve a diagnosticare', () => {
    const pulito = ripulisci({
      votazione_id: 'abc', stato: 'aperta', seggi_da_eleggere: 3, messaggio: 'errore x',
    });
    expect(pulito).toEqual({
      votazione_id: 'abc', stato: 'aperta', seggi_da_eleggere: 3, messaggio: 'errore x',
    });
  });

  test('non si rompe su valori non oggetto', () => {
    expect(ripulisci(null)).toBeNull();
    expect(ripulisci('testo')).toBe('testo');
    expect(ripulisci(42)).toBe(42);
    expect(ripulisci(undefined)).toBeUndefined();
  });

  test('gestisce gli array', () => {
    const pulito = ripulisci({ utenti: [{ email: 'a@b.it' }, { email: 'c@d.it' }] });
    expect(pulito.utenti[0].email).toBe('[rimosso]');
    expect(pulito.utenti[1].email).toBe('[rimosso]');
  });
});

describe('Coerenza della lista', () => {
  test('tutte le voci sono in minuscolo, altrimenti non verrebbero riconosciute', () => {
    // Il confronto e' su chiave.toLowerCase(): una voce in camelCase nella
    // lista non corrisponderebbe mai, e il campo uscirebbe in chiaro.
    const { DA_RIMUOVERE } = require('../../src/utils/monitoraggio');
    if (DA_RIMUOVERE) {
      DA_RIMUOVERE.forEach((v) => expect(v).toBe(v.toLowerCase()));
    }
  });
});

describe('Attivazione', () => {
  test('senza SENTRY_DSN non si attiva e non invia nulla', () => {
    const precedente = process.env.SENTRY_DSN;
    delete process.env.SENTRY_DSN;
    expect(inizializza()).toBe(false);
    if (precedente) process.env.SENTRY_DSN = precedente;
  });
});
