/**
 * Script di Setup Database
 * 
 * Questo script:
 * 1. Crea il database (se non esiste)
 * 2. Esegue lo schema SQL
 * 3. Crea il primo utente admin
 * 
 * Uso: node src/database/setup.js
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const readline = require('readline');
require('dotenv').config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function createDatabase() {
  // Connessione al database postgres di default
  const dbUser = process.env.DB_USER || 'postgres';
  
  const adminClient = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: dbUser,
    password: process.env.DB_PASSWORD,
    database: 'postgres' // Connessione al database di default
  });

  try {
    await adminClient.connect();
    console.log(`✅ Connesso a PostgreSQL come utente: ${dbUser}`);

    const dbName = process.env.DB_NAME || 'labrigata_db';
    
    // Verifica se il database esiste
    const result = await adminClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );

    if (result.rows.length === 0) {
      console.log(`📦 Creazione database ${dbName}...`);
      await adminClient.query(`CREATE DATABASE ${dbName}`);
      console.log(`✅ Database ${dbName} creato con successo`);
    } else {
      console.log(`ℹ️  Database ${dbName} già esistente`);
    }

    await adminClient.end();
    return dbName;
  } catch (error) {
    if (error.code === '28000' || error.message.includes('does not exist')) {
      console.error('\n❌ Errore: Utente PostgreSQL non trovato!');
      console.error(`   Tentativo con utente: ${dbUser}`);
      console.error('\n💡 Soluzioni possibili:');
      console.error('   1. Su macOS, l\'utente PostgreSQL è spesso il tuo nome utente del sistema');
      console.error(`   2. Prova a modificare DB_USER nel file .env con: ${require('os').userInfo().username}`);
      console.error('   3. Oppure crea l\'utente postgres: CREATE USER postgres WITH SUPERUSER;');
      console.error('\n   Per trovare il tuo utente PostgreSQL:');
      console.error('   - psql -l (se psql è nel PATH)');
      console.error('   - Oppure controlla la configurazione PostgreSQL');
    } else {
      console.error('❌ Errore durante la creazione del database:', error.message);
    }
    throw error;
  }
}

async function executeSchema(dbName) {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: dbName
  });

  try {
    await client.connect();
    console.log(`✅ Connesso al database ${dbName}`);

    // Leggi file schema SQL
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSQL = fs.readFileSync(schemaPath, 'utf8');

    console.log('📝 Esecuzione schema SQL...');
    await client.query(schemaSQL);
    console.log('✅ Schema eseguito con successo');

    await client.end();
    return client;
  } catch (error) {
    console.error('❌ Errore durante l\'esecuzione dello schema:', error.message);
    throw error;
  }
}

async function createAdminUser(dbName) {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: dbName
  });

  try {
    await client.connect();

    // Verifica se esiste già un admin
    const existingAdmin = await client.query(
      "SELECT id FROM users WHERE ruolo = 'admin' LIMIT 1"
    );

    if (existingAdmin.rows.length > 0) {
      console.log('ℹ️  Utente admin già esistente');
      await client.end();
      return;
    }

    console.log('\n👤 Creazione utente admin...');
    const email = await question('Email admin: ') || 'admin@labrigataodv.it';
    const password = await question('Password admin: ') || 'admin123';
    const nome = await question('Nome: ') || 'Admin';
    const cognome = await question('Cognome: ') || 'Sistema';

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Inserisci utente admin
    const result = await client.query(
      `INSERT INTO users (
        email, password_hash, nome, cognome, categoria_socio, ruolo, attivo, consenso_privacy
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, email, nome, cognome`,
      [email, passwordHash, nome, cognome, 'volontario', 'admin', true, true]
    );

    console.log('\n✅ Utente admin creato con successo!');
    console.log(`   ID: ${result.rows[0].id}`);
    console.log(`   Email: ${result.rows[0].email}`);
    console.log(`   Nome: ${result.rows[0].nome} ${result.rows[0].cognome}`);
    console.log('\n⚠️  IMPORTANTE: Salva queste credenziali in un posto sicuro!');

    await client.end();
  } catch (error) {
    console.error('❌ Errore durante la creazione dell\'utente admin:', error.message);
    throw error;
  }
}

async function main() {
  try {
    console.log('🚀 Setup Database La Brigata ODV\n');
    console.log('Verifica configurazione...');
    
    if (!process.env.DB_PASSWORD) {
      console.error('❌ DB_PASSWORD non configurato in .env');
      process.exit(1);
    }

    // 1. Crea database
    const dbName = await createDatabase();

    // 2. Esegui schema
    await executeSchema(dbName);

    // 3. Crea admin
    await createAdminUser(dbName);

    console.log('\n✅ Setup completato con successo!');
    console.log('\nProssimi passi:');
    console.log('1. Avvia il backend: cd backend && npm run dev');
    console.log('2. Avvia il frontend: cd frontend && npm run dev');
    console.log('3. Accedi con le credenziali admin create');

    rl.close();
  } catch (error) {
    console.error('\n❌ Errore durante il setup:', error);
    rl.close();
    process.exit(1);
  }
}

// Esegui setup
if (require.main === module) {
  main();
}

module.exports = { createDatabase, executeSchema, createAdminUser };

