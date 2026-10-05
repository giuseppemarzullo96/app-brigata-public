# Come Verificare se i Messaggi sono Crittografati E2E

> **Dismessa il 25 settembre 2026.** La chat non cifra piu' i messaggi nuovi
> (vedi `flussi-socio.md`, sezione Messaggi). Questo documento resta per
> capire i messaggi cifrati di prima e il codice che ancora li legge.

## Indicatori Visivi nell'Interfaccia

### 1. **Nell'Header della Conversazione**
Quando apri una chat privata (non di gruppo), se la crittografia E2E è attiva, vedrai:
- 🔒 Icona lucchetto verde
- Testo piccolo: **"Crittografato E2E"** in verde

Questo appare sia su mobile che su desktop, sotto il nome dell'utente.

### 2. **Sui Singoli Messaggi**
Ogni messaggio crittografato mostra:
- 🔒 Icona lucchetto piccola
- Badge **"E2E"** in piccolo
- Posizionato in basso a destra del messaggio, accanto all'orario

**Esempio visivo:**
```
┌─────────────────────────┐
│ Ciao, come stai?        │
│                         │
│ 14:30        🔒 E2E     │
└─────────────────────────┘
```

## Verifica Tecnica

### Nel Database (PostgreSQL)

Esegui questa query per vedere i messaggi crittografati:

```sql
SELECT 
  id,
  mittente_id,
  destinatario_id,
  crittografato,
  CASE 
    WHEN crittografato THEN 'SÌ' 
    ELSE 'NO' 
  END as stato_crittografia,
  LENGTH(contenuto) as lunghezza_contenuto,
  iv IS NOT NULL as ha_iv,
  chiave_ephemeral IS NOT NULL as ha_chiave_ephemeral,
  created_at
FROM messaggi_interni
WHERE conversazione_id IS NOT NULL
ORDER BY created_at DESC
LIMIT 20;
```

**Messaggi crittografati avranno:**
- `crittografato = true`
- `iv` non NULL (stringa Base64)
- `chiave_ephemeral` non NULL (JSON con la chiave pubblica)
- `contenuto` sarà una stringa Base64 (non leggibile)

**Messaggi NON crittografati avranno:**
- `crittografato = false` o NULL
- `iv = NULL`
- `chiave_ephemeral = NULL`
- `contenuto` sarà testo leggibile

### Nella Console del Browser

Apri la console del browser (F12) e controlla:

1. **Verifica se E2E è abilitato:**
```javascript
// Controlla localStorage
localStorage.getItem('e2e_enabled_[USER_ID]')
// Dovrebbe restituire "true" se abilitato
```

2. **Verifica se le chiavi sono state generate:**
```javascript
// Controlla se esiste la chiave privata
localStorage.getItem('e2e_private_key_[USER_ID]')
// Dovrebbe restituire un JSON con la chiave privata
```

3. **Nei log della console:**
Quando invii un messaggio crittografato, vedrai:
- `"Chiavi di crittografia generate con successo!"` (al primo utilizzo)
- `"Crittografia end-to-end abilitata!"` (quando si abilita)

### Verifica nella Rete (Network Tab)

1. Apri DevTools → Network
2. Invia un messaggio
3. Cerca la richiesta `POST /api/v1/messaggi`
4. Controlla il payload FormData:
   - `crittografato: "true"` → Messaggio crittografato
   - `iv: "[stringa base64]"` → Presente se crittografato
   - `chiave_ephemeral: "[JSON]"` → Presente se crittografato
   - `contenuto: "[stringa base64]"` → Se crittografato, sarà Base64, non testo leggibile

## Test Pratico

### Test 1: Verifica Visiva
1. Apri una chat privata con un altro utente
2. Controlla l'header: dovresti vedere "🔒 Crittografato E2E"
3. Invia un messaggio
4. Controlla il messaggio inviato: dovresti vedere "🔒 E2E" in basso a destra

### Test 2: Verifica nel Database
```sql
-- Conta messaggi crittografati vs non crittografati
SELECT 
  COUNT(*) FILTER (WHERE crittografato = true) as messaggi_crittografati,
  COUNT(*) FILTER (WHERE crittografato = false OR crittografato IS NULL) as messaggi_non_crittografati,
  COUNT(*) as totale
FROM messaggi_interni
WHERE conversazione_id IS NOT NULL;
```

### Test 3: Verifica Funzionamento
1. Utente A invia un messaggio crittografato a Utente B
2. Utente B riceve e decrittografa automaticamente
3. Se tutto funziona:
   - Utente A vede il messaggio con badge E2E
   - Utente B vede il messaggio decrittografato (testo leggibile) con badge E2E
   - Nel database, il `contenuto` è Base64 (non leggibile)

## Quando i Messaggi NON sono Crittografati

I messaggi **NON** sono crittografati se:
- ❌ È una chat di gruppo (E2E per gruppi non ancora implementato)
- ❌ La crittografia E2E non è stata abilitata
- ❌ Le chiavi non sono state generate
- ❌ C'è stato un errore durante la crittografia (fallback a messaggio in chiaro)

## Troubleshooting

### Non vedo l'indicatore "Crittografato E2E"
- Verifica che non sia una chat di gruppo
- Controlla che E2E sia abilitato: `localStorage.getItem('e2e_enabled_[USER_ID]')`
- Ricarica la pagina

### I messaggi non vengono crittografati
- Controlla la console del browser per errori
- Verifica che le chiavi siano state generate
- Controlla che il destinatario abbia una chiave pubblica salvata

### Non riesco a decrittografare i messaggi
- Verifica che la tua chiave privata sia presente in localStorage
- Controlla che il mittente abbia inviato il messaggio con E2E
- Verifica che `iv` e `chiave_ephemeral` siano presenti nel messaggio

