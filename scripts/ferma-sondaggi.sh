#!/bin/sh
# Interruttore di emergenza per i sondaggi WhatsApp.
#
# Chiude tutti i sondaggi aperti. Da quel momento i voti che continuano ad
# arrivare sui messaggi gia' pubblicati vengono ignorati: il servizio applica
# solo i voti dei sondaggi in stato 'aperto'.
#
# Serve quando qualcosa va storto e i posti si stanno assegnando in modo
# sbagliato. NON cancella le assegnazioni gia' fatte: quelle si sistemano
# dall'app, slot per slot, con Libera.
#
# Nota: svuotare l'impostazione 'gruppo_whatsapp_cucine' impedisce solo di
# pubblicarne di NUOVI, non ferma i voti su quelli gia' in giro. Per fermare
# davvero tutto serve questo script (oppure togliere WHATSAPP_WEBHOOK_TOKEN
# dall'ambiente e riavviare, che fa cadere ogni voto in ingresso).

CONTAINER=${CONTAINER_DB:-app-brigata-postgres}
DB=${DB_NAME:-app_brigata}
DB_USER=${DB_USER:-app_brigata}

echo "Sondaggi attualmente aperti:"
docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB" -c \
  "SELECT sw.id, t.data_turno, sw.tipo_slot, sw.created_at
     FROM sondaggi_whatsapp sw
     JOIN turni_cucina t ON t.id = sw.turno_id
    WHERE sw.stato = 'aperto'
    ORDER BY t.data_turno;"

printf "Chiuderli tutti? [s/N] "
read -r risposta
case "$risposta" in
  s|S|si|SI|Si) ;;
  *) echo "Niente fatto."; exit 0 ;;
esac

docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB" -c \
  "UPDATE sondaggi_whatsapp SET stato = 'chiuso', updated_at = CURRENT_TIMESTAMP
    WHERE stato = 'aperto';"

echo
echo "Fatto. I voti in arrivo su questi sondaggi non assegneranno piu' posti."
echo "Le assegnazioni gia' fatte restano: controllale dall'app, turno per turno."
