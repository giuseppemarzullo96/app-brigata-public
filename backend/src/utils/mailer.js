const nodemailer = require('nodemailer');
const logger = require('./logger');

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

function wrapTemplate({ titolo, corpoHtml }) {
  return `
  <div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; background: #ffffff;">
    <div style="background: #263654; padding: 24px; text-align: center;">
      <span style="color: #f5f518; font-size: 20px; font-weight: bold;">La Brigata ODV</span>
    </div>
    <div style="padding: 24px; color: #1f2937;">
      <h2 style="color: #263654; margin-top: 0;">${titolo}</h2>
      ${corpoHtml}
    </div>
    <div style="padding: 16px 24px; background: #f5f5f5; color: #6b7280; font-size: 12px; text-align: center;">
      La Brigata ODV &middot; labrigataodv.it &middot; Questa è una email automatica, non rispondere direttamente.
    </div>
  </div>`;
}

/**
 * Invia una email. Non lancia mai eccezioni: un fallimento SMTP non deve
 * mai interrompere il flusso applicativo che ha richiesto l'invio.
 */
async function sendMail({ to, subject, titolo, corpoHtml }) {
  if (!to) return { sent: false, reason: 'no-recipient' };
  try {
    await getTransporter().sendMail({
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to,
      subject,
      html: wrapTemplate({ titolo: titolo || subject, corpoHtml }),
    });
    return { sent: true };
  } catch (error) {
    logger.error(`Errore invio email a ${to}:`, error.message);
    return { sent: false, reason: error.message };
  }
}

/**
 * Invia la stessa email a più destinatari in sequenza, senza bloccarsi sui fallimenti singoli.
 */
async function sendMailBulk(destinatari, { subject, titolo, corpoHtml }) {
  let inviate = 0;
  for (const to of destinatari) {
    const result = await sendMail({ to, subject, titolo, corpoHtml });
    if (result.sent) inviate++;
  }
  return inviate;
}

module.exports = { sendMail, sendMailBulk };
