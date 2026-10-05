/**
 * Script per configurare automaticamente il file .env
 * 
 * Uso: node src/database/configure-env.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

function generateSecret(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

async function configureEnv() {
  const envPath = path.join(__dirname, '../../.env');
  const envExamplePath = path.join(__dirname, '../../.env.example');

  // Leggi .env.example come template
  let envContent = fs.existsSync(envExamplePath)
    ? fs.readFileSync(envExamplePath, 'utf8')
    : '';

  console.log('🔧 Configurazione file .env\n');
  console.log('Rispondi alle domande (premi Invio per usare i valori di default)\n');

  // Database
  const dbHost = await question('DB_HOST [localhost]: ') || 'localhost';
  const dbPort = await question('DB_PORT [5432]: ') || '5432';
  const dbName = await question('DB_NAME [labrigata_db]: ') || 'labrigata_db';
  const dbUser = await question('DB_USER [postgres]: ') || 'postgres';
  const dbPassword = await question('DB_PASSWORD (richiesto): ') || '';

  if (!dbPassword) {
    console.error('❌ DB_PASSWORD è obbligatorio!');
    rl.close();
    process.exit(1);
  }

  // Genera valori sicuri
  const jwtSecret = generateSecret(32);
  const encryptionKey = generateSecret(32);
  const sessionSecret = generateSecret(32);

  // Sostituisci valori nel template
  envContent = envContent.replace(/DB_HOST=.*/g, `DB_HOST=${dbHost}`);
  envContent = envContent.replace(/DB_PORT=.*/g, `DB_PORT=${dbPort}`);
  envContent = envContent.replace(/DB_NAME=.*/g, `DB_NAME=${dbName}`);
  envContent = envContent.replace(/DB_USER=.*/g, `DB_USER=${dbUser}`);
  envContent = envContent.replace(/DB_PASSWORD=.*/g, `DB_PASSWORD=${dbPassword}`);
  envContent = envContent.replace(/JWT_SECRET=.*/g, `JWT_SECRET=${jwtSecret}`);
  envContent = envContent.replace(/ENCRYPTION_KEY=.*/g, `ENCRYPTION_KEY=${encryptionKey}`);
  envContent = envContent.replace(/SESSION_SECRET=.*/g, `SESSION_SECRET=${sessionSecret}`);

  // Salva file .env
  fs.writeFileSync(envPath, envContent);

  console.log('\n✅ File .env configurato con successo!');
  console.log(`   File salvato in: ${envPath}`);
  console.log('\n⚠️  IMPORTANTE: Il file .env contiene informazioni sensibili!');
  console.log('   Assicurati che sia nel .gitignore e non condividerlo mai.\n');

  rl.close();
}

configureEnv().catch(error => {
  console.error('❌ Errore:', error);
  rl.close();
  process.exit(1);
});

