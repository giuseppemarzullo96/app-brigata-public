# Crittografia End-to-End (E2E) per le Chat

> **Dismessa il 25 settembre 2026.** La chat non cifra piu' i messaggi nuovi
> (vedi `flussi-socio.md`, sezione Messaggi). Questo documento resta per
> capire i messaggi cifrati di prima e il codice che ancora li legge.

## Panoramica

Il sistema implementa la crittografia end-to-end per tutte le chat private e di gruppo, garantendo che solo i partecipanti possano leggere i messaggi. Il server non può mai vedere il contenuto decrittato.

## Architettura

### Algoritmi Utilizzati

- **ECDH (Elliptic Curve Diffie-Hellman)**: Per lo scambio di chiavi
  - Curva: P-256
  - Genera una chiave condivisa tra mittente e destinatario

- **AES-GCM**: Per la crittografia simmetrica dei messaggi
  - Lunghezza chiave: 256 bit
  - IV (Initialization Vector): 96 bit, generato casualmente per ogni messaggio

- **Forward Secrecy**: Ogni messaggio usa una chiave ephemeral diversa, quindi anche se una chiave viene compromessa, i messaggi passati rimangono sicuri.

### Componenti

#### Backend

1. **Migration `011_add_e2e_encryption.sql`**:
   - Tabella `chiavi_pubbliche`: Memorizza le chiavi pubbliche degli utenti
   - Tabella `chiavi_condivise`: Cache per chiavi derivate (opzionale)
   - Campi aggiunti a `messaggi_interni`:
     - `crittografato`: BOOLEAN
     - `iv`: VARCHAR(255) - Initialization Vector
     - `chiave_ephemeral`: TEXT - Chiave pubblica ephemeral

2. **Controller `chiavi.controller.js`**:
   - `POST /api/v1/chiavi/pubblica`: Salva/aggiorna chiave pubblica
   - `GET /api/v1/chiavi/pubblica/:userId`: Recupera chiave pubblica
   - `GET /api/v1/chiavi/pubbliche`: Recupera chiavi di più utenti (per gruppi)
   - `DELETE /api/v1/chiavi/pubblica`: Elimina chiave pubblica

3. **Controller `messaggi.controller.js`** (modificato):
   - Supporta i campi `crittografato`, `iv`, `chiave_ephemeral` quando si salva un messaggio
   - Il backend **non decrittografa mai** i messaggi

#### Frontend

1. **Servizio `cryptoService.ts`**:
   - Funzioni per generare chiavi, crittografare/decrittografare messaggi
   - Utilizza Web Crypto API (nativa del browser)
   - Gestisce l'esportazione/importazione di chiavi in formato JWK

2. **Hook `useE2EEncryption.ts`**:
   - Gestisce l'inizializzazione delle chiavi
   - Cache delle chiavi pubbliche degli altri utenti
   - Funzioni per crittografare/decrittografare messaggi
   - Preferenze utente (abilitare/disabilitare E2E)

3. **Componente `Messaggi.tsx`** (da integrare):
   - Usa `useE2EEncryption` per crittografare prima dell'invio
   - Decrittografa i messaggi ricevuti prima della visualizzazione

## Flusso di Funzionamento

### Inizializzazione

1. L'utente abilita la crittografia E2E (opzionale, può essere abilitata di default)
2. Il sistema genera una coppia di chiavi ECDH (pubblica/privata)
3. La chiave privata viene salvata in `localStorage` (solo sul client)
4. La chiave pubblica viene inviata al server e salvata in `chiavi_pubbliche`

### Invio di un Messaggio

1. L'utente scrive un messaggio
2. Se E2E è abilitato:
   - Il sistema recupera la chiave pubblica del destinatario (dal server o cache)
   - Genera una chiave ephemeral per questo messaggio specifico
   - Deriva una chiave condivisa usando ECDH
   - Crittografa il messaggio con AES-GCM
   - Invia al server: `contenuto` (crittografato), `iv`, `chiave_ephemeral`, `crittografato: true`
3. Se E2E non è abilitato:
   - Invia il messaggio in chiaro come prima

### Ricezione di un Messaggio

1. Il server invia il messaggio (crittografato o meno)
2. Se `crittografato: true`:
   - Il sistema usa la propria chiave privata e la `chiave_ephemeral` del mittente
   - Deriva la chiave condivisa usando ECDH
   - Decrittografa il messaggio con AES-GCM usando l'`iv`
   - Mostra il messaggio decrittato all'utente
3. Se `crittografato: false`:
   - Mostra il messaggio in chiaro come prima

## Sicurezza

### Punti di Forza

- ✅ **End-to-End**: Il server non può mai vedere i messaggi decrittati
- ✅ **Forward Secrecy**: Ogni messaggio usa una chiave diversa
- ✅ **Chiavi Private**: Mai inviate al server, solo salvate localmente
- ✅ **Standard Crittografici**: Usa algoritmi standard e sicuri (ECDH P-256, AES-GCM 256)

### Limitazioni e Considerazioni

- ⚠️ **localStorage**: Le chiavi private sono salvate in `localStorage`, che è vulnerabile a XSS. In produzione, considera:
  - IndexedDB con crittografia aggiuntiva
  - Estensioni del browser per gestione chiavi
  - Hardware Security Modules (HSM) per applicazioni enterprise

- ⚠️ **Gruppi**: Per i gruppi, ogni messaggio deve essere crittografato separatamente per ogni partecipante (o usare una chiave di gruppo condivisa, più complessa)

- ⚠️ **Metadati**: Anche se i messaggi sono crittografati, il server può ancora vedere:
  - Chi invia a chi
  - Quando vengono inviati i messaggi
  - Dimensione dei messaggi

- ⚠️ **Backup**: Se l'utente perde la chiave privata, non può più decrittografare i messaggi passati

## Integrazione nel Componente Messaggi

Per integrare completamente la crittografia E2E nel componente `Messaggi.tsx`:

1. Importa l'hook:
```typescript
import { useE2EEncryption } from '../hooks/useE2EEncryption'
```

2. Usa l'hook nel componente:
```typescript
const {
  isEncryptionEnabled,
  initializeKeys,
  encryptMessage,
  decryptMessage,
  enableEncryption,
  disableEncryption
} = useE2EEncryption()
```

3. Modifica `inviaMessaggioMutation` per crittografare prima dell'invio:
```typescript
const encrypted = await encryptMessage(nuovoMessaggio, destinatarioId)
if (encrypted) {
  formData.append('contenuto', encrypted.encryptedContent)
  formData.append('crittografato', 'true')
  formData.append('iv', encrypted.iv)
  formData.append('chiave_ephemeral', encrypted.ephemeralPublicKey)
} else {
  formData.append('contenuto', nuovoMessaggio)
  formData.append('crittografato', 'false')
}
```

4. Decrittografa i messaggi ricevuti prima della visualizzazione:
```typescript
const messaggiDecrittati = await Promise.all(
  messaggi.map(async (msg) => {
    if (msg.crittografato && msg.iv && msg.chiave_ephemeral) {
      const decrypted = await decryptMessage(
        {
          encryptedContent: msg.contenuto,
          iv: msg.iv,
          ephemeralPublicKey: msg.chiave_ephemeral
        },
        msg.mittente_id
      )
      return { ...msg, contenuto: decrypted || msg.contenuto }
    }
    return msg
  })
)
```

## Test

Per testare la crittografia E2E:

1. Esegui la migration:
```bash
cd backend
npm run migrate 011_add_e2e_encryption.sql
```

2. Abilita E2E per un utente nel frontend
3. Invia un messaggio a un altro utente
4. Verifica che il messaggio nel database sia crittografato
5. Verifica che il destinatario possa decrittografare e leggere il messaggio

## Note per la Produzione

- Implementa un sistema di backup sicuro per le chiavi private
- Considera l'uso di un Key Management Service (KMS) per applicazioni enterprise
- Aggiungi logging per audit delle operazioni crittografiche
- Implementa rotazione delle chiavi periodica
- Considera l'aggiunta di verifica delle chiavi pubbliche (key fingerprint)

