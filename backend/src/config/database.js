const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    dialectOptions: {
      ssl: process.env.DB_SSL === 'true' ? {
        require: true,
        rejectUnauthorized: false
      } : false
    }
  }
);

// Test connessione
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Connessione al database stabilita con successo.');
    return true;
  } catch (error) {
    console.error('❌ Impossibile connettersi al database:', error);
    return false;
  }
};

module.exports = {
  sequelize,
  testConnection
};

