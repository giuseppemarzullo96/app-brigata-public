-- ============================================
-- Schema Database La Brigata ODV
-- PostgreSQL 14+
-- ============================================

-- Abilita estensione UUID se non presente
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. TABELLA USERS (deve essere prima per le foreign keys)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nome VARCHAR(100) NOT NULL,
    cognome VARCHAR(100) NOT NULL,
    telefono VARCHAR(20),
    data_nascita DATE,
    codice_fiscale VARCHAR(16) UNIQUE,
    indirizzo TEXT,
    citta VARCHAR(100),
    cap VARCHAR(10),
    
    -- Categoria socio
    categoria_socio VARCHAR(50) NOT NULL, -- 'volontario', 'ordinario', 'simpatizzante', 'esterno', 'giuridico'
    tipo_persona VARCHAR(20) DEFAULT 'fisica', -- 'fisica' o 'giuridica'
    
    -- Per persone giuridiche
    ragione_sociale VARCHAR(255),
    partita_iva VARCHAR(11),
    
    -- Ruolo sistema
    ruolo VARCHAR(50) DEFAULT 'socio_ordinario', -- 'admin', 'socio_volontario', 'socio_ordinario', 'simpatizzante'
    
    -- Status
    attivo BOOLEAN DEFAULT true,
    archiviato BOOLEAN DEFAULT false,
    data_archiviazione TIMESTAMP,
    
    -- Note e changelog
    note TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- GDPR
    consenso_privacy BOOLEAN DEFAULT false,
    consenso_marketing BOOLEAN DEFAULT false,
    data_consenso_privacy TIMESTAMP,
    
    -- Audit
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

-- ============================================
-- 2. USER_CHANGELOG
-- ============================================
CREATE TABLE IF NOT EXISTS user_changelog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    campo_modificato VARCHAR(100),
    valore_precedente TEXT,
    valore_nuovo TEXT,
    motivo_modifica TEXT,
    modificato_da UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 3. QUOTE_ASSOCIATIVE
-- ============================================
CREATE TABLE IF NOT EXISTS quote_associative (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    anno INTEGER NOT NULL,
    importo DECIMAL(10,2) NOT NULL,
    data_pagamento DATE,
    metodo_pagamento VARCHAR(50), -- 'contanti', 'bonifico', 'paypal', etc.
    riferimento_pagamento VARCHAR(255), -- numero bonifico, etc.
    note TEXT,
    pagata BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(user_id, anno)
);

-- ============================================
-- 4. TURNI_CUCINA
-- ============================================
CREATE TABLE IF NOT EXISTS turni_cucina (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data_turno DATE NOT NULL,
    tipo_turno VARCHAR(50), -- 'colazione', 'pranzo', 'cena'
    numero_porzioni INTEGER,
    note_generali TEXT,
    ricettario_id UUID, -- Foreign key aggiunta dopo creazione ricettari
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(data_turno, tipo_turno)
);

-- ============================================
-- 5. RICETTARI
-- ============================================
CREATE TABLE IF NOT EXISTS ricettari (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    turno_id UUID REFERENCES turni_cucina(id) ON DELETE CASCADE, -- NULL per ricette globali
    nome_ricetta VARCHAR(255) NOT NULL,
    descrizione TEXT,
    tipo_ricetta VARCHAR(50), -- 'primi', 'secondi', 'contorni', 'dolci', 'pane', 'acqua', 'altro'
    ingredienti JSONB, -- Array di ingredienti con quantità
    istruzioni TEXT,
    porzioni INTEGER,
    note_alimentari TEXT, -- esclusioni, allergeni, etc.
    globale BOOLEAN DEFAULT false, -- Se true, ricetta nel ricettario globale
    archiviato BOOLEAN DEFAULT false, -- Se true, ricetta archiviata ma disponibile
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Aggiungi foreign key ricettario_id a turni_cucina
ALTER TABLE turni_cucina 
ADD CONSTRAINT fk_turni_ricettario 
FOREIGN KEY (ricettario_id) REFERENCES ricettari(id);

-- ============================================
-- 6. SLOT_TURNO
-- ============================================
CREATE TABLE IF NOT EXISTS slot_turno (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    turno_id UUID NOT NULL REFERENCES turni_cucina(id) ON DELETE CASCADE,
    tipo_slot VARCHAR(50) NOT NULL, -- 'primi', 'secondi', 'dolci', 'acqua', 'pane', etc.
    numero_porzioni INTEGER,
    stato VARCHAR(20) DEFAULT 'libero', -- 'libero', 'assegnato', 'completato'
    user_id UUID REFERENCES users(id), -- volontario assegnato
    ricettario_id UUID REFERENCES ricettari(id) ON DELETE SET NULL, -- Ricetta associata allo slot
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 7. PARTECIPAZIONI_ATTIVITA
-- ============================================
CREATE TABLE IF NOT EXISTS partecipazioni_attivita (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tipo_attivita VARCHAR(50) NOT NULL, -- 'cucina', 'distribuzione', 'sportello', etc.
    data_attivita DATE NOT NULL,
    turno_id UUID REFERENCES turni_cucina(id),
    slot_id UUID REFERENCES slot_turno(id),
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 8. ASSEMBLEE
-- ============================================
CREATE TABLE IF NOT EXISTS assemblee (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titolo VARCHAR(255) NOT NULL,
    data_assemblea TIMESTAMP NOT NULL,
    luogo VARCHAR(255),
    ordine_del_giorno TEXT,
    tipo_assemblea VARCHAR(50), -- 'ordinaria', 'straordinaria', 'consiglio'
    stato VARCHAR(20) DEFAULT 'programmata', -- 'programmata', 'in_corso', 'conclusa', 'annullata'
    verbale_path VARCHAR(500), -- path al file PDF verbale
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 9. CONVOCAZIONI_ASSEMBLEA
-- ============================================
CREATE TABLE IF NOT EXISTS convocazioni_assemblea (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assemblea_id UUID NOT NULL REFERENCES assemblee(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email_inviata BOOLEAN DEFAULT false,
    data_invio_email TIMESTAMP,
    email_error TEXT,
    presenza BOOLEAN, -- null = non risposto, true = presente, false = assente
    data_risposta TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(assemblea_id, user_id)
);

-- ============================================
-- 10. ALLEGATI_ASSEMBLEA
-- ============================================
CREATE TABLE IF NOT EXISTS allegati_assemblea (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assemblea_id UUID NOT NULL REFERENCES assemblee(id) ON DELETE CASCADE,
    nome_file VARCHAR(255) NOT NULL,
    path_file VARCHAR(500) NOT NULL,
    tipo_file VARCHAR(50), -- 'pdf', 'doc', etc.
    dimensione INTEGER,
    uploaded_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 11. SONDAGGI
-- ============================================
CREATE TABLE IF NOT EXISTS sondaggi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titolo VARCHAR(255) NOT NULL,
    descrizione TEXT,
    tipo_sondaggio VARCHAR(50) DEFAULT 'scelta_multipla', -- 'scelta_multipla', 'testo_libero', 'si_no'
    stato VARCHAR(20) DEFAULT 'bozza', -- 'bozza', 'aperto', 'chiuso'
    data_apertura TIMESTAMP,
    data_chiusura TIMESTAMP,
    risultati_visibili BOOLEAN DEFAULT false, -- se i soci possono vedere i risultati
    destinatari JSONB, -- array di categorie: ['volontario', 'ordinario', etc.]
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 12. OPZIONI_SONDAGGIO
-- ============================================
CREATE TABLE IF NOT EXISTS opzioni_sondaggio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sondaggio_id UUID NOT NULL REFERENCES sondaggi(id) ON DELETE CASCADE,
    testo_opzione TEXT NOT NULL,
    ordine INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 13. RISPOSTE_SONDAGGIO
-- ============================================
CREATE TABLE IF NOT EXISTS risposte_sondaggio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sondaggio_id UUID NOT NULL REFERENCES sondaggi(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    opzione_id UUID REFERENCES opzioni_sondaggio(id), -- per scelta multipla
    risposta_testo TEXT, -- per testo libero
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(sondaggio_id, user_id)
);

-- ============================================
-- 14. MAGAZZINO_CATEGORIE
-- ============================================
CREATE TABLE IF NOT EXISTS magazzino_categorie (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(100) NOT NULL UNIQUE,
    descrizione TEXT,
    unita_misura VARCHAR(20), -- 'pezzi', 'kg', 'litri', etc.
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 15. MAGAZZINO_BENI
-- ============================================
CREATE TABLE IF NOT EXISTS magazzino_beni (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    categoria_id UUID NOT NULL REFERENCES magazzino_categorie(id),
    nome VARCHAR(255) NOT NULL,
    descrizione TEXT,
    quantita_disponibile DECIMAL(10,2) DEFAULT 0,
    quantita_minima DECIMAL(10,2) DEFAULT 0, -- soglia per alert
    unita_misura VARCHAR(20),
    ubicazione VARCHAR(255), -- dove è conservato
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 16. MOVIMENTI_MAGAZZINO
-- ============================================
CREATE TABLE IF NOT EXISTS movimenti_magazzino (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bene_id UUID NOT NULL REFERENCES magazzino_beni(id) ON DELETE CASCADE,
    tipo_movimento VARCHAR(50) NOT NULL, -- 'entrata', 'uscita', 'scaduto', 'danneggiato'
    quantita DECIMAL(10,2) NOT NULL,
    motivo TEXT,
    riferimento_esterno VARCHAR(255), -- numero donazione, etc.
    user_id UUID REFERENCES users(id), -- chi ha registrato
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 17. DONAZIONI
-- ============================================
CREATE TABLE IF NOT EXISTS donazioni (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo_donazione VARCHAR(50) NOT NULL, -- 'monetaria', 'materiale', 'servizio'
    importo DECIMAL(10,2), -- per donazioni monetarie
    descrizione TEXT,
    donatore_nome VARCHAR(255),
    donatore_email VARCHAR(255),
    donatore_telefono VARCHAR(20),
    anonima BOOLEAN DEFAULT false,
    data_donazione DATE NOT NULL,
    ricevuta_emessa BOOLEAN DEFAULT false,
    note TEXT,
    registrato_da UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 18. DONAZIONI_MATERIALI
-- ============================================
CREATE TABLE IF NOT EXISTS donazioni_materiali (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    donazione_id UUID NOT NULL REFERENCES donazioni(id) ON DELETE CASCADE,
    bene_id UUID REFERENCES magazzino_beni(id),
    quantita DECIMAL(10,2),
    descrizione TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 19. AVVISI
-- ============================================
CREATE TABLE IF NOT EXISTS avvisi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titolo VARCHAR(255) NOT NULL,
    contenuto TEXT NOT NULL,
    priorita VARCHAR(20) DEFAULT 'normale', -- 'bassa', 'normale', 'alta', 'urgente'
    destinatari JSONB, -- categorie destinatari o 'tutti'
    pubblicato BOOLEAN DEFAULT false,
    data_pubblicazione TIMESTAMP,
    data_scadenza TIMESTAMP,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 20. MESSAGGI_INTERNI
-- ============================================
CREATE TABLE IF NOT EXISTS messaggi_interni (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mittente_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    destinatario_id UUID REFERENCES users(id) ON DELETE CASCADE, -- null = messaggio a tutti
    oggetto VARCHAR(255),
    contenuto TEXT NOT NULL,
    letto BOOLEAN DEFAULT false,
    data_lettura TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 21. RICHIESTE_FORM
-- ============================================
CREATE TABLE IF NOT EXISTS richieste_form (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo_richiesta VARCHAR(50), -- 'volontario', 'donazione', 'sportello', 'contatto'
    nome VARCHAR(100),
    email VARCHAR(255),
    telefono VARCHAR(20),
    messaggio TEXT,
    stato VARCHAR(20) DEFAULT 'nuova', -- 'nuova', 'in_lavorazione', 'completata', 'archiviata'
    assegnata_a UUID REFERENCES users(id),
    note_internal TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 22. SPORTELLI_SPECIALISTICI
-- ============================================
CREATE TABLE IF NOT EXISTS sportelli_specialistici (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(100) NOT NULL, -- 'legale', 'sanitario', 'lavoro', etc.
    descrizione TEXT,
    responsabile_id UUID REFERENCES users(id),
    attivo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 23. BENEFICIARI
-- ============================================
CREATE TABLE IF NOT EXISTS beneficiari (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codice_anonimo VARCHAR(50) UNIQUE NOT NULL, -- codice identificativo anonimo
    nome VARCHAR(100),
    cognome VARCHAR(100),
    data_nascita DATE,
    luogo_nascita VARCHAR(100),
    codice_fiscale_criptato VARCHAR(255), -- criptato
    telefono_criptato VARCHAR(255), -- criptato
    email_criptato VARCHAR(255), -- criptato
    indirizzo_criptato TEXT, -- criptato
    note_criptate TEXT, -- criptato
    
    -- Consensi GDPR
    consenso_trattamento BOOLEAN DEFAULT false,
    data_consenso TIMESTAMP,
    consenso_condivisione BOOLEAN DEFAULT false,
    
    -- Status
    attivo BOOLEAN DEFAULT true,
    data_primo_contatto DATE,
    
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 24. APPUNTAMENTI_SPORTELLO
-- ============================================
CREATE TABLE IF NOT EXISTS appuntamenti_sportello (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sportello_id UUID NOT NULL REFERENCES sportelli_specialistici(id) ON DELETE CASCADE,
    beneficiario_id UUID NOT NULL REFERENCES beneficiari(id) ON DELETE CASCADE,
    data_appuntamento TIMESTAMP NOT NULL,
    durata_minuti INTEGER DEFAULT 60,
    tipo_intervento VARCHAR(100),
    note TEXT,
    stato VARCHAR(20) DEFAULT 'programmato', -- 'programmato', 'completato', 'annullato', 'mancato'
    operatore_id UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 25. INTERVENTI_SPORTELLO
-- ============================================
CREATE TABLE IF NOT EXISTS interventi_sportello (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appuntamento_id UUID REFERENCES appuntamenti_sportello(id),
    beneficiario_id UUID NOT NULL REFERENCES beneficiari(id) ON DELETE CASCADE,
    sportello_id UUID NOT NULL REFERENCES sportelli_specialistici(id),
    data_intervento DATE NOT NULL,
    tipo_intervento VARCHAR(100),
    descrizione_criptata TEXT, -- criptato per GDPR
    esito VARCHAR(50),
    note_internal TEXT, -- solo per operatori
    operatore_id UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 26. AUDIT_LOG
-- ============================================
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    azione VARCHAR(100) NOT NULL, -- 'login', 'modifica_socio', 'creazione_turno', etc.
    entita VARCHAR(50), -- 'user', 'turno', 'assemblea', etc.
    entita_id UUID,
    dettagli JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 27. PERMESSI
-- ============================================
CREATE TABLE IF NOT EXISTS permessi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(100) UNIQUE NOT NULL,
    descrizione TEXT,
    categoria VARCHAR(50), -- 'turni', 'soci', 'assemblee', etc.
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 28. RUOLI_PERMESSI
-- ============================================
CREATE TABLE IF NOT EXISTS ruoli_permessi (
    ruolo VARCHAR(50) NOT NULL,
    permesso_id UUID NOT NULL REFERENCES permessi(id) ON DELETE CASCADE,
    PRIMARY KEY (ruolo, permesso_id)
);

-- ============================================
-- INDICI PER PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_categoria ON users(categoria_socio);
CREATE INDEX IF NOT EXISTS idx_users_ruolo ON users(ruolo);
CREATE INDEX IF NOT EXISTS idx_turni_data ON turni_cucina(data_turno);
CREATE INDEX IF NOT EXISTS idx_slot_turno ON slot_turno(turno_id);
CREATE INDEX IF NOT EXISTS idx_slot_user ON slot_turno(user_id);
CREATE INDEX IF NOT EXISTS idx_partecipazioni_user ON partecipazioni_attivita(user_id);
CREATE INDEX IF NOT EXISTS idx_partecipazioni_data ON partecipazioni_attivita(data_attivita);
CREATE INDEX IF NOT EXISTS idx_assemblee_data ON assemblee(data_assemblea);
CREATE INDEX IF NOT EXISTS idx_convocazioni_assemblea ON convocazioni_assemblea(assemblea_id, user_id);
CREATE INDEX IF NOT EXISTS idx_sondaggi_stato ON sondaggi(stato);
CREATE INDEX IF NOT EXISTS idx_risposte_sondaggio ON risposte_sondaggio(sondaggio_id, user_id);
CREATE INDEX IF NOT EXISTS idx_magazzino_categoria ON magazzino_beni(categoria_id);
CREATE INDEX IF NOT EXISTS idx_movimenti_bene ON movimenti_magazzino(bene_id);
CREATE INDEX IF NOT EXISTS idx_avvisi_pubblicati ON avvisi(pubblicato, data_scadenza);
CREATE INDEX IF NOT EXISTS idx_messaggi_destinatario ON messaggi_interni(destinatario_id, letto);
CREATE INDEX IF NOT EXISTS idx_beneficiari_codice ON beneficiari(codice_anonimo);
CREATE INDEX IF NOT EXISTS idx_appuntamenti_data ON appuntamenti_sportello(data_appuntamento);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, created_at);

-- ============================================
-- FINE SCHEMA
-- ============================================

