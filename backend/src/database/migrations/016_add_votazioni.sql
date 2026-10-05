-- Migration: Modulo votazioni organi sociali (es. rinnovo consiglio direttivo)
-- Data: 2026-09-22
--
-- Principio di progettazione: il voto e' SEGRETO.
-- "Chi ha votato" vive solo in aventi_diritto_votazione.ha_votato.
-- "Cosa e' stato votato" vive in schede_votazione / voti_votazione, che NON
-- contengono alcun riferimento all'utente. Le due informazioni non sono
-- ricollegabili con nessuna query.

-- Votazione: l'evento elettorale
CREATE TABLE IF NOT EXISTS votazioni (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titolo VARCHAR(255) NOT NULL,
    descrizione TEXT,
    assemblea_id UUID REFERENCES assemblee(id) ON DELETE SET NULL,
    -- Numero di membri dell'organo da rinnovare: determina quanti candidati
    -- risultano eletti a scrutinio concluso.
    seggi_da_eleggere INTEGER NOT NULL CHECK (seggi_da_eleggere > 0),
    -- Preferenze esprimibili da ciascun elettore. Di norma coincide con i
    -- seggi, ma resta configurabile (alcuni statuti prevedono un numero minore).
    preferenze_max INTEGER NOT NULL CHECK (preferenze_max > 0),
    -- Categorie socio aventi diritto; NULL o ["tutti"] = tutti i soci non fittizi.
    destinatari JSONB,
    stato VARCHAR(20) NOT NULL DEFAULT 'bozza'
        CHECK (stato IN ('bozza', 'aperta', 'chiusa', 'annullata')),
    aperta_at TIMESTAMP,
    chiusa_at TIMESTAMP,
    verbale_path VARCHAR(500),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT preferenze_non_superiori_ai_seggi CHECK (preferenze_max <= seggi_da_eleggere)
);

-- Candidati. user_id e' opzionale: uno statuto puo' ammettere candidature
-- di persone non ancora registrate in app.
CREATE TABLE IF NOT EXISTS candidati_votazione (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    votazione_id UUID NOT NULL REFERENCES votazioni(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    nome VARCHAR(100) NOT NULL,
    cognome VARCHAR(100) NOT NULL,
    note TEXT,
    ordine INTEGER NOT NULL DEFAULT 0,
    ritirato BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Lo stesso socio non puo' essere candidato due volte nella stessa votazione.
CREATE UNIQUE INDEX IF NOT EXISTS idx_candidati_votazione_user
    ON candidati_votazione(votazione_id, user_id)
    WHERE user_id IS NOT NULL;

-- Snapshot dell'elettorato, congelato al momento dell'apertura.
-- Serve a rendere il quorum del verbale verificabile a posteriori: se un socio
-- viene aggiunto, sospeso o archiviato a votazione aperta, l'elettorato non cambia.
CREATE TABLE IF NOT EXISTS aventi_diritto_votazione (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    votazione_id UUID NOT NULL REFERENCES votazioni(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ha_votato BOOLEAN NOT NULL DEFAULT false,
    votato_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(votazione_id, user_id)
);

-- La scheda deposta nell'urna. Nessun riferimento all'elettore.
CREATE TABLE IF NOT EXISTS schede_votazione (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    votazione_id UUID NOT NULL REFERENCES votazioni(id) ON DELETE CASCADE,
    scheda_bianca BOOLEAN NOT NULL DEFAULT false,
    num_preferenze INTEGER NOT NULL DEFAULT 0 CHECK (num_preferenze >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Le singole preferenze espresse su una scheda. Nessun riferimento all'elettore.
CREATE TABLE IF NOT EXISTS voti_votazione (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scheda_id UUID NOT NULL REFERENCES schede_votazione(id) ON DELETE CASCADE,
    candidato_id UUID NOT NULL REFERENCES candidati_votazione(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Nessuna doppia preferenza allo stesso candidato sulla medesima scheda.
    UNIQUE(scheda_id, candidato_id)
);

CREATE INDEX IF NOT EXISTS idx_votazioni_stato ON votazioni(stato);
CREATE INDEX IF NOT EXISTS idx_votazioni_assemblea ON votazioni(assemblea_id);
CREATE INDEX IF NOT EXISTS idx_candidati_votazione ON candidati_votazione(votazione_id, ordine);
CREATE INDEX IF NOT EXISTS idx_aventi_diritto_votazione ON aventi_diritto_votazione(votazione_id, user_id);
CREATE INDEX IF NOT EXISTS idx_schede_votazione ON schede_votazione(votazione_id);
CREATE INDEX IF NOT EXISTS idx_voti_scheda ON voti_votazione(scheda_id);
CREATE INDEX IF NOT EXISTS idx_voti_candidato ON voti_votazione(candidato_id);
