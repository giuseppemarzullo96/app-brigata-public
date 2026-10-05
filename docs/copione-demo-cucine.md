# Copione per la registrazione: gestione del calendario turni

Istruzioni per un agente che registra lo schermo. Mostra due operazioni del
**gestore cucine**: creare un turno con i suoi slot, e prenotare uno slot **per
conto di un'altra persona**.

Ogni passo indica cosa cliccare, cosa scrivere e **cosa deve comparire** — così
l'agente si accorge se qualcosa non è andato, invece di proseguire su una
schermata sbagliata.

---

## Prima di registrare

### Credenziali

```
https://app.labrigataodv.it
prova.cucine@labrigataodv.it
ProvaCucine2026!
```

È un account **gestore cucine** creato apposta. Nome visualizzato: *Gestore Di
Prova*.

### Impostazioni di registrazione

- **Finestra a 1440 × 900** o più larga. Sotto i 1024 px l'app passa al layout
  telefono e il menu si nasconde dietro le tre righe: va bene per una demo da
  telefono, non per questa.
- **Nessun dato personale a schermo.** L'app mostra nomi e cognomi dei soci
  reali negli elenchi. Se la registrazione uscirà dall'associazione, usare la
  versione con i nomi oscurati, oppure fermare la ripresa sul menu a tendina
  dei nomi.
- Movimenti del mouse **lenti**: l'interfaccia risponde in fretta e una demo
  troppo rapida non si segue.
- Ogni conferma mostra un **avviso verde in alto a destra** che dura pochi
  secondi: attendere che compaia prima di proseguire.

### Dati da usare

Per non toccare i turni veri, il copione crea un turno in una data lontana.

| Campo | Valore |
|---|---|
| Data turno | **15 gennaio 2027** |
| Tipo turno | Cena |
| Numero porzioni | 40 |
| Note generali | *Turno di prova per la registrazione* |

---

## Parte 1 — Accesso  *(circa 20 secondi)*

1. Aprire `https://app.labrigataodv.it`.
2. **Attendere** la schermata di accesso: logo giallo, campi *Email* e *Password*.
3. Scrivere l'email, poi la password.
4. Premere **Accedi**.
5. **Verifica:** compare la *Dashboard*. In basso a sinistra si legge
   **Gestore Di Prova** e sotto **Gestore Cucine**.
   › Se si legge un altro nome, l'accesso è di un altro utente: uscire e rifare.

---

## Parte 2 — Creare il turno  *(circa 1 minuto)*

6. Nel menu a sinistra, premere **Turni**.
7. **Verifica:** titolo *Turni Cucine Solidali*, e in alto a destra due
   pulsanti: **Calendario** e **+ Nuovo Turno**.
   › Se **Nuovo Turno** non c'è, l'account non è un gestore cucine: fermarsi.
8. Soffermarsi un momento sull'elenco: ogni cena mostra il contatore dei posti,
   per esempio `8/14 slot`. È il dato che tutta questa schermata serve a governare.
9. Premere **+ Nuovo Turno**.
10. Compilare il modulo:
    - **Data Turno** → `15/01/2027`
    - **Tipo Turno** → `Cena`
    - **Numero Porzioni** → `40`
    - **Note Generali** → `Turno di prova per la registrazione`
11. Premere **Crea Turno**.
12. **Verifica:** si torna all'elenco e compare *venerdì 15 gennaio 2027*.
    › Il turno nasce **senza slot**: il contatore dirà `0/0`. È normale, li
    aggiungiamo adesso.

---

## Parte 3 — Aggiungere gli slot  *(circa 1 minuto e 30)*

13. Premere sul turno appena creato per aprirlo.
14. **Verifica:** intestazione con la data, *Cena*, *Porzioni previste: 40*, e
    più sotto la sezione **Slot Disponibili** con il pulsante **+ Aggiungi Slot**.
15. Premere **+ Aggiungi Slot**. Si apre la finestra *Aggiungi Slot*.
16. Primo slot:
    - **Tipo Slot** → `Primi`
    - **Numero Porzioni** → `20`
    - **Note** → lasciare vuoto
    - Premere **Crea Slot**
17. **Verifica:** la finestra si chiude e compare il gruppo **PRIMI** con
    *Slot #1*.
18. Ripetere per un secondo slot: **Tipo Slot** `Primi`, **Numero Porzioni** `20`.
19. Ripetere per un terzo: **Tipo Slot** `Dolci`, **Numero Porzioni** `15`.
20. **Verifica:** due gruppi, *Primi (2 Slots)* e *Dolci (1 Slot)*. Sotto ogni
    slot libero c'è il pulsante blu **Prenota** e, accanto, quattro icone
    piccole: assegna, ricetta, duplica, elimina (il cestino, in rosso).

> **Da far notare nella registrazione:** gli slot si dividono per portata. È
> così che si sa chi porta i primi e chi i dolci, senza chiederlo in chat.

---

## Parte 4 — Prenotare per conto di un'altra persona  *(circa 1 minuto)*

Questa è la parte che distingue il gestore cucine da un socio qualsiasi. Un
socio prenota **solo per sé**, con il pulsante **Prenota**. Il gestore può
assegnare uno slot **a chiunque**: serve quando qualcuno si offre a voce, in
cucina o al telefono, e non passa dall'app.

21. Sul primo slot dei **Primi**, individuare l'icona **Assegna manualmente**
    accanto al pulsante Prenota. Soffermarsi un istante: il suggerimento
    compare al passaggio del mouse.
22. Premerla. Si apre la finestra **Assegna Slot: PRIMI**.
23. **Verifica:** in alto un riquadro grigio riepiloga *primi* e *20 porzioni*.
24. Nel campo **Cerca utente** scrivere lentamente un nome, per esempio `Sabrina`.
    › La ricerca funziona **solo per nome e cognome**: un gestore cucine non
    vede le email degli altri soci.
25. Aprire il menu **Seleziona Utente** e scegliere la persona.
26. **Verifica:** la finestra si chiude **da sola**, senza un pulsante di
    conferma: la scelta nel menu **è** la conferma. Compare l'avviso verde
    *Slot assegnato con successo*.
27. **Verifica sullo slot:** lo slot ora è verde, riporta **Assegnato a:** con
    il nome scelto, e al posto di *Prenota* mostra **Libera** e **Riassegna**.

> **Da far notare:** il nome resta scritto sullo slot. Chiunque apra il turno
> vede chi porta cosa — è lo scopo della schermata.

---

## Parte 5 — Annullare, per lasciare pulito  *(circa 50 secondi)*

28. Premere **Libera** sullo slot assegnato e confermare.
29. **Verifica:** lo slot torna libero, il nome sparisce.
30. Sul secondo slot dei **Primi**, quello rimasto vuoto, premere l'icona del
    **cestino** e confermare la finestra *Eliminare questo slot?*.
31. **Verifica:** resta un solo slot nei *Primi*, il gruppo diventa
    *Primi (1 Slot)* e il resto del turno non si muove.
    › Il cestino compare **solo sugli slot liberi**: su uno slot con un nome
    sopra non c'è, e il posto va prima liberato. È la garanzia che una
    prenotazione non sparisca sotto i piedi di chi l'ha fatta.
32. Tornare a **Turni** con *← Torna ai turni*.
33. Riaprire il turno del 15 gennaio 2027 e premere **Elimina Turno**, in alto
    a destra. Confermare.
34. **Verifica:** il turno non compare più nell'elenco.

> **Da far notare:** un posto aperto di troppo si toglie da solo. Non serve
> più buttare via la cena e rifarla, perdendo le prenotazioni già raccolte.

> Se la registrazione deve finire sul risultato invece che sulla pulizia,
> fermarla al passo 27 ed eseguire 28-34 a telecamera spenta.

---

## Se qualcosa va storto

| Sintomo | Causa | Cosa fare |
|---|---|---|
| Manca **+ Nuovo Turno** | L'account non è gestore cucine | Controllare che in basso a sinistra si legga *Gestore Cucine* |
| Manca **+ Aggiungi Slot** | Stessa causa | Come sopra |
| Il menu **Seleziona Utente** è vuoto | Difetto nell'elenco soci | Fermarsi e segnalare: era un problema noto, corretto il 23/09/2026 |
| *Turno già esistente per questa data e tipo* | Il turno di prova è rimasto da una registrazione precedente | Aprirlo ed eliminarlo, oppure spostarsi al 16 gennaio 2027 |
| Il pulsante **Prenota** c'è ma **Assegna** no | Si è entrati come socio volontario | Uscire e rientrare con l'account gestore |
| Sullo slot manca l'icona del **cestino** | Lo slot è assegnato a qualcuno | Premere prima **Libera**: il cestino compare solo sui posti vuoti |

---

## Cosa la registrazione deve far capire

Tre cose, in ordine di importanza:

1. **Il calendario si gestisce da soli.** Creare una cena e i suoi slot richiede
   un minuto, senza passare da un amministratore.
2. **Gli slot dicono chi porta cosa.** Divisi per portata, con il nome sopra: è
   l'informazione che prima stava in una chat e si perdeva.
3. **Nessuno resta fuori perché non usa l'app.** Chi si offre a voce viene
   iscritto lo stesso, da chi organizza. L'app registra l'organizzazione, non
   la impone.
