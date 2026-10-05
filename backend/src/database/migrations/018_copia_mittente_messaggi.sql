-- Copia del messaggio cifrata per chi lo ha scritto.
--
-- Il difetto: un messaggio cifrato end-to-end veniva cifrato UNA sola volta,
-- con una chiave derivata dalla pubblica del destinatario. Solo lui poteva
-- rileggerlo. Il mittente vedeva il proprio testo finche' restava aperta la
-- pagina, perche' l'app ne teneva una copia in memoria; al primo
-- ricaricamento, o aprendo la chat da un altro dispositivo, al suo posto
-- compariva "[Messaggio crittografato inviato]", per sempre.
--
-- La correzione: ogni messaggio viene cifrato due volte, una per chi legge e
-- una per chi scrive, con la stessa costruzione a chiave effimera. Le due
-- copie sono indipendenti: nessuna delle due permette di risalire all'altra,
-- e la segretezza verso il server resta quella di prima.
--
-- I messaggi gia' scritti non hanno la copia del mittente e non e' possibile
-- ricostruirla: il server non ha mai avuto il testo in chiaro. Restano
-- leggibili solo da chi li ha ricevuti.

ALTER TABLE messaggi_interni
  ADD COLUMN IF NOT EXISTS contenuto_mittente TEXT,
  ADD COLUMN IF NOT EXISTS iv_mittente VARCHAR(255),
  ADD COLUMN IF NOT EXISTS chiave_ephemeral_mittente TEXT;

COMMENT ON COLUMN messaggi_interni.contenuto_mittente IS
  'Stesso messaggio, cifrato per il mittente: gli serve a rileggere cio'' che ha scritto.';
COMMENT ON COLUMN messaggi_interni.iv_mittente IS
  'Vettore di inizializzazione della copia del mittente.';
COMMENT ON COLUMN messaggi_interni.chiave_ephemeral_mittente IS
  'Chiave pubblica effimera della copia del mittente.';
