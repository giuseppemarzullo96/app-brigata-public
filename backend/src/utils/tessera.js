const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');
const { linkApp } = require('./link');
const { CARICHE, inCaricaAl } = require('./direttivo');
const logger = require('./logger');

/**
 * La tessera associativa digitale, per Apple Wallet e Google Wallet.
 *
 * La tessera spetta a chi e' in regola con la quota dell'anno in corso ed e'
 * un socio attivo: non archiviato, non sospeso, non un account fittizio.
 * Scade il 31 dicembre dell'anno della quota; con la quota nuova il socio la
 * aggiunge di nuovo e il wallet sostituisce la vecchia.
 *
 * I pass nel wallet non si aggiornano da soli: se un socio viene sospeso a
 * meta' anno, la tessera resta nel suo telefono. Fa fede il QR, che porta alla
 * pagina di verifica e mostra lo stato di adesso, non quello del giorno in cui
 * la tessera e' stata aggiunta.
 *
 * Configurazione (le chiavi stanno in file fuori dal repository, montati nel
 * container in sola lettura):
 *   APPLE_WALLET_PASS_TYPE_ID, APPLE_WALLET_TEAM_ID,
 *   APPLE_WALLET_CERT, APPLE_WALLET_KEY, APPLE_WALLET_WWDR  (percorsi dei PEM),
 *   APPLE_WALLET_KEY_PASSPHRASE                           (se la chiave e' cifrata)
 *   GOOGLE_WALLET_ISSUER_ID, GOOGLE_WALLET_CREDENZIALI      (percorso del JSON del service account)
 * Senza configurazione il relativo pulsante non compare.
 */

const ORGANIZZAZIONE = 'La Brigata ODV';
const CARTELLA_IMMAGINI = path.join(__dirname, '..', 'assets', 'wallet');
const IMMAGINI_APPLE = ['icon.png', 'icon@2x.png', 'icon@3x.png', 'logo.png', 'logo@2x.png', 'logo@3x.png'];

/** L'anno in corso all'ora italiana: a mezzanotte di capodanno UTC in Italia e' gia' l'anno nuovo. */
function annoCorrente(adesso = new Date()) {
  return Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric' }).format(adesso));
}

const numeroStampato = (n) => String(n).padStart(4, '0');
const linkVerifica = (codice) => linkApp(`verifica-tessera/${codice}`);

/** Fine dell'anno sociale. A dicembre l'Italia e' a UTC+1. */
const fineAnno = (anno) => `${anno}-12-31T23:59:59+01:00`;
const inizioAnno = (anno) => `${anno}-01-01T00:00:00+01:00`;

const CATEGORIE = {
  volontario: 'Socio volontario',
  ordinario: 'Socio ordinario',
  simpatizzante: 'Simpatizzante',
  esterno: 'Esterno',
  giuridico: 'Socio (ente)',
};
const NOMI_CARICHE = {
  presidente: 'Presidente',
  vicepresidente: 'Vicepresidente',
  segretario: 'Segretario',
  consigliere: 'Consigliere',
};
// Il ruolo nell'app compare solo se dice qualcosa a chi guarda la tessera:
// "admin" e' un permesso del gestionale, non una qualifica dell'associazione.
const RUOLI_SULLA_TESSERA = { gestore_cucine: 'Gestore cucine' };

/**
 * Chi e' il socio nell'associazione: categoria, carica nel Consiglio
 * direttivo in corso oggi (la piu' alta, se ne ha piu' d'una) e ruolo.
 */
const qualificaDi = (socio) => ({
  categoria: CATEGORIE[socio.categoria_socio] || 'Socio',
  carica: NOMI_CARICHE[socio.carica] || null,
  ruolo: RUOLI_SULLA_TESSERA[socio.ruolo] || null,
});

function statoDi(socio, anno) {
  if (!socio.attivo || socio.archiviato || socio.sospeso || socio.fittizio) return 'non_valida';
  if (!socio.quota_pagata) return 'quota_non_pagata';
  return 'valida';
}

async function leggiSocio(where, replacements, anno) {
  const [socio] = await sequelize.query(
    `SELECT u.id, u.nome, u.cognome, u.ragione_sociale, u.numero_tessera, u.codice_tessera,
            u.attivo, u.archiviato, u.sospeso, COALESCE(u.fittizio, false) AS fittizio,
            u.categoria_socio, u.ruolo,
            EXISTS(SELECT 1 FROM quote_associative q
                    WHERE q.user_id = u.id AND q.anno = :anno AND q.pagata) AS quota_pagata,
            (SELECT cs.carica FROM cariche_sociali cs
              WHERE cs.user_id = u.id AND ${inCaricaAl('cs', 'CURRENT_DATE')}
              ORDER BY array_position(ARRAY[:cariche]::varchar[], cs.carica) LIMIT 1) AS carica
       FROM users u
      WHERE ${where}`,
    { replacements: { ...replacements, anno, cariche: CARICHE }, type: QueryTypes.SELECT }
  );
  return socio || null;
}

/**
 * La tessera del socio per l'anno in corso, o il motivo per cui non c'e'.
 * Il numero si assegna qui la prima volta che la tessera spetta: cosi' lo
 * ricevono i soci veri, in ordine di iscrizione, e non chi si registra e basta.
 */
async function tesseraDi(userId, adesso = new Date()) {
  const anno = annoCorrente(adesso);
  const socio = await leggiSocio('u.id = :id', { id: userId }, anno);
  if (!socio) return null;

  const stato = statoDi(socio, anno);
  if (stato !== 'valida') return { anno, stato, tessera: null };

  if (socio.numero_tessera == null) {
    const [[riga]] = await sequelize.query(
      `UPDATE users SET numero_tessera = nextval('numero_tessera_seq')
        WHERE id = :id AND numero_tessera IS NULL
        RETURNING numero_tessera`,
      { replacements: { id: userId } }
    );
    // Se la riga non torna, un'altra richiesta l'ha assegnato un attimo prima.
    socio.numero_tessera = riga?.numero_tessera
      ?? (await leggiSocio('u.id = :id', { id: userId }, anno)).numero_tessera;
  }

  return {
    anno,
    stato,
    tessera: {
      userId: socio.id,
      intestatario: socio.ragione_sociale || `${socio.nome} ${socio.cognome}`.trim(),
      numero: numeroStampato(socio.numero_tessera),
      anno,
      scadenza: `31/12/${anno}`,
      urlVerifica: linkVerifica(socio.codice_tessera),
      ...qualificaDi(socio),
    },
  };
}

/**
 * Cosa sa chi legge il QR: intestatario, numero, qualifica e se la tessera
 * vale oggi. Nient'altro del socio (contatti, id) esce da qui.
 */
async function verificaCodice(codice, adesso = new Date()) {
  if (!/^[0-9a-f]{32}$/.test(String(codice || ''))) return null;
  const anno = annoCorrente(adesso);
  const socio = await leggiSocio('u.codice_tessera = :codice', { codice }, anno);
  if (!socio || socio.numero_tessera == null) return null;
  return {
    intestatario: socio.ragione_sociale || `${socio.nome} ${socio.cognome}`.trim(),
    numero: numeroStampato(socio.numero_tessera),
    anno,
    stato: statoDi(socio, anno),
    ...qualificaDi(socio),
  };
}

// --- Configurazione ---------------------------------------------------------

const leggiFile = (variabile) => {
  const percorso = process.env[variabile];
  return percorso && fs.existsSync(percorso) ? fs.readFileSync(percorso) : null;
};

function configApple() {
  const passTypeIdentifier = process.env.APPLE_WALLET_PASS_TYPE_ID;
  const teamIdentifier = process.env.APPLE_WALLET_TEAM_ID;
  const signerCert = leggiFile('APPLE_WALLET_CERT');
  const signerKey = leggiFile('APPLE_WALLET_KEY');
  const wwdr = leggiFile('APPLE_WALLET_WWDR');
  if (!passTypeIdentifier || !teamIdentifier || !signerCert || !signerKey || !wwdr) return null;
  return {
    passTypeIdentifier,
    teamIdentifier,
    certificati: { signerCert, signerKey, wwdr, signerKeyPassphrase: process.env.APPLE_WALLET_KEY_PASSPHRASE || undefined },
  };
}

function configGoogle() {
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID;
  const file = leggiFile('GOOGLE_WALLET_CREDENZIALI');
  if (!issuerId || !file) return null;
  const credenziali = JSON.parse(file.toString('utf8'));
  if (!credenziali.client_email || !credenziali.private_key) return null;
  return { issuerId, credenziali };
}

/** Quali wallet sono configurati: il frontend mostra solo i pulsanti che funzionano. */
const walletDisponibili = () => ({ apple: !!configApple(), google: !!configGoogle() });

// --- Apple Wallet -----------------------------------------------------------

/** Il file .pkpass firmato. */
function passApple(tessera) {
  const config = configApple();
  if (!config) throw new Error('Apple Wallet non configurato');

  // require qui e non in cima: senza configurazione il modulo non serve.
  const { PKPass } = require('passkit-generator');

  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: config.passTypeIdentifier,
    teamIdentifier: config.teamIdentifier,
    organizationName: ORGANIZZAZIONE,
    description: `Tessera socio ${ORGANIZZAZIONE} ${tessera.anno}`,
    // Stesso numero di serie per lo stesso anno: aggiungerla due volte la
    // sostituisce invece di duplicarla. L'anno nuovo e' una tessera nuova.
    serialNumber: `${tessera.userId}-${tessera.anno}`,
    // Niente logoText: il marchio orizzontale ha gia' il nome, accanto sarebbe doppio.
    backgroundColor: 'rgb(18, 18, 18)',
    foregroundColor: 'rgb(255, 255, 255)',
    labelColor: 'rgb(246, 233, 36)',
    expirationDate: fineAnno(tessera.anno),
    generic: {
      // La categoria fa da etichetta sopra il nome: "SOCIO VOLONTARIO".
      primaryFields: [{ key: 'socio', label: tessera.categoria.toUpperCase(), value: tessera.intestatario }],
      secondaryFields: [
        { key: 'numero', label: 'TESSERA N.', value: tessera.numero },
        { key: 'anno', label: 'ANNO SOCIALE', value: String(tessera.anno) },
        { key: 'scadenza', label: 'SCADENZA', value: tessera.scadenza },
      ],
      auxiliaryFields: [
        tessera.carica && { key: 'carica', label: 'CONSIGLIO DIRETTIVO', value: tessera.carica },
        tessera.ruolo && { key: 'ruolo', label: 'RUOLO', value: tessera.ruolo },
      ].filter(Boolean),
      backFields: [
        { key: 'verifica', label: 'Verifica', value: `Il QR porta alla pagina che conferma se la tessera e' valida oggi: ${tessera.urlVerifica}` },
        { key: 'sito', label: 'Sito', value: 'https://labrigataodv.it' },
        { key: 'app', label: 'Area soci', value: linkApp() },
      ],
    },
    barcodes: [{
      format: 'PKBarcodeFormatQR',
      message: tessera.urlVerifica,
      messageEncoding: 'iso-8859-1',
      altText: `N. ${tessera.numero}`,
    }],
  };

  const file = { 'pass.json': Buffer.from(JSON.stringify(passJson)) };
  for (const nome of IMMAGINI_APPLE) file[nome] = fs.readFileSync(path.join(CARTELLA_IMMAGINI, nome));

  return new PKPass(file, config.certificati).getAsBuffer();
}

/**
 * Safari su iPhone propone "Aggiungi a Wallet" solo se ci arriva navigando
 * sul file, non scaricandolo con una richiesta autenticata. Il link porta
 * quindi un gettone firmato che dura pochi minuti e vale solo per questo.
 */
const SCOPO_APPLE = 'tessera-apple';
const gettoneApple = (userId) =>
  jwt.sign({ scopo: SCOPO_APPLE }, process.env.JWT_SECRET, { subject: userId, expiresIn: '10m' });

function userIdDaGettoneApple(gettone) {
  try {
    const dati = jwt.verify(gettone, process.env.JWT_SECRET);
    return dati.scopo === SCOPO_APPLE ? dati.sub : null;
  } catch {
    return null;
  }
}

const linkApple = (userId) => linkApp(`api/v1/pubblico/tessera-apple/${gettoneApple(userId)}`);

// --- Google Wallet ----------------------------------------------------------

const API_GOOGLE = 'https://walletobjects.googleapis.com/walletobjects/v1';
const testo = (value) => ({ defaultValue: { language: 'it-IT', value } });
const campo = (id) => ({ firstValue: { fields: [{ fieldPath: `object.textModulesData['${id}']` }] } });

/** Il modello, uguale per tutti: numero e scadenza, poi carica e ruolo se ci sono. */
const classeGoogle = (issuerId) => ({
  id: `${issuerId}.tessera_socio`,
  classTemplateInfo: {
    cardTemplateOverride: {
      cardRowTemplateInfos: [
        { twoItems: { startItem: campo('numero'), endItem: campo('scadenza') } },
        { twoItems: { startItem: campo('carica'), endItem: campo('ruolo') } },
      ],
    },
  },
});

function oggettoGoogle(issuerId, tessera) {
  return {
    id: `${issuerId}.socio_${tessera.anno}_${tessera.userId.replace(/-/g, '')}`,
    classId: classeGoogle(issuerId).id,
    state: 'ACTIVE',
    hexBackgroundColor: '#121212',
    logo: { sourceUri: { uri: linkApp('wallet/logo.png') }, contentDescription: testo('La Brigata') },
    heroImage: { sourceUri: { uri: linkApp('wallet/hero.png') }, contentDescription: testo('La Brigata, unità di strada') },
    cardTitle: testo(ORGANIZZAZIONE),
    subheader: testo(`${tessera.categoria} · ${tessera.anno}`),
    header: testo(tessera.intestatario),
    textModulesData: [
      { id: 'numero', header: 'Tessera n.', body: tessera.numero },
      { id: 'scadenza', header: 'Scadenza', body: tessera.scadenza },
      tessera.carica && { id: 'carica', header: 'Consiglio direttivo', body: tessera.carica },
      tessera.ruolo && { id: 'ruolo', header: 'Ruolo', body: tessera.ruolo },
    ].filter(Boolean),
    barcode: { type: 'QR_CODE', value: tessera.urlVerifica, alternateText: `N. ${tessera.numero}` },
    validTimeInterval: { start: { date: inizioAnno(tessera.anno) }, end: { date: fineAnno(tessera.anno) } },
    linksModuleData: { uris: [{ id: 'sito', uri: 'https://labrigataodv.it', description: 'Sito della Brigata' }] },
  };
}

/**
 * Il link "Aggiungi a Google Wallet" crea classe e tessera solo se non
 * esistono: una tessera gia' salvata resterebbe com'era (una carica nuova,
 * una categoria cambiata). Prima di dare il link, quindi, si aggiornano via
 * API quelle che esistono gia'. Se non riesce si va avanti lo stesso: la
 * tessera resta valida, solo con i dati di prima.
 */
async function aggiornaSuGoogle({ credenziali }, classe, oggetto) {
  if (process.env.NODE_ENV === 'test') return; // nei test le credenziali sono finte
  try {
    const adesso = Math.floor(Date.now() / 1000);
    const asserzione = jwt.sign(
      { iss: credenziali.client_email, scope: 'https://www.googleapis.com/auth/wallet_object.issuer',
        aud: 'https://oauth2.googleapis.com/token', iat: adesso, exp: adesso + 600 },
      credenziali.private_key,
      { algorithm: 'RS256' }
    );
    const risposta = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: asserzione }),
    });
    const { access_token: token } = await risposta.json();
    if (!token) throw new Error(`token non ottenuto (${risposta.status})`);

    for (const [tipo, corpo] of [['genericClass', classe], ['genericObject', oggetto]]) {
      const r = await fetch(`${API_GOOGLE}/${tipo}/${encodeURIComponent(corpo.id)}`, {
        method: 'PUT',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      // 404: non esiste ancora, la crea il link al primo salvataggio.
      if (!r.ok && r.status !== 404) throw new Error(`${tipo} ${r.status}: ${(await r.text()).slice(0, 300)}`);
    }
  } catch (error) {
    logger.error('Aggiornamento della tessera su Google Wallet non riuscito:', error.message);
  }
}

/**
 * Il link "Aggiungi a Google Wallet": un JWT firmato col service account che
 * contiene la classe (il modello) e l'oggetto (la tessera). L'id della
 * tessera cambia ogni anno: l'anno nuovo e' una tessera nuova.
 */
async function linkGoogle(tessera) {
  const config = configGoogle();
  if (!config) throw new Error('Google Wallet non configurato');

  const { issuerId, credenziali } = config;
  const classe = classeGoogle(issuerId);
  const oggetto = oggettoGoogle(issuerId, tessera);
  await aggiornaSuGoogle(config, classe, oggetto);

  const firmato = jwt.sign(
    {
      iss: credenziali.client_email,
      aud: 'google',
      typ: 'savetowallet',
      origins: [linkApp()],
      payload: { genericClasses: [classe], genericObjects: [oggetto] },
    },
    credenziali.private_key,
    { algorithm: 'RS256' }
  );
  return `https://pay.google.com/gp/v/save/${firmato}`;
}

module.exports = {
  annoCorrente,
  tesseraDi,
  verificaCodice,
  walletDisponibili,
  passApple,
  linkApple,
  userIdDaGettoneApple,
  linkGoogle,
};
