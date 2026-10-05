const { sequelize } = require('../config/database');
const { sendMailBulk } = require('./mailer');
const { sendWhatsAppBulk } = require('./whatsapp');

/**
 * Risolve i contatti (email + telefono) dei soci attivi corrispondenti a un array di
 * categorie destinatari (o 'tutti'), escludendo sospesi, archiviati o enti fittizi.
 */
async function getContattiDestinatari(destinatari) {
  const includeTutti = !destinatari || destinatari.length === 0 || destinatari.includes('tutti');

  let query = `
    SELECT email, telefono FROM users
    WHERE attivo = true AND archiviato = false AND sospeso = false AND fittizio = false
  `;
  const replacements = {};

  if (!includeTutti) {
    query += ' AND categoria_socio = ANY(:categorie)';
    replacements.categorie = destinatari;
  }

  return sequelize.query(query, {
    replacements,
    type: sequelize.QueryTypes.SELECT,
  });
}

/**
 * Invia una notifica email + WhatsApp (per chi ha un numero) a tutti gli utenti
 * corrispondenti ai destinatari indicati. Ritorna quanti invii sono andati a buon fine per canale.
 */
async function notificaDestinatari(destinatari, { subject, titolo, corpoHtml, testoWhatsapp }) {
  const contatti = await getContattiDestinatari(destinatari);
  const email = contatti.map((c) => c.email).filter(Boolean);
  const telefoni = contatti.map((c) => c.telefono).filter(Boolean);

  const emailInviate = email.length > 0 ? await sendMailBulk(email, { subject, titolo, corpoHtml }) : 0;
  const whatsappInviati = telefoni.length > 0 && testoWhatsapp
    ? await sendWhatsAppBulk(telefoni, testoWhatsapp)
    : 0;

  return { emailInviate, whatsappInviati, totaleDestinatari: contatti.length };
}

module.exports = { getContattiDestinatari, notificaDestinatari };
