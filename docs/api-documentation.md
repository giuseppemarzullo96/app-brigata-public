# Documentazione API - La Brigata ODV

## Base URL
```
http://localhost:3000/api/v1
```

## Autenticazione

Tutte le API (tranne `/auth/login` e `/auth/register`) richiedono un token JWT nell'header:

```
Authorization: Bearer <token>
```

## Endpoints

### Autenticazione

#### POST /auth/login
Login utente

**Request:**
```json
{
  "email": "volontario@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "message": "Login effettuato con successo",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "volontario@example.com",
    "nome": "Mario",
    "cognome": "Rossi",
    "ruolo": "socio_volontario",
    "categoria_socio": "volontario"
  }
}
```

#### POST /auth/register
Registra nuovo utente (solo admin)

**Request:**
```json
{
  "email": "nuovo@example.com",
  "password": "password123",
  "nome": "Luigi",
  "cognome": "Verdi",
  "categoria_socio": "volontario",
  "ruolo": "socio_volontario"
}
```

#### GET /auth/me
Recupera dati utente corrente

---

### Utenti/Soci

#### GET /users
Lista utenti (con filtri opzionali)

**Query params:**
- `categoria`: filtra per categoria socio
- `ruolo`: filtra per ruolo
- `attivo`: true/false
- `search`: ricerca per nome/cognome/email

**Response:**
```json
{
  "users": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "nome": "Mario",
      "cognome": "Rossi",
      "categoria_socio": "volontario",
      "ruolo": "socio_volontario"
    }
  ]
}
```

#### GET /users/:id
Dettaglio utente

#### PUT /users/:id
Aggiorna utente

#### GET /users/:id/quote
Storico quote associative

#### POST /users/:id/quote
Aggiungi quota associativa (solo admin)

**Request:**
```json
{
  "anno": 2024,
  "importo": 25.00,
  "data_pagamento": "2024-01-15",
  "metodo_pagamento": "bonifico",
  "riferimento_pagamento": "BON123456"
}
```

---

### Turni Cucina

#### GET /turni
Lista turni

**Query params:**
- `dataInizio`: data inizio (YYYY-MM-DD)
- `dataFine`: data fine
- `tipoTurno`: tipo turno (colazione/pranzo/cena)

**Response:**
```json
{
  "turni": [
    {
      "id": "uuid",
      "data_turno": "2024-01-20",
      "tipo_turno": "pranzo",
      "numero_porzioni": 50,
      "totale_slot": 5,
      "slot_assegnati": 3
    }
  ]
}
```

#### GET /turni/:id
Dettaglio turno con slot

**Response:**
```json
{
  "turno": {
    "id": "uuid",
    "data_turno": "2024-01-20",
    "tipo_turno": "pranzo"
  },
  "slot": [
    {
      "id": "uuid",
      "tipo_slot": "primi",
      "numero_porzioni": 50,
      "stato": "assegnato",
      "volontario_nome": "Mario",
      "volontario_cognome": "Rossi"
    }
  ]
}
```

#### POST /turni
Crea nuovo turno (solo admin)

#### POST /turni/:turnoId/slot/:slotId/prenota
Prenota slot (volontari)

#### DELETE /turni/:turnoId/slot/:slotId/libera
Libera slot

#### GET /turni/:id/ricettario
Recupera ricettario turno

#### POST /turni/:id/ricettario
Salva ricettario (solo admin)

**Request:**
```json
{
  "nome_ricetta": "Pasta al pomodoro",
  "descrizione": "Classica pasta al pomodoro",
  "ingredienti": [
    {"nome": "pasta", "quantita": "500g"},
    {"nome": "pomodoro", "quantita": "400g"}
  ],
  "istruzioni": "Cuocere la pasta...",
  "porzioni": 50,
  "note_alimentari": "Contiene glutine"
}
```

---

### Assemblee

#### GET /assemblee
Lista assemblee

#### GET /assemblee/:id
Dettaglio assemblea

#### POST /assemblee
Crea assemblea (solo admin)

**Request:**
```json
{
  "titolo": "Assemblea Ordinaria Gennaio 2024",
  "data_assemblea": "2024-01-25T18:00:00Z",
  "luogo": "Sede associativa",
  "ordine_del_giorno": "1. Approvazione bilancio\n2. Nuove attività"
}
```

#### POST /assemblee/:id/invia-convocazioni
Invia convocazioni email (solo admin)

#### PUT /assemblee/:id/presenza
Registra presenza

**Request:**
```json
{
  "presenza": true
}
```

#### GET /assemblee/:id/presenze
Lista presenze

---

### Sondaggi

#### GET /sondaggi
Lista sondaggi

#### GET /sondaggi/:id
Dettaglio sondaggio

#### POST /sondaggi
Crea sondaggio (solo admin)

**Request:**
```json
{
  "titolo": "Preferenze per attività estive",
  "descrizione": "Sondaggio per organizzare attività",
  "tipo_sondaggio": "scelta_multipla",
  "destinatari": ["volontario", "ordinario"],
  "opzioni": [
    {"testo": "Gita al mare"},
    {"testo": "Festa in sede"},
    {"testo": "Attività all'aperto"}
  ]
}
```

#### POST /sondaggi/:id/rispondi
Rispondi a sondaggio

**Request:**
```json
{
  "opzione_id": "uuid"  // per scelta multipla
}
```
oppure
```json
{
  "risposta_testo": "Testo libero"  // per testo libero
}
```

#### GET /sondaggi/:id/risultati
Risultati sondaggio

#### GET /sondaggi/:id/export
Esporta risultati (CSV/PDF) (solo admin)

---

### Magazzino

#### GET /magazzino/beni
Lista beni magazzino

#### GET /magazzino/beni/:id
Dettaglio bene

#### POST /magazzino/beni
Crea bene (solo admin)

**Request:**
```json
{
  "categoria_id": "uuid",
  "nome": "Magliette",
  "quantita_disponibile": 100,
  "quantita_minima": 20,
  "unita_misura": "pezzi"
}
```

#### GET /magazzino/alert
Alert scorte basse

#### GET /magazzino/donazioni
Lista donazioni

#### POST /magazzino/donazioni
Registra donazione (solo admin)

---

### Avvisi

#### GET /avvisi
Lista avvisi (filtrati per destinatari)

#### POST /avvisi
Crea avviso (solo admin)

**Request:**
```json
{
  "titolo": "Riunione importante",
  "contenuto": "Riunione il prossimo venerdì",
  "priorita": "alta",
  "destinatari": ["volontario", "ordinario"]
}
```

---

### Sportelli

#### GET /sportelli
Lista sportelli

#### GET /sportelli/:id/appuntamenti
Lista appuntamenti sportello

#### POST /sportelli/:id/appuntamenti
Crea appuntamento

#### GET /sportelli/beneficiari
Lista beneficiari (solo operatori)

#### POST /sportelli/interventi
Registra intervento

---

### Dashboard

#### GET /dashboard
Dashboard principale con statistiche

**Response:**
```json
{
  "stats": {
    "turni_prossimi": 5,
    "slot_assegnati": 3,
    "avvisi_non_letti": 2,
    "sondaggi_aperti": 1,
    "assemblee_prossime": 1
  }
}
```

#### GET /dashboard/statistiche
Statistiche avanzate (solo admin)

---

## Codici di Risposta

- `200` - Successo
- `201` - Creato
- `400` - Richiesta non valida
- `401` - Non autenticato
- `403` - Accesso negato (permessi insufficienti)
- `404` - Non trovato
- `500` - Errore server

## Gestione Errori

Tutte le risposte di errore seguono questo formato:

```json
{
  "error": "Messaggio di errore descrittivo"
}
```

