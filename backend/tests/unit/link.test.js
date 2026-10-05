describe('Costruzione dei link alle pagine', () => {
  const originale = process.env.FRONTEND_URL;

  afterEach(() => {
    process.env.FRONTEND_URL = originale;
    jest.resetModules();
  });

  function caricaConBase(base) {
    jest.resetModules();
    if (base === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = base;
    return require('../../src/utils/link');
  }

  test('costruisce i link delle sezioni a partire da FRONTEND_URL', () => {
    const l = caricaConBase('https://app.labrigataodv.it');

    expect(l.linkAvviso('a1')).toBe('https://app.labrigataodv.it/avvisi/a1');
    expect(l.linkSondaggio('s1')).toBe('https://app.labrigataodv.it/sondaggi/s1');
    expect(l.linkAssemblea('as1')).toBe('https://app.labrigataodv.it/assemblee/as1');
    expect(l.linkVotazione('v1')).toBe('https://app.labrigataodv.it/votazioni/v1');
    expect(l.linkProfilo('u1')).toBe('https://app.labrigataodv.it/soci/u1');
  });

  test('i percorsi corrispondono alle rotte del frontend', () => {
    // Se una rotta cambia nel frontend, questo test ricorda di aggiornare i link
    // delle notifiche: un link che porta a una pagina inesistente e' peggio
    // dell'assenza del link.
    const l = caricaConBase('https://x.it');
    const attesi = ['/avvisi/', '/sondaggi/', '/assemblee/', '/votazioni/', '/soci/'];
    const prodotti = [
      l.linkAvviso('1'), l.linkSondaggio('1'), l.linkAssemblea('1'),
      l.linkVotazione('1'), l.linkProfilo('1'),
    ];
    attesi.forEach((p, i) => expect(prodotti[i]).toContain(p));
  });

  test('non produce doppie barre se FRONTEND_URL finisce con /', () => {
    const l = caricaConBase('https://app.labrigataodv.it/');
    expect(l.linkVotazione('v1')).toBe('https://app.labrigataodv.it/votazioni/v1');
    expect(l.linkApp('/avvisi/a1')).toBe('https://app.labrigataodv.it/avvisi/a1');
  });

  test('senza FRONTEND_URL usa il dominio di produzione', () => {
    const l = caricaConBase(undefined);
    expect(l.linkVotazione('v1')).toBe('https://app.labrigataodv.it/votazioni/v1');
  });

  test('linkApp senza percorso restituisce la radice senza barra finale', () => {
    const l = caricaConBase('https://app.labrigataodv.it/');
    expect(l.linkApp()).toBe('https://app.labrigataodv.it');
  });

  test('la riga WhatsApp contiene il link su una riga propria', () => {
    const l = caricaConBase('https://app.labrigataodv.it');
    const riga = l.rigaWhatsapp(l.linkVotazione('v1'), 'Vai alla scheda');

    expect(riga).toContain('Vai alla scheda');
    expect(riga).toContain('https://app.labrigataodv.it/votazioni/v1');
    // Il link deve stare da solo sull'ultima riga, altrimenti WhatsApp
    // rischia di inglobare la punteggiatura nell'anteprima cliccabile.
    expect(riga.trim().split('\n').pop()).toBe('https://app.labrigataodv.it/votazioni/v1');
  });

  test('la riga email contiene un pulsante e il link in chiaro come riserva', () => {
    const l = caricaConBase('https://app.labrigataodv.it');
    const riga = l.rigaEmail(l.linkAvviso('a1'), 'Leggi');

    expect(riga).toContain('href="https://app.labrigataodv.it/avvisi/a1"');
    expect(riga).toContain('Leggi');
    // Chi ha il client email che blocca i pulsanti deve poter copiare l'URL.
    expect(riga.split('https://app.labrigataodv.it/avvisi/a1').length - 1).toBeGreaterThanOrEqual(2);
  });
});
