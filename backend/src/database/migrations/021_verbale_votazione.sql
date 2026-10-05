-- Verbale d'assemblea della votazione e registro presenze.
-- Data: 2026-09-28
--
-- Il verbale segue lo schema dei modelli CSV (CESVOT, CSV Torino) e lo statuto
-- (art. 9, 10, 11, 17): chi presiede e chi verbalizza, convocazione, quorum,
-- numero dei componenti del consiglio, chiusura, registro presenze allegato.
-- Questi dati non esistono in nessun'altra tabella e li inserisce l'admin.

-- Dati descrittivi della seduta. JSONB perche' sono solo testo da stampare:
-- nessuna query li filtra e il loro elenco puo' crescere senza migrazioni.
ALTER TABLE votazioni ADD COLUMN IF NOT EXISTS dati_verbale JSONB;

-- Registro presenze. Sta sull'elettorato congelato: chi non era avente diritto
-- non puo' comparire fra i presenti. Resta separato da "cosa e' stato votato".
--   in_sala    presente di persona
--   collegato  presente a distanza
--   delega     rappresentato da delegato_user_id (art. 9.3, massimo due deleghe)
--   assente
-- NULL = non ancora registrato dall'admin.
ALTER TABLE aventi_diritto_votazione
    ADD COLUMN IF NOT EXISTS presenza VARCHAR(20)
        CHECK (presenza IN ('in_sala', 'collegato', 'delega', 'assente')),
    ADD COLUMN IF NOT EXISTS delegato_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Un delegato ha senso solo su una delega. Il contrario (delega senza
-- delegato) non si vieta qui: ON DELETE SET NULL deve poter cancellare un
-- utente che era delegato. Che una nuova delega indichi il delegato lo
-- verifica l'API.
ALTER TABLE aventi_diritto_votazione
    DROP CONSTRAINT IF EXISTS delegato_solo_su_delega;
ALTER TABLE aventi_diritto_votazione
    ADD CONSTRAINT delegato_solo_su_delega
        CHECK (delegato_user_id IS NULL OR presenza = 'delega');
