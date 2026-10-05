const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { sendMail } = require('./mailer');
const { sendWhatsApp } = require('./whatsapp');
const { linkApp, rigaEmail } = require('./link');

/**
 * Dati di accesso dei soci: la password provvisoria di chi entra per la prima
 * volta (o a cui l'admin li rimanda) e il link per sceglierne una nuova
 * quando la si e' dimenticata.
 */

// Senza 0/O, 1/l/I: la password provvisoria si ricopia a mano da WhatsApp.
const ALFABETO = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Una password provvisoria di 10 caratteri, leggibile e casuale. */
function generaPassword(lunghezza = 10) {
  let password = '';
  while (password.length < lunghezza) password += ALFABETO[crypto.randomInt(ALFABETO.length)];
  return password;
}

const escape = (testo) => String(testo ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const nomeDi = (socio) => socio.nome || socio.ragione_sociale || '';

/**
 * Manda email e password provvisoria per email e, se c'e' il telefono, su
 * WhatsApp. Dice per quali canali l'invio e' riuscito: l'admin deve sapere
 * se il socio li ha ricevuti davvero.
 */
async function inviaCredenziali(socio, password, { nuovo = true } = {}) {
  const apertura = nuovo
    ? 'Il tuo account sul sistema gestionale de La Brigata ODV è stato creato.'
    : 'Ecco i nuovi dati per accedere al sistema gestionale de La Brigata ODV. La password precedente non vale più.';

  const email = await sendMail({
    to: socio.email,
    subject: nuovo ? 'Benvenuto/a su La Brigata ODV' : 'I tuoi dati di accesso a La Brigata ODV',
    titolo: nuovo ? 'Benvenuto/a!' : 'I tuoi dati di accesso',
    corpoHtml: `
      <p>Ciao ${escape(nomeDi(socio))},</p>
      <p>${apertura}</p>
      <p><strong>Email:</strong> ${escape(socio.email)}<br/>
      <strong>Password provvisoria:</strong> ${escape(password)}</p>
      <p>Dopo il primo accesso cambiala dal tuo profilo.</p>
      ${rigaEmail(linkApp('login'), 'Accedi')}
    `,
  });

  const whatsapp = socio.telefono
    ? await sendWhatsApp(
      socio.telefono,
      `${nuovo ? '👋 *Benvenuto/a su La Brigata ODV!*\n\nIl tuo account è stato creato.' : '🔑 *I tuoi dati di accesso a La Brigata ODV*\n\nLa password precedente non vale più.'}\n\n📧 Email: ${socio.email}\n🔑 Password provvisoria: ${password}\n\nAccedi su ${linkApp('login')} e cambiala dal tuo profilo.`
    )
    : { sent: false, reason: 'no-number' };

  return { email: email.sent, whatsapp: whatsapp.sent };
}

/*
 * Link per reimpostare la password.
 *
 * Il gettone e' firmato con JWT_SECRET piu' l'hash della password attuale:
 * appena la password cambia, il link smette di funzionare. Cosi' vale una
 * volta sola senza doverlo salvare da nessuna parte.
 * Sta dopo il # dell'indirizzo, che il browser non manda al server: non
 * finisce nei log di nginx.
 */
const SCOPO_RESET = 'reimposta-password';
const DURATA_RESET = '30m';
const segretoReset = (passwordHash) => `${process.env.JWT_SECRET}:${passwordHash}`;

function gettoneReset(socio) {
  return jwt.sign({ scopo: SCOPO_RESET }, segretoReset(socio.password_hash), {
    subject: socio.id,
    expiresIn: DURATA_RESET,
  });
}

/** L'id del socio a cui appartiene il gettone, senza verificarlo: serve per leggere l'hash. */
function soggettoReset(gettone) {
  const dati = jwt.decode(String(gettone || ''));
  return dati && typeof dati.sub === 'string' ? dati.sub : null;
}

function gettoneResetValido(gettone, socio) {
  try {
    const dati = jwt.verify(gettone, segretoReset(socio.password_hash));
    return dati.scopo === SCOPO_RESET && dati.sub === socio.id;
  } catch {
    return false;
  }
}

async function inviaLinkReset(socio) {
  const link = linkApp(`reimposta-password#${gettoneReset(socio)}`);

  await sendMail({
    to: socio.email,
    subject: 'Reimposta la password di La Brigata ODV',
    titolo: 'Reimposta la password',
    corpoHtml: `
      <p>Ciao ${escape(nomeDi(socio))},</p>
      <p>Abbiamo ricevuto una richiesta per reimpostare la tua password. Il link vale 30 minuti e si può usare una volta sola.</p>
      ${rigaEmail(link, 'Scegli una nuova password')}
      <p>Se non sei stato/a tu, ignora questo messaggio: la password resta quella di prima.</p>
    `,
  });

  if (socio.telefono) {
    await sendWhatsApp(
      socio.telefono,
      `🔑 *Reimposta la password di La Brigata ODV*\n\nApri questo link entro 30 minuti per sceglierne una nuova:\n${link}\n\nSe non sei stato/a tu, ignora questo messaggio.`
    );
  }
}

module.exports = {
  generaPassword,
  inviaCredenziali,
  inviaLinkReset,
  soggettoReset,
  gettoneResetValido,
};
