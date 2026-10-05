# Cosa può fare un socio nell'app

Mappa completa delle operazioni disponibili a un **socio volontario**, ricavata
dalle rotte del server e dalle pagine dell'interfaccia, non dalla
documentazione. Dove il server e l'interfaccia divergono, è indicato.

Aggiornato al 23 settembre 2026.

Legenda dei ruoli citati:

| Ruolo | In breve |
|---|---|
| **socio volontario** | Il ruolo dei 22 soci. È il soggetto di questo documento. |
| **socio ordinario** | Come sopra, ma **non può prenotare i turni**. Oggi nessuno lo ha. |
| **gestore cucine** | Socio volontario + organizza turni, slot e ricettario. |
| **admin** | Tutto. |

---

## 1. Accesso

### 1.1 Primo accesso
1. Apre `app.labrigataodv.it`.
2. Inserisce email e password provvisoria ricevute su WhatsApp.
3. Entra nella schermata iniziale.
4. Facoltativo: aggiunge la pagina alla schermata Home del telefono.

La sessione dura **7 giorni**, poi va rifatto l'accesso.

### 1.2 Cambiare la password
Profilo → **Password → Cambia** → password attuale, nuova (minimo 8 caratteri),
conferma.

### 1.3 Cambiare l'email
Profilo → accanto all'email, **Cambia** → nuovo indirizzo + **password attuale**.
L'email è il nome utente: dal cambio in poi si accede con quella nuova.
L'indirizzo viene normalizzato in minuscolo e non può essere già di un altro socio.

### 1.4 Password dimenticata
**Non esiste un recupero autonomo.** Non c'è la funzione "password dimenticata":
occorre chiedere a un amministratore, che ne genera una nuova.

---

## 2. Il proprio profilo

### 2.1 Cosa può modificare
Profilo → **Modifica**:

- nome, cognome
- telefono *(è il numero delle notifiche WhatsApp)*
- indirizzo, città, CAP

Più, con pulsanti dedicati: **email**, **password**, **foto profilo**.

### 2.2 Cosa non può modificare
Ruolo, categoria socio, stato attivo/sospeso, quote, data di nascita, codice
fiscale, e le **annotazioni interne** dell'amministratore, che non vede nemmeno.

Il blocco è sul server, non solo nell'interfaccia: un socio che inviasse
`ruolo: admin` verrebbe ignorato.

### 2.3 Cosa vede degli altri soci
Solo **nome, cognome, foto, ruolo e categoria** — quanto basta a sceglierli in
una lista. Email, telefoni, indirizzi e annotazioni altrui non escono dal
server. Il profilo di un altro socio **non è apribile**: risponde 403.

### 2.4 Storico e partecipazioni
- **Partecipazioni**: il proprio storico di attività. Solo il proprio.
- **Changelog**: l'elenco dei cambi di ruolo e categoria è **riservato agli
  amministratori**, anche sul proprio profilo.

---

## 3. Turni delle cucine

### 3.1 Consultare il calendario
Menu → **Turni**. Due viste della stessa cosa:

- **Elenco**: le cene del mese, con il contatore dei posti (`8/14 slot`).
  Frecce `‹ ›` per cambiare mese.
- **Calendario**: griglia mensile; i giorni con una cena hanno un riquadro
  azzurro.

### 3.2 Prenotare uno slot *(solo socio volontario e superiori)*
1. Apre la cena.
2. Scorre a **Slot Disponibili**, divisi per portata.
3. Ogni slot mostra porzioni previste e ricetta associata.
4. **Prenota** → conferma del browser → lo slot passa a *Assegnato* col suo nome.

### 3.3 Disdire
Sul proprio slot compare **Libera**. Un socio può liberare **solo i propri
slot**; quelli altrui li tocca un gestore cucine o un admin.

### 3.4 Cosa non può fare
Creare o eliminare turni, creare slot, assegnare uno slot a un'altra persona,
associare ricette agli slot, duplicare slot. Tutte operazioni da gestore cucine.

---

## 4. Assemblee

### 4.1 Consultare
Menu → **Assemblee** → apre quella che interessa: data, luogo, ordine del
giorno.

### 4.2 Dichiarare la presenza
Due pulsanti: **Conferma Presenza** / **Comunica Assenza**. La risposta è
modificabile finché l'assemblea non si è svolta.

### 4.3 Vedere chi ha confermato
L'elenco delle presenze è consultabile dai soci.

### 4.4 Verbale
Quando l'amministratore lo carica, compare nella pagina ed è scaricabile.

### 4.5 Cosa non può fare
Creare o modificare assemblee, inviare convocazioni, caricare il verbale,
esportare l'elenco presenze.

---

## 5. Votazioni

### 5.1 Quando compare
La sezione mostra solo le votazioni **aperte o chiuse**. Le bozze non esistono
per un socio: finché l'amministratore non apre le urne, la sezione è vuota.

### 5.2 Votare
1. Notifica con link diretto, oppure menu → **Votazioni** (badge giallo).
2. **Vota ora**.
3. Seleziona fino al numero di preferenze consentito. Il contatore mostra
   quante ne ha usate; raggiunto il massimo, gli altri nomi si disattivano.
4. In alternativa, **Scheda bianca**.
5. **Prosegui** → schermata di riepilogo → conferma.

### 5.3 Vincoli, applicati dal server
- Si vota **una volta sola**. Anche due invii simultanei da due dispositivi
  producono una sola scheda.
- Non si superano le preferenze massime.
- Non si vota due volte lo stesso candidato.
- Non si vota se non si è nell'elenco degli aventi diritto, congelato
  all'apertura delle urne.
- Non si vota a urne chiuse o non ancora aperte.
- **Il voto non si modifica e non si ritira.**

### 5.4 Cosa vede
Durante la votazione: soltanto se ha votato. **Nessun conteggio**, per nessuno,
nemmeno per gli amministratori.

A urne chiuse: risultati completi, eletti, ed eventuale segnalazione di
ballottaggio. Può scaricare il **verbale PDF**.

### 5.5 Segretezza
Resta registrato soltanto **che** ha votato. Il contenuto della scheda è
conservato senza alcun riferimento alla persona, e le due informazioni non sono
ricongiungibili con nessuna query.

---

## 6. Sondaggi

1. Menu → **Sondaggi** → apre quello aperto.
2. Sceglie l'opzione e conferma.
3. Se i risultati sono impostati come pubblici, li vede subito dopo.

⚠️ **I sondaggi non sono anonimi**: l'amministratore vede chi ha risposto e
cosa. È la differenza sostanziale rispetto alle votazioni.

Non può creare, pubblicare, chiudere o esportare sondaggi.

---

## 7. Avvisi

- Menu → **Avvisi**, con il pallino rosso sulle non lette.
- Aprendo un avviso, viene **segnato come letto**.
- Gli avvisi arrivano anche via email e WhatsApp, con il link che apre la pagina.

Non può creare, modificare, pubblicare avvisi, né vedere chi li ha letti.

---

## 8. Messaggi interni

- **Chat Generale**: ci sono tutti i soci.
- **Conversazione privata**: tocca un nome nell'elenco.
- **Gruppi**: può scrivere nei gruppi di cui fa parte.
- Può **modificare** e **cancellare** i propri messaggi.
- Può svuotare una propria conversazione.
- Può cambiare la **foto di un gruppo**.

Non può **creare gruppi** né **aggiungere o rimuovere partecipanti**: sono
operazioni da amministratore.

Dal 25 settembre 2026 i messaggi nuovi non sono piu' cifrati end-to-end:
viaggiano su HTTPS come il resto dell'app e si leggono da ogni dispositivo.
La cifratura di prima usava una sola chiave per persona, conservata nel
browser: chi usava telefono e computer ne perdeva uno, e quando Safari
svuota i dati dei siti la chiave spariva con i messaggi. I messaggi cifrati
di allora si leggono ancora sul dispositivo che ha la chiave; altrove
compare «Messaggio della vecchia chat cifrata».

---

## 9. Quota associativa

### 9.1 Vedere la propria
Profilo → sezione quote: anno, importo, stato. Vede **solo le proprie**.

### 9.2 Pagare con PayPal
1. Crea la quota dell'anno (o la trova già creata dall'amministratore).
2. Paga con PayPal — ambiente reale.
3. A pagamento riuscito la quota si marca pagata da sola.

### 9.3 Segnalare un altro pagamento
Dichiara metodo (contanti, bonifico) ed eventuale riferimento. La quota passa
**in attesa di validazione** e resta lì finché un amministratore non la
approva o la rifiuta.

L'importo è deciso dagli amministratori: il socio non lo modifica.

---

## 10. Ricettario e magazzino

Entrambi, per un socio, sono **in sola lettura**.

- **Ricettario**: consulta le ricette con ingredienti, dosi e procedimento;
  può cercarle e filtrarle per tipo.
- **Magazzino**: consulta l'inventario, le quantità disponibili e gli avvisi di
  scorta bassa.

Non può creare, modificare, archiviare ricette, né movimentare il magazzino.

---

## 11. Sportelli specialistici

Funzionalità presente ma **oggi non utilizzata**: nessun beneficiario nel
sistema.

Se attivata, un **socio volontario** potrebbe consultare e creare schede
beneficiario e interventi.

⚠️ **Da rivedere prima dell'uso.** Il controllo attuale è "admin *oppure* socio
volontario": significa che **tutti e 22 i soci** avrebbero accesso ai dati delle
persone assistite, non i soli operatori dello sportello. Vale la pena
introdurre un ruolo dedicato, come è stato fatto per le cucine.

---

## 11-bis. Storie Instagram

Pagina che trasforma gli **slot ancora liberi** dei prossimi turni in immagini
verticali pronte per le storie: serve a chiedere aiuto quando una cena non si
riempie.

Accessibile ad **amministratori e gestori cucine**: chi organizza i turni sa
quali posti mancano, ed è la persona naturale per pubblicare l'appello.

Un socio non la vede nel menu e, se ne conosce l'indirizzo, viene riportato alla
schermata iniziale. I dati che mostra sarebbero comunque già visibili nella
sezione Turni: la restrizione riguarda lo strumento, non l'informazione.

## 12. Riepilogo: cosa un socio non può fare

| Ambito | Riservato a |
|---|---|
| Creare, modificare, archiviare soci | admin |
| Cambiare ruoli e categorie | admin |
| Vedere contatti e annotazioni altrui | admin |
| Sospendere un socio | admin |
| Creare, aprire, chiudere votazioni | admin |
| Vedere l'affluenza in diretta | admin |
| Creare e pubblicare avvisi e sondaggi | admin |
| Creare assemblee e inviare convocazioni | admin |
| Caricare verbali | admin |
| Validare i pagamenti delle quote | admin |
| Cambiare l'importo della quota | admin |
| Creare gruppi di chat e gestirne i membri | admin |
| Creare e modificare turni e slot | gestore cucine |
| Assegnare uno slot a un'altra persona | gestore cucine |
| Gestire il ricettario | gestore cucine |
| Generare le storie Instagram | gestore cucine |
| Movimentare il magazzino | admin |

---

## 13. Le tre cose irreversibili

Per un socio, quasi tutto è correggibile. Tre no:

1. **Il voto.** Una volta confermato non si modifica né si ritira. Per questo
   c'è una schermata di conferma prima dell'invio.
2. **Il pagamento PayPal della quota.** Va gestito fuori dall'app.
3. **La cancellazione di un proprio messaggio**, che non si recupera.
