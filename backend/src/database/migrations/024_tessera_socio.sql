-- Tessera associativa digitale (Apple Wallet e Google Wallet).
-- Data: 2026-09-30
--
-- numero_tessera: il numero del socio, fisso negli anni. Ai soci gia' in
-- archivio si assegna ora in ordine di inserimento nell'app (poi di cognome e
-- nome); ai nuovi quando ricevono la prima tessera, dalla sequenza. Gli
-- account fittizi (enti esterni) non sono soci e non ricevono un numero.
--
-- codice_tessera: il codice stampato nel QR della tessera. Non e' l'id del
-- socio: chi legge il QR non deve poter risalire all'account, e un codice si
-- puo' rigenerare se una tessera va persa senza cambiare nient'altro.
CREATE SEQUENCE IF NOT EXISTS numero_tessera_seq;

ALTER TABLE users ADD COLUMN IF NOT EXISTS numero_tessera INTEGER UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS codice_tessera VARCHAR(32) UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', '');

UPDATE users u
   SET numero_tessera = n.base + n.progressivo
  FROM (SELECT id,
               (SELECT COALESCE(MAX(numero_tessera), 0) FROM users) AS base,
               ROW_NUMBER() OVER (ORDER BY created_at, cognome, nome, id) AS progressivo
          FROM users
         WHERE numero_tessera IS NULL AND NOT COALESCE(fittizio, false)) n
 WHERE u.id = n.id;

SELECT setval('numero_tessera_seq', GREATEST((SELECT COALESCE(MAX(numero_tessera), 0) FROM users), 1), (SELECT MAX(numero_tessera) FROM users) IS NOT NULL);

COMMENT ON COLUMN users.numero_tessera IS 'Numero di tessera del socio, fisso negli anni';
COMMENT ON COLUMN users.codice_tessera IS 'Codice nel QR della tessera digitale, per la verifica pubblica';
