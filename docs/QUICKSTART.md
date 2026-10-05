# Quick Start Guide - La Brigata ODV

## Setup Rapido Sviluppo

### 1. Prerequisiti

Assicurati di avere installato:
- Node.js 18+
- PostgreSQL 14+
- npm o yarn

### 2. Setup Backend

```bash
cd backend
npm install
cp .env.example .env
# Modifica .env con le tue credenziali database PostgreSQL
```

### 3. Setup Database (Automatico) 🎯

**Metodo Consigliato - Script Automatico:**

```bash
cd backend
npm run setup
```

Lo script farà automaticamente:
- ✅ Creazione database (se non esiste)
- ✅ Esecuzione schema SQL completo
- ✅ Creazione primo utente admin (ti chiederà email e password)

**Metodo Manuale:**

Se preferisci farlo manualmente:

```bash
# 1. Crea database
createdb labrigata_db

# Oppure con psql
psql -U postgres
CREATE DATABASE labrigata_db;
\q

# 2. Esegui schema SQL
psql -U postgres -d labrigata_db -f backend/src/database/schema.sql

# 3. Crea admin (usa lo script o inserisci manualmente)
node backend/src/database/setup.js
```

### 4. Avvio Backend

```bash
cd backend
npm run dev
```

Il backend sarà disponibile su `http://localhost:3000`

### 5. Setup Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Il frontend sarà disponibile su `http://localhost:3001`

## Test Sistema

### Health Check

```bash
curl http://localhost:3000/health
```

### Login

1. Apri `http://localhost:3001`
2. Login con credenziali admin
3. Esplora dashboard

## Prossimi Passi

1. **Completa implementazione controller**: Vedi `backend/src/controllers/` per stub da completare
2. **Aggiungi validazione**: Usa `express-validator` per validazione input
3. **Implementa email**: Configura Nodemailer per notifiche
4. **File upload**: Completa gestione upload verbali/allegati
5. **Testing**: Aggiungi test unitari e integrazione

## Troubleshooting

### Database Connection Error

- Verifica credenziali in `.env`
- Controlla che PostgreSQL sia in esecuzione
- Verifica che il database esista

### Port Already in Use

- Cambia porta in `.env` (backend) o `vite.config.ts` (frontend)
- Oppure termina processo che usa la porta

### CORS Errors

- Verifica `FRONTEND_URL` in backend `.env`
- Controlla configurazione CORS in `server.js`

## Supporto

Consulta la documentazione completa in `docs/`:
- `architettura.md` - Architettura sistema
- `api-documentation.md` - Documentazione API
- `best-practices-ux.md` - Best practices UX
- `deployment.md` - Guida deployment

