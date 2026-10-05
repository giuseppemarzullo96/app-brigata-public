-- Sondaggi WhatsApp per coprire gli slot rimasti liberi.
--
-- Il gestore cucine pubblica sul gruppo un sondaggio per ogni pietanza ancora
-- scoperta (primi, dolci, acqua, frutta), e dentro ogni sondaggio c'e' una
-- opzione per ogni singolo slot libero di quella pietanza. Chi vota si prende
-- quel posto preciso. Il voto arriva come 'pollUpdateMessage' e porta con se'
-- il numero del votante, il nome WhatsApp e le opzioni scelte in chiaro.
--
-- Attenzione a come funziona il voto: WhatsApp NON manda "ho aggiunto questa
-- scelta", manda ogni volta l'elenco completo delle opzioni attualmente
-- selezionate da quella persona. Chi toglie la spunta produce un messaggio con
-- una opzione in meno. Per questo teniamo traccia di quale slot e' stato dato
-- a chi: senza, non sapremmo cosa liberare quando qualcuno si sfila, ne'
-- distinguere un posto preso dal sondaggio da uno assegnato a mano dal gestore.

CREATE TABLE IF NOT EXISTS sondaggi_whatsapp (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    turno_id UUID NOT NULL REFERENCES turni_cucina(id) ON DELETE CASCADE,
    tipo_slot VARCHAR(50) NOT NULL,
    gruppo_jid VARCHAR(100) NOT NULL,
    wa_message_id VARCHAR(100) NOT NULL UNIQUE,
    domanda TEXT NOT NULL,
    stato VARCHAR(20) NOT NULL DEFAULT 'aperto',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sondaggi_wa_turno ON sondaggi_whatsapp(turno_id);

-- Una opzione = uno slot. L'etichetta e' la chiave di collegamento col voto:
-- WhatsApp rimanda indietro il testo esatto dell'opzione, non un
-- identificativo, quindi va conservata identica a come e' stata spedita e
-- dev'essere diversa da tutte le altre dello stesso sondaggio. Due posti da 15
-- porzioni con la stessa etichetta sarebbero indistinguibili al ritorno.
CREATE TABLE IF NOT EXISTS opzioni_sondaggio_whatsapp (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sondaggio_id UUID NOT NULL REFERENCES sondaggi_whatsapp(id) ON DELETE CASCADE,
    slot_id UUID NOT NULL REFERENCES slot_turno(id) ON DELETE CASCADE,
    etichetta TEXT NOT NULL,
    UNIQUE (sondaggio_id, etichetta),
    UNIQUE (sondaggio_id, slot_id)
);

-- Un posto assegnato passando dal sondaggio. UNIQUE(slot_id) perche' uno slot
-- non puo' essere prenotato due volte per questa via: e' il vincolo che rende
-- vera la regola "se lo prende il primo che vota".
CREATE TABLE IF NOT EXISTS prenotazioni_sondaggio_whatsapp (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sondaggio_id UUID NOT NULL REFERENCES sondaggi_whatsapp(id) ON DELETE CASCADE,
    opzione_id UUID NOT NULL REFERENCES opzioni_sondaggio_whatsapp(id) ON DELETE CASCADE,
    slot_id UUID NOT NULL REFERENCES slot_turno(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wa_lid VARCHAR(100),
    wa_telefono VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (slot_id)
);

CREATE INDEX IF NOT EXISTS idx_prenotazioni_wa_sondaggio ON prenotazioni_sondaggio_whatsapp(sondaggio_id, user_id);

-- WhatsApp sta passando dai numeri ai LID: il numero puo' sparire dai payload,
-- il LID no. Lo conserviamo come identificativo stabile del votante, cosi' il
-- riconoscimento continua a funzionare anche quando il numero non arriva.
ALTER TABLE users ADD COLUMN IF NOT EXISTS wa_lid VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_wa_lid ON users(wa_lid) WHERE wa_lid IS NOT NULL;
