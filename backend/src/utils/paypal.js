const logger = require('./logger');

const BASE_URL = process.env.PAYPAL_ENV === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

let cachedToken = null;
let cachedTokenExpiry = 0;

function isConfigured() {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

/**
 * Access token OAuth (client credentials), tenuto in cache fino a poco prima
 * della scadenza dichiarata da PayPal.
 */
async function getAccessToken() {
  if (cachedToken && Date.now() < cachedTokenExpiry) {
    return cachedToken;
  }

  const credenziali = Buffer
    .from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`)
    .toString('base64');

  const response = await fetch(`${BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credenziali}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`PayPal auth fallita (${response.status}): ${body}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  // Rinnova 60 secondi prima della scadenza reale.
  cachedTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

async function chiamataPayPal(path, { method = 'GET', body } = {}) {
  const token = await getAccessToken();
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const testo = await response.text();
  const data = testo ? JSON.parse(testo) : {};

  if (!response.ok) {
    logger.error(`Errore PayPal ${method} ${path} (${response.status}): ${testo}`);
    throw new Error(data.message || `Errore PayPal (${response.status})`);
  }

  return data;
}

/**
 * Crea un ordine PayPal per l'importo di una quota associativa.
 */
async function createOrder({ importo, descrizione, riferimento }) {
  return chiamataPayPal('/v2/checkout/orders', {
    method: 'POST',
    body: {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: riferimento,
          description: descrizione,
          amount: {
            currency_code: 'EUR',
            value: Number(importo).toFixed(2),
          },
        },
      ],
    },
  });
}

/**
 * Incassa un ordine approvato dall'utente.
 */
async function captureOrder(orderId) {
  return chiamataPayPal(`/v2/checkout/orders/${orderId}/capture`, { method: 'POST' });
}

/**
 * Stato di un ordine, usato per verificare lato server prima di marcare una quota pagata.
 */
async function getOrder(orderId) {
  return chiamataPayPal(`/v2/checkout/orders/${orderId}`);
}

module.exports = { isConfigured, createOrder, captureOrder, getOrder, BASE_URL };
