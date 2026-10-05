# Informativa privacy e trattamento dei dati — app La Brigata ODV

> **Bozza tecnica da far verificare.** Questo testo descrive fedelmente quello che
> l'applicazione fa oggi, campo per campo, ed è scritto per essere leggibile da un
> socio. Non sostituisce il parere di chi si occupa di protezione dati: i punti
> contrassegnati con **[DA COMPLETARE]** vanno riempiti, e la sezione sugli
> sportelli specialistici andrebbe comunque rivista da un legale prima di entrare
> in funzione, perché riguarda categorie particolari di dati.

Ultimo aggiornamento: 23 settembre 2026

---

## 1. Chi tratta i tuoi dati

Il titolare del trattamento è **La Brigata ODV**, organizzazione di volontariato
con sede in **[DA COMPLETARE: indirizzo]**, codice fiscale **[DA COMPLETARE]**.

Per qualsiasi richiesta puoi scrivere a **labrigatasalerno@gmail.com**.

**[DA COMPLETARE]** Responsabile della protezione dei dati (DPO): la nomina non è
obbligatoria per la maggior parte delle ODV; indicare il nominativo se presente,
oppure eliminare questa riga.

## 2. A cosa serve l'app

L'app `app.labrigataodv.it` è lo strumento con cui l'associazione gestisce la
propria vita interna: il libro soci, i turni delle cucine solidali, le assemblee,
le comunicazioni, le quote associative e le votazioni degli organi sociali.

L'accesso è riservato ai soci e alle persone autorizzate. Non esiste una parte
pubblica: senza credenziali non si vede nulla.

## 3. Quali dati trattiamo, e perché

### 3.1 Dati del socio

| Dato | Perché |
|---|---|
| Nome, cognome | Identificarti nel libro soci e nelle liste dei turni |
| Email | È il tuo nome utente per l'accesso, e il canale delle notifiche |
| Telefono | Notifiche via WhatsApp |
| Indirizzo, città, CAP | Tenuta del libro soci |
| Data di nascita, codice fiscale | Adempimenti associativi e registro del volontariato |
| Foto profilo | Facoltativa, serve solo a riconoscersi nelle liste |
| Categoria e ruolo | Determinano cosa puoi fare nell'app |

**Base giuridica:** l'esecuzione del rapporto associativo e gli obblighi di legge
sulla tenuta del libro soci. Il conferimento di questi dati è necessario per
essere socio; senza, l'iscrizione non è possibile.

### 3.2 Attività associativa

- **Turni delle cucine**: a quali cene ti sei prenotato e per quale portata.
- **Assemblee**: se hai confermato la presenza o comunicato l'assenza.
- **Sondaggi**: le risposte che dai. **I sondaggi non sono anonimi**: chi
  amministra vede chi ha risposto e cosa.
- **Avvisi**: quali hai letto e quando.
- **Quote associative**: importo, anno, stato del pagamento, metodo dichiarato,
  eventuale riferimento del bonifico e identificativo della transazione PayPal.
- **Messaggi interni**: le conversazioni con gli altri soci dentro l'app.

**Base giuridica:** l'esecuzione del rapporto associativo.

### 3.3 Votazioni: il voto è segreto

Questa parte merita un paragrafo a sé, perché è progettata apposta.

Quando si vota per eleggere un organo sociale, il sistema conserva **due
informazioni separate e non collegabili fra loro**:

1. **che tu hai votato** — serve a calcolare l'affluenza e a impedire il doppio voto;
2. **il contenuto delle schede** — conservato senza alcun riferimento a chi le ha deposte.

Le tabelle che contengono le schede e le preferenze **non hanno alcuna colonna che
rimandi a un utente**, e non esiste query che possa ricongiungere le due cose.
Nemmeno gli amministratori, nemmeno chi ha accesso diretto al database, possono
sapere cosa hai votato.

Inoltre il registro delle attività (§3.5) **oscura espressamente il contenuto
della scheda**: la rotta del voto non viene registrata con i nomi scelti.

### 3.4 Dati tecnici di accesso

- **Token di sessione**: un identificativo cifrato conservato nel browser, che ti
  tiene collegato. Non è un cookie di profilazione e non traccia la navigazione
  fuori dall'app.
- **Password**: conservata solo in forma cifrata (bcrypt). Nessuno, nemmeno gli
  amministratori, può leggerla o recuperarla: si può soltanto sostituirla.

### 3.5 Registro delle attività (log)

Per ragioni di sicurezza l'app registra le operazioni rilevanti — accessi riusciti
e falliti, creazione e modifica di dati, pubblicazione di avvisi — insieme a
**indirizzo IP** e tipo di browser.

Il registro **oscura sistematicamente i campi sensibili**: password e contenuto
delle schede elettorali non vi compaiono mai.

**Base giuridica:** legittimo interesse dell'associazione a garantire la sicurezza
del sistema e a ricostruire chi ha fatto cosa sui dati dei soci.

**[DA COMPLETARE]** Periodo di conservazione: oggi il registro non viene mai
cancellato. Va fissato un termine (una scelta ragionevole è **12 mesi**) e
impostata la cancellazione automatica.

### 3.6 Modifiche al libro soci (changelog)

Ogni cambio di ruolo o categoria di un socio viene registrato con valore
precedente, valore nuovo, autore e data. Serve a ricostruire chi ha avuto quali
permessi, ed è un presidio contro modifiche non tracciate.

### 3.7 Sportelli specialistici e beneficiari

⚠️ **Questa sezione descrive una funzionalità presente nel sistema ma oggi non
utilizzata: nel database non c'è alcun beneficiario.**

Qualora venga attivata, l'app potrà trattare i dati delle persone assistite dagli
sportelli. Questi dati sono di natura particolarmente delicata e il sistema è
predisposto con alcune tutele: un **codice anonimo** identifica ciascuna persona,
e i campi più sensibili — codice fiscale, contatti, indirizzo, note e descrizione
degli interventi — sono conservati **in forma cifrata**. È previsto un campo di
consenso esplicito al trattamento e uno separato per la condivisione.

**Prima di inserire anche un solo beneficiario reale** vanno definiti, con il
supporto di un legale: la base giuridica, l'informativa da consegnare alla
persona assistita, i tempi di conservazione e l'eventuale valutazione d'impatto.
Nome, cognome, data e luogo di nascita, allo stato, **non sono cifrati**.

## 4. Chi vede cosa

L'app applica dei limiti precisi, non solo nell'interfaccia ma anche nelle
risposte del server:

- **Ogni socio** vede il proprio profilo completo. Degli altri soci vede soltanto
  nome, cognome, foto, ruolo e categoria — quanto basta per sceglierli in una
  lista. **Non** vede email, telefono, indirizzo né annotazioni altrui.
- **Il profilo di un altro socio non è apribile.** Il server risponde con un
  diniego, non solo il menu è nascosto.
- **Gli amministratori** vedono il libro soci completo, le quote e le annotazioni
  interne: è ciò che serve per amministrare l'associazione.
- **I gestori delle cucine** organizzano turni e ricettario, ma non accedono a
  libro soci, quote, votazioni e impostazioni.
- **Le annotazioni interne** su un socio sono scritte e lette solo dagli
  amministratori: l'interessato non le vede nell'app. Può però ottenerle
  esercitando il diritto di accesso (§7).

## 5. A chi comunichiamo i dati

I dati restano all'interno dell'associazione. Sono coinvolti solo i fornitori
tecnici indispensabili al funzionamento, che agiscono come responsabili del
trattamento:

| Fornitore | Cosa tratta | Dove |
|---|---|---|
| Il server che ospita l'app | Tutti i dati dell'app | **[DA COMPLETARE: provider e Paese]** |
| **IONOS** (posta) | Email inviate dall'app | Unione Europea |
| **WhatsApp / Meta** | Numero di telefono e testo delle notifiche inviate | Extra UE |
| **PayPal** | Pagamento delle quote, per chi sceglie questo metodo | Extra UE |

**[DA COMPLETARE]** Verificare di aver stipulato l'accordo di responsabile del
trattamento con l'hoster e con IONOS.

⚠️ Sulle notifiche WhatsApp: il messaggio passa per l'infrastruttura di Meta.
Non vanno mai inviati per quel canale dati sensibili o informazioni sul voto.

I dati **non vengono venduti, ceduti a terzi per finalità commerciali, né usati
per profilazione pubblicitaria.**

## 6. Per quanto tempo li conserviamo

- **Dati del socio**: per tutta la durata del rapporto associativo e, per gli
  obblighi sul libro soci, **[DA COMPLETARE: di norma 10 anni]** dalla cessazione.
- **Quote e movimenti**: 10 anni, per gli obblighi contabili e fiscali.
- **Verbali e risultati delle votazioni**: conservati a tempo indeterminato, come
  atti dell'associazione. Restano privi di qualunque riferimento a chi ha votato cosa.
- **Registro delle attività**: **[DA COMPLETARE: 12 mesi consigliati]**.
- **Messaggi interni**: fino alla loro cancellazione da parte dell'utente.

Alla cessazione del rapporto l'account viene disattivato e archiviato, non
eliminato, per poter ricostruire la storia associativa.

## 7. I tuoi diritti

Puoi in qualsiasi momento:

- **accedere** ai tuoi dati e chiederne copia, comprese le annotazioni interne;
- **correggerli**: telefono, indirizzo, email e password li modifichi da solo dal
  tuo profilo, senza chiedere a nessuno;
- **chiederne la cancellazione**, nei limiti degli obblighi di legge sul libro soci;
- **opporti** a un trattamento fondato sul legittimo interesse;
- **chiedere la limitazione** del trattamento;
- **ottenere i dati in formato leggibile** da un altro sistema;
- **proporre reclamo al Garante per la protezione dei dati personali**
  (www.garanteprivacy.it).

Un limite tecnico, dichiarato apertamente: **il voto non è recuperabile né
cancellabile su richiesta**, proprio perché non è collegato a te. È una
conseguenza della segretezza, non una dimenticanza.

Per esercitare i tuoi diritti scrivi a **labrigatasalerno@gmail.com**. Rispondiamo
entro 30 giorni.

## 8. Misure di sicurezza

- Connessione cifrata (HTTPS) su tutta l'app.
- Password conservate solo in forma cifrata e non reversibile.
- Accesso ai dati limitato per ruolo, verificato dal server a ogni richiesta e non
  soltanto nascosto nell'interfaccia.
- Registro delle operazioni sui dati dei soci.
- Il cambio dell'email richiede la conferma della password, perché l'email è la
  credenziale di accesso.
- Database non esposto su internet: raggiungibile solo dall'applicazione.
- Backup periodici **[DA COMPLETARE: frequenza e luogo di conservazione]**.

## 9. Strumenti di analisi e tracciamento

L'app raccoglie statistiche d'uso con **Umami**, installato **sul nostro stesso
server**. I dati non vengono trasmessi a nessuna società terza e non lasciano
l'infrastruttura dell'associazione.

**Non vengono installati cookie** e non viene creato alcun identificativo
persistente: per questo non compare alcun banner di consenso. La base giuridica
è il legittimo interesse dell'associazione a capire quali parti dell'app vengono
usate e quali no, per migliorarle.

Cosa viene registrato, per ogni pagina aperta:

- la **sezione** visitata (per esempio *Turni* o *Votazioni*);
- il tipo di dispositivo, il browser e la lingua;
- il Paese di provenienza, ricavato dall'indirizzo IP, che **non viene conservato**;
- la pagina da cui si è arrivati.

Cosa **non** viene registrato:

- **nessun dato che permetta di risalire a te**: gli identificativi contenuti
  negli indirizzi vengono sostituiti prima dell'invio. Aprire il proprio profilo
  risulta come `/soci/:id`, mai con il tuo identificativo reale;
- **nessuna informazione sul voto**: né le preferenze, né se hai votato;
- nessun contenuto dei campi che compili, nessuna registrazione della sessione.

### Raccolta degli errori

Se un errore tecnico blocca l'app mentre la stai usando, il guasto può essere
segnalato automaticamente a un servizio che ne raccoglie i dettagli tecnici,
allo scopo di correggerlo. Prima dell'invio il contenuto viene ripulito:
password, dati di contatto, annotazioni e qualunque informazione relativa alle
votazioni vengono rimossi. L'utente è identificato dal solo identificativo
interno, che serve a sapere quante persone sono state colpite dallo stesso
guasto, non chi sono.

**[DA COMPLETARE se e quando attivato]** Indicare il fornitore e il Paese di
conservazione.

## 10. Modifiche a questa informativa

Se cambieremo qualcosa di rilevante, lo comunicheremo con un avviso nell'app. La
data in testa a questo documento indica l'ultimo aggiornamento.
