# Troubleshooting - La Brigata ODV

## Problemi Comuni e Soluzioni

### 1. Frontend non si connette al Backend

**Sintomi:**
- Errori CORS nella console
- "Network Error" nelle richieste API
- Pagine che mostrano "Caricamento..." infinito

**Soluzioni:**

1. **Verifica che il backend sia avviato:**
   ```bash
   cd backend
   npm run dev
   ```
   Dovresti vedere: `🚀 Server avviato su porta 3000`

2. **Verifica che il frontend sia avviato:**
   ```bash
   cd frontend
   npm run dev
   ```
   Dovresti vedere: `Local: http://localhost:3001/`

3. **Verifica configurazione CORS:**
   - Controlla `backend/.env` che `FRONTEND_URL=http://localhost:3001`
   - Riavvia il backend dopo modifiche al `.env`

4. **Testa connessione:**
   ```bash
   curl http://localhost:3000/health
   ```
   Dovrebbe restituire: `{"status":"ok","database":"connected",...}`

### 2. Errori di Autenticazione

**Sintomi:**
- Redirect continuo al login
- "Token non valido"
- 401 Unauthorized

**Soluzioni:**

1. **Verifica che esista un utente admin:**
   ```bash
   cd backend
   npm run setup
   ```

2. **Verifica JWT_SECRET nel .env:**
   - Deve essere una stringa di almeno 32 caratteri
   - Non deve essere "your_super_secret_jwt_key_change_in_production"

3. **Pulisci localStorage:**
   - Apri DevTools (F12)
   - Console → `localStorage.clear()`
   - Ricarica la pagina

### 3. Errori Database

**Sintomi:**
- "Database connection error"
- "role does not exist"
- 500 Internal Server Error

**Soluzioni:**

1. **Verifica PostgreSQL in esecuzione:**
   ```bash
   # macOS
   brew services list | grep postgresql
   
   # Linux
   sudo systemctl status postgresql
   ```

2. **Verifica credenziali in `.env`:**
   ```env
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=labrigata_db
   DB_USER=marzumini  # o il tuo utente PostgreSQL
   DB_PASSWORD=tua_password
   ```

3. **Verifica database esiste:**
   ```bash
   psql -U marzumini -l | grep labrigata_db
   ```

4. **Riesegui setup:**
   ```bash
   cd backend
   npm run setup
   ```

### 4. Errori TypeScript/Compilazione

**Sintomi:**
- Errori durante `npm run build`
- Errori nella console Vite

**Soluzioni:**

1. **Pulisci cache:**
   ```bash
   cd frontend
   rm -rf node_modules/.vite
   rm -rf dist
   ```

2. **Reinstalla dipendenze:**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

3. **Verifica TypeScript:**
   ```bash
   npm run build
   ```

### 5. Pagine Vuote o "Funzionalità in sviluppo"

**Sintomi:**
- Pagine che mostrano solo "Funzionalità in sviluppo"
- Liste vuote anche se ci sono dati

**Soluzioni:**

1. **Verifica che le API rispondano:**
   ```bash
   # Con token valido
   curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/v1/turni
   ```

2. **Controlla console browser:**
   - F12 → Console
   - Cerca errori in rosso
   - Verifica Network tab per richieste fallite

3. **Verifica permessi utente:**
   - Solo admin può creare/modificare
   - Verifica ruolo utente nel database

### 6. Porte Occupate

**Sintomi:**
- "Port 3000 already in use"
- "Port 3001 already in use"

**Soluzioni:**

1. **Trova processo che usa la porta:**
   ```bash
   # macOS/Linux
   lsof -i :3000
   lsof -i :3001
   ```

2. **Termina processo:**
   ```bash
   kill -9 <PID>
   ```

3. **Cambia porta:**
   - Backend: modifica `PORT` in `backend/.env`
   - Frontend: modifica `port` in `frontend/vite.config.ts`

### 7. Errori di Import/Module

**Sintomi:**
- "Cannot find module"
- "No matching export"

**Soluzioni:**

1. **Verifica che tutti i file esistano**
2. **Controlla import paths:**
   - Usa path relativi: `'../services/authService'`
   - Non usare estensioni `.ts` negli import

3. **Riavvia dev server:**
   ```bash
   # Ctrl+C per fermare
   npm run dev
   ```

## Checklist Diagnostica

Prima di chiedere aiuto, verifica:

- [ ] Backend avviato e risponde a `/health`
- [ ] Frontend avviato su porta 3001
- [ ] Database PostgreSQL in esecuzione
- [ ] File `.env` configurato correttamente
- [ ] Utente admin creato
- [ ] Nessun errore nella console browser
- [ ] Nessun errore nei log backend
- [ ] Token JWT valido in localStorage

## Log da Controllare

### Backend Logs
```bash
cd backend
npm run dev
# Guarda output console per errori
```

### Frontend Logs
- Apri DevTools (F12)
- Console tab per errori JavaScript
- Network tab per errori API

### Database Logs
```bash
# PostgreSQL logs (macOS Homebrew)
tail -f /usr/local/var/log/postgres.log
```

## Comandi Utili

```bash
# Test connessione database
cd backend
node -e "require('dotenv').config(); const {testConnection} = require('./src/config/database'); testConnection();"

# Verifica schema database
psql -U marzumini -d labrigata_db -c "\dt"

# Conta record in tabella
psql -U marzumini -d labrigata_db -c "SELECT COUNT(*) FROM users;"

# Reset completo (ATTENZIONE: cancella tutti i dati)
cd backend
psql -U marzumini -d labrigata_db -f src/database/schema.sql
npm run setup
```

## Supporto

Se il problema persiste:
1. Controlla i log sopra indicati
2. Cattura screenshot degli errori
3. Verifica versione Node.js: `node --version` (deve essere 18+)
4. Verifica versione PostgreSQL: `psql --version` (deve essere 14+)

