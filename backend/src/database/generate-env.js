/**
 * Script per generare valori sicuri per .env
 * 
 * Uso: node src/database/generate-env.js
 */

const crypto = require('crypto');

function generateSecret(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

console.log('🔐 Valori generati per il file .env:\n');
console.log('JWT_SECRET=' + generateSecret(32));
console.log('ENCRYPTION_KEY=' + generateSecret(32));
console.log('SESSION_SECRET=' + generateSecret(32));
console.log('\n⚠️  Copia questi valori nel file .env');
console.log('⚠️  IMPORTANTE: Non condividere mai questi valori!');

