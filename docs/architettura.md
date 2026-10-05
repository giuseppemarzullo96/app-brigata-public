# Architettura Sistema - La Brigata ODV

## Panoramica

Il sistema è progettato con un'architettura **client-server** moderna, separando frontend e backend per massima scalabilità e manutenibilità.

## Stack Tecnologico

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: PostgreSQL 14+
- **ORM**: Sequelize (opzionale, attualmente query raw SQL)
- **Autenticazione**: JWT (JSON Web Tokens)
- **Logging**: Winston
- **Sicurezza**: Helmet, CORS, Rate Limiting

### Frontend
- **Framework**: React 18
- **Build Tool**: Vite
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: React Query (TanStack Query)
- **Routing**: React Router v6
- **Icons**: Lucide React

## Architettura Backend

### Struttura Directory

```
backend/
├── src/
│   ├── config/          # Configurazioni (database, etc.)
│   ├── controllers/     # Logica business
│   ├── middleware/      # Middleware (auth, audit, etc.)
│   ├── routes/          # Definizione route API
│   ├── utils/           # Utilities (logger, etc.)
│   └── server.js        # Entry point
├── logs/                # File di log
└── package.json
```

### Pattern Architetturale

**MVC-like con separazione responsabilità:**

1. **Routes** (`routes/`): Definizione endpoint e middleware
2. **Controllers** (`controllers/`): Logica business e gestione richieste
3. **Middleware** (`middleware/`): Autenticazione, autorizzazione, audit
4. **Database**: Query dirette con Sequelize (raw SQL per flessibilità)

### Flusso Richiesta

```
Client Request
    ↓
Express Middleware (CORS, Helmet, Rate Limit)
    ↓
Route Handler
    ↓
Auth Middleware (JWT verification)
    ↓
Authorization Middleware (role check)
    ↓
Controller (business logic)
    ↓
Database Query
    ↓
Response
```

### Autenticazione e Autorizzazione

**JWT-based Authentication:**
- Token emesso al login
- Token incluso in header `Authorization: Bearer <token>`
- Validazione token in middleware `authenticate`
- Ruoli: `admin`, `socio_volontario`, `socio_ordinario`, `simpatizzante`

**Permessi Granulari:**
- Middleware `authorize()` per controllo ruoli
- Middleware specifici (`requireAdmin`, `canManageTurni`)
- Controlli aggiuntivi nei controller per operazioni sensibili

### Audit Logging

Tutte le operazioni critiche sono loggate in `audit_log`:
- Login/logout
- Creazione/modifica/eliminazione entità
- Operazioni su dati sensibili
- IP address e user agent tracciati

## Architettura Frontend

### Struttura Directory

```
frontend/
├── src/
│   ├── components/      # Componenti riutilizzabili
│   ├── pages/          # Pagine/views
│   ├── contexts/       # React Context (Auth)
│   ├── services/       # API services
│   ├── hooks/          # Custom hooks (futuro)
│   └── App.tsx         # Root component
└── public/
```

### State Management

**React Query** per:
- Cache dati server
- Refetch automatico
- Gestione loading/error states
- Mutazioni ottimistiche

**React Context** per:
- Stato autenticazione globale
- User info

### Routing

React Router v6 con:
- Route protette (`PrivateRoute`)
- Lazy loading (futuro)
- Navigazione programmatica

## Database

### Schema Design

**Principi:**
- Normalizzazione 3NF
- Foreign keys per integrità referenziale
- Indici per performance
- Soft delete (campo `archiviato`) dove necessario
- Timestamps automatici (`created_at`, `updated_at`)

**Entità Principali:**
- `users`: Utenti/soci
- `turni_cucina`: Turni cucine solidali
- `slot_turno`: Slot specifici turni
- `assemblee`: Assemblee soci
- `sondaggi`: Sondaggi interni
- `magazzino_beni`: Inventario
- `beneficiari`: Anagrafica beneficiari (GDPR compliant)

### GDPR Compliance

**Dati Sensibili Beneficiari:**
- Crittografia campi sensibili (`codice_fiscale_criptato`, etc.)
- Codice anonimo per identificazione
- Consensi espliciti tracciati
- Diritto all'oblio implementabile

**Audit Trail:**
- Log completo attività utenti
- Tracciamento modifiche dati sensibili
- Retention policy configurabile

## API Design

### RESTful Principles

- **GET**: Lettura dati
- **POST**: Creazione risorse
- **PUT**: Aggiornamento completo
- **DELETE**: Eliminazione

### Response Format

**Success:**
```json
{
  "data": {...},
  "message": "Operazione completata"
}
```

**Error:**
```json
{
  "error": "Messaggio errore descrittivo"
}
```

### Versioning

API versionate: `/api/v1/...`

## Sicurezza

### Backend

1. **Helmet**: Headers sicurezza HTTP
2. **CORS**: Configurazione origin consentiti
3. **Rate Limiting**: Protezione DDoS/brute force
4. **Password Hashing**: bcrypt (10 rounds)
5. **JWT**: Token firmati con secret
6. **Input Validation**: Validazione richieste
7. **SQL Injection**: Query parametrizzate

### Frontend

1. **HTTPS**: In produzione
2. **Token Storage**: localStorage (considerare httpOnly cookies)
3. **XSS Protection**: React escape automatico
4. **CSRF**: Token-based (futuro)

## Scalabilità

### Backend

- **Stateless**: Server senza stato, scalabile orizzontalmente
- **Connection Pooling**: PostgreSQL connection pool
- **Caching**: Redis (futuro) per sessioni/cache
- **Load Balancing**: Nginx/HAProxy (futuro)

### Database

- **Indici**: Ottimizzati per query frequenti
- **Partitioning**: Possibile per tabelle grandi (futuro)
- **Replication**: Read replicas (futuro)

## Deployment

### Ambiente Sviluppo

```bash
# Backend
cd backend
npm install
npm run dev

# Frontend
cd frontend
npm install
npm run dev
```

### Ambiente Produzione

**Raccomandazioni:**
- Node.js process manager (PM2)
- Reverse proxy (Nginx)
- SSL/TLS certificati
- Backup database automatici
- Monitoring (Sentry, LogRocket)

## Best Practices Implementate

1. **Separation of Concerns**: Backend/frontend separati
2. **DRY**: Codice riutilizzabile
3. **Error Handling**: Gestione errori centralizzata
4. **Logging**: Log strutturati
5. **Documentation**: API documentate
6. **Type Safety**: TypeScript frontend
7. **Code Organization**: Struttura modulare

## Migrazione da Google Sheets

**Strategia Consigliata:**

1. **Export dati**: Esportare CSV da Google Sheets
2. **Script migrazione**: Script Node.js per import dati
3. **Validazione**: Verifica integrità dati
4. **Backup**: Backup completo prima migrazione
5. **Test**: Test su ambiente staging
6. **Rollback plan**: Piano di rollback se necessario

**Script esempio:**
```javascript
// scripts/migrate-from-sheets.js
// Legge CSV e popola database
```

## Prossimi Sviluppi

1. **Notifiche Email**: Nodemailer per convocazioni/avvisi
2. **File Upload**: Multer per verbali/allegati
3. **Export PDF**: PDFKit per report/verbali
4. **Real-time**: WebSocket per notifiche live
5. **Mobile App**: React Native (futuro)
6. **Analytics**: Dashboard statistiche avanzate

