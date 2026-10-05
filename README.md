# La Brigata ODV - Sistema Gestionale

Sistema gestionale avanzato per l'associazione di volontariato La Brigata ODV (labrigataodv.it), operante a Salerno a sostegno di persone senza fissa dimora.

## 🎯 Funzionalità Principali

### 1. Gestione Cucine Solidali
- Calendario mensile/settimanale turni
- Slot prenotabili (primi, dolci, acqua, etc.)
- Ricettario associato ai turni
- Gestione porzioni e note alimentari

### 2. Gestione Soci e Libro Soci
- Anagrafica soci (fisici/giuridici)
- Categorie: volontario, ordinario, simpatizzante, esterno
- Storico quote associative e partecipazione attività

### 3. Convocazioni Assemblee
- Creazione e gestione assemblee
- Invio convocazioni email
- Tracciamento presenze
- Gestione verbali

### 4. Sistema Sondaggi
- Sondaggi personalizzati
- Destinatari per categoria
- Risultati aggregati ed esportazione

### 5. Gestione Volontari e Permessi
- Ruoli: admin, socio volontario, socio ordinario, simpatizzante
- Permessi granulari
- Dashboard statistiche

### 6. Magazzino Beni e Donazioni
- Inventario abiti, coperte, beni igienici
- Alert scorte
- Storico donazioni

### 7. Comunicazioni Interne
- Bacheca avvisi
- Messaggistica interna
- Gestione richieste form

### 8. Gestione Sportelli Specialistici
- Appuntamenti
- Anagrafiche beneficiari
- Storico interventi (GDPR compliant)

## 🏗️ Architettura

### Stack Tecnologico
- **Backend**: Node.js + Express.js
- **Database**: PostgreSQL
- **Frontend**: React + TypeScript
- **Autenticazione**: JWT
- **API**: RESTful

### Struttura Progetto
```
/
├── backend/          # Server Express
│   ├── src/
│   │   ├── config/   # Configurazioni
│   │   ├── models/   # Modelli database
│   │   ├── routes/   # Route API
│   │   ├── controllers/ # Logica business
│   │   ├── middleware/ # Middleware
│   │   └── utils/    # Utilities
│   └── migrations/   # Migrazioni database
├── frontend/         # App React
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── utils/
│   └── public/
└── docs/             # Documentazione
```

## 🚀 Installazione

### Prerequisiti
- Node.js 18+
- PostgreSQL 14+
- npm o yarn

### Setup Backend
```bash
cd backend
npm install
cp .env.example .env
# Configurare .env con credenziali database
npm run migrate
npm run dev
```

### Setup Frontend
```bash
cd frontend
npm install
cp .env.example .env
npm start
```

## 📊 Database

Vedi `docs/database-schema.md` per lo schema ER completo.

## 🔐 Autenticazione e Ruoli

- **Admin**: Accesso completo a tutte le funzionalità
- **Socio Volontario**: Prenotazione turni, visualizzazione avvisi, partecipazione sondaggi
- **Socio Ordinario**: Visualizzazione avvisi, partecipazione sondaggi
- **Simpatizzante**: Accesso limitato a comunicazioni pubbliche

## 📝 Documentazione API

Vedi `docs/api-documentation.md` per la documentazione completa delle API.

## 🔒 Privacy e GDPR

Il sistema è progettato per essere GDPR compliant:
- Crittografia dati sensibili
- Logging attività
- Gestione consensi
- Diritto all'oblio

## 📄 Licenza

Proprietario - La Brigata ODV

