/**
 * Costruzione dei link diretti alle pagine dell'app.
 *
 * Le notifiche via email e WhatsApp devono portare il socio esattamente dove
 * serve, non genericamente "nell'app": se deve aprire un sondaggio o votare,
 * il link lo porta su quella pagina. Se la sessione e' scaduta l'app chiede le
 * credenziali e poi prosegue verso la destinazione.
 */
const BASE = (process.env.FRONTEND_URL || 'https://app.labrigataodv.it').replace(/\/+$/, '');

/** Link assoluto a un percorso dell'app. */
function linkApp(percorso = '') {
  const pulito = String(percorso).replace(/^\/+/, '');
  return pulito ? `${BASE}/${pulito}` : BASE;
}

const linkAvviso = (id) => linkApp(`avvisi/${id}`);
const linkSondaggio = (id) => linkApp(`sondaggi/${id}`);
const linkAssemblea = (id) => linkApp(`assemblee/${id}`);
const linkVotazione = (id) => linkApp(`votazioni/${id}`);
const linkProfilo = (id) => linkApp(`soci/${id}`);

/** Riga da accodare a un messaggio WhatsApp. */
const rigaWhatsapp = (url, invito = 'Apri nell\'app') => `\n\n👉 ${invito}:\n${url}`;

/** Bottone/paragrafo da accodare a un corpo email HTML. */
const rigaEmail = (url, invito = 'Apri nell\'app') =>
  `<p style="margin-top:24px;"><a href="${url}" style="background:#0f766e;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block;">${invito}</a></p>` +
  `<p style="font-size:12px;color:#666;">Se il pulsante non funziona, copia questo indirizzo nel browser:<br/>${url}</p>`;

module.exports = {
  linkApp,
  linkAvviso,
  linkSondaggio,
  linkAssemblea,
  linkVotazione,
  linkProfilo,
  rigaWhatsapp,
  rigaEmail,
};
