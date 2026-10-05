import { Outlet, Link, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../services/authService'
import { useChatAttiva } from '../hooks/useImpostazioni'
import { 
  Calendar, 
  Users, 
  FileText, 
  MessageSquare, 
  Package, 
  Bell, 
  Building2,
  LogOut,
  BookOpen,
  Menu,
  X,
  Home,
  Instagram,
  Vote,
  Settings,
  BarChart3,
  Inbox,
  Landmark,
} from 'lucide-react'

const Layout = () => {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  
  const userCategoria = user?.categoria_socio || user?.ruolo
  const categoriePermesse = ['admin', 'volontario', 'ordinario']
  // I messaggi interni possono essere spenti dagli amministratori: in quel
  // caso la sezione sparisce dal menu per tutti, categoria permessa o no.
  const chatAttiva = useChatAttiva()
  const categoriaPuoUsareChat = userCategoria ? categoriePermesse.includes(userCategoria) || user?.ruolo === 'admin' : false
  const canUseChat = categoriaPuoUsareChat && chatAttiva
  
  // Query per contare avvisi non letti
  const { data: avvisiNonLettiData } = useQuery({
    queryKey: ['avvisi', 'non-letti-count'],
    queryFn: async () => {
      const response = await api.get('/avvisi')
      const avvisi = response.data.avvisi || []
      // Conta avvisi non letti e pubblicati
      const nonLetti = avvisi.filter((a: any) => 
        a.pubblicato && 
        !a.letto && 
        (a.data_scadenza === null || new Date(a.data_scadenza) >= new Date())
      ).length
      return { count: nonLetti }
    },
    refetchInterval: 60000, // Aggiorna ogni 60 secondi (ridotto per ridurre richieste)
    refetchOnWindowFocus: true, // Aggiorna quando si torna alla finestra
    enabled: !!user,
  })
  
  // Query per contare messaggi non letti (solo per admin e soci)
  const { data: messaggiNonLettiData } = useQuery({
    queryKey: ['messaggi', 'non-letti-count'],
    queryFn: async () => {
      const response = await api.get('/messaggi/non-letti')
      return response.data
    },
    refetchInterval: 10000, // Aggiorna ogni 10 secondi (ridotto per ridurre richieste)
    refetchOnWindowFocus: true, // Aggiorna quando si torna alla finestra
    enabled: !!user && canUseChat,
  })
  
  const avvisiNonLetti = avvisiNonLettiData?.count || 0
  const messaggiNonLetti = messaggiNonLettiData?.count || 0

  // Query per contare assemblee non passate
  const { data: assembleeData } = useQuery({
    queryKey: ['assemblee', 'non-passate'],
    queryFn: async () => {
      const response = await api.get('/assemblee')
      const assemblee = response.data.assemblee || []
      // Conta assemblee programmate con data futura
      const nonPassate = assemblee.filter((a: any) => 
        a.stato === 'programmata' && 
        new Date(a.data_assemblea) >= new Date()
      ).length
      return { count: nonPassate }
    },
    refetchInterval: 60000, // Aggiorna ogni 60 secondi (ridotto per ridurre richieste)
    refetchOnWindowFocus: true,
    enabled: !!user,
  })

  // Query per contare sondaggi aperti
  const { data: sondaggiData } = useQuery({
    queryKey: ['sondaggi', 'aperti'],
    queryFn: async () => {
      const response = await api.get('/sondaggi')
      const sondaggi = response.data.sondaggi || []
      // Conta sondaggi aperti
      const aperti = sondaggi.filter((s: any) => s.stato === 'aperto').length
      return { count: aperti }
    },
    refetchInterval: 60000, // Aggiorna ogni 60 secondi (ridotto per ridurre richieste)
    refetchOnWindowFocus: true,
    enabled: !!user,
  })

  // Query per contare le votazioni aperte in cui l'utente non ha ancora votato
  const { data: votazioniData } = useQuery({
    queryKey: ['votazioni', 'da-votare'],
    queryFn: async () => {
      const response = await api.get('/votazioni')
      const votazioni = response.data.votazioni || []
      const daVotare = votazioni.filter(
        (v: any) => v.stato === 'aperta' && v.sono_avente_diritto && !v.ho_votato
      ).length
      return { count: daVotare }
    },
    // Durante un'assemblea il badge deve sparire appena il socio vota.
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    enabled: !!user,
  })

  /**
   * Quanti turni futuri hanno ancora posti scoperti.
   *
   * Contava i POSTI liberi, e senza filtro di data: sommava quelli di ogni
   * turno mai creato, passati compresi, e il badge diceva stabilmente "99+".
   * Anche filtrando le date restavano centinaia, perche' i posti sono
   * quattordici per turno. Un numero a tre cifre che non cala mai non chiede
   * niente a nessuno; il numero di turni da guardare, invece, si legge a
   * colpo d'occhio e scende quando qualcuno se ne occupa.
   */
  const { data: slotData } = useQuery({
    queryKey: ['turni', 'da-coprire'],
    queryFn: async () => {
      const oggi = new Date().toISOString().slice(0, 10)
      const response = await api.get('/turni', { params: { dataInizio: oggi } })
      const turni = response.data.turni || []
      const daCoprire = turni.filter((turno: any) => {
        const totale = parseInt(turno.totale_slot) || 0
        const presi = parseInt(turno.slot_assegnati) || 0
        return totale > 0 && presi < totale
      })
      return { count: daCoprire.length }
    },
    refetchInterval: 60000, // Aggiorna ogni 60 secondi (ridotto per ridurre richieste)
    refetchOnWindowFocus: true,
    enabled: !!user,
  })

  const assembleeNonPassate = assembleeData?.count || 0
  const sondaggiAperti = sondaggiData?.count || 0
  const votazioniDaVotare = votazioniData?.count || 0
  const slotMancanti = slotData?.count || 0

  const isAdmin = user?.ruolo === 'admin'
  const puoCucine = isAdmin || user?.ruolo === 'gestore_cucine'

  /*
   * Le voci del menu, divise come le pensa chi usa l'app: prima quello che
   * riguarda tutti ogni giorno, poi la cucina, poi la vita dell'associazione,
   * e in fondo l'amministrazione. Un contatore ha due soli toni: `urgente`
   * per cio' che chiede di fare qualcosa (leggere, rispondere, votare),
   * `info` per cio' che e' solo da sapere. Prima erano quattro colori senza
   * una regola, e il giallo su bianco non si leggeva.
   */
  type Voce = { name: string; href: string; icon: typeof Home; conta?: number; tono?: 'urgente' | 'info' }
  const sezioni: { titolo?: string; voci: Voce[] }[] = [
    {
      voci: [
        { name: 'Oggi', href: '/dashboard', icon: Home },
        { name: 'Avvisi', href: '/avvisi', icon: Bell, conta: avvisiNonLetti, tono: 'urgente' },
        ...(canUseChat ? [{ name: 'Messaggi', href: '/messaggi', icon: MessageSquare, conta: messaggiNonLetti, tono: 'urgente' as const }] : []),
      ],
    },
    {
      titolo: 'Cucina',
      voci: [
        { name: 'Turni', href: '/turni', icon: Calendar, conta: slotMancanti, tono: 'info' },
        { name: 'Ricettario', href: '/ricettario', icon: BookOpen },
        { name: 'Magazzino', href: '/magazzino', icon: Package },
        ...(puoCucine ? [{ name: 'Storie Instagram', href: '/storie-instagram', icon: Instagram }] : []),
      ],
    },
    {
      titolo: 'Associazione',
      voci: [
        { name: 'Assemblee', href: '/assemblee', icon: FileText, conta: assembleeNonPassate, tono: 'info' },
        { name: 'Sondaggi', href: '/sondaggi', icon: BarChart3, conta: sondaggiAperti, tono: 'info' },
        { name: 'Votazioni', href: '/votazioni', icon: Vote, conta: votazioniDaVotare, tono: 'urgente' },
        { name: 'Consiglio direttivo', href: '/consiglio-direttivo', icon: Landmark },
      ],
    },
    ...(isAdmin
      ? [{
          titolo: 'Amministrazione',
          voci: [
            { name: 'Soci', href: '/soci', icon: Users },
            { name: 'Enti e utenti fittizi', href: '/enti-fittizi', icon: Building2 },
            { name: 'Richieste', href: '/richieste', icon: Inbox },
            { name: 'Impostazioni', href: '/impostazioni', icon: Settings },
          ],
        }]
      : []),
  ]

  const RUOLI: Record<string, string> = {
    admin: 'Admin',
    gestore_cucine: 'Gestore cucine',
    socio_volontario: 'Socio volontario',
    socio_ordinario: 'Socio ordinario',
    esterno: 'Esterno',
  }
  const ruolo = RUOLI[user?.ruolo || ''] || (user?.ruolo || '').replace(/_/g, ' ')
  const nomeUtente = `${user?.nome || ''} ${user?.cognome || ''}`.trim()

  // Le voci della barra in basso del telefono. Chat solo se si può usare;
  // altrimenti quel posto va agli avvisi, che riguardano tutti.
  const vociBarra = [
    { name: 'Oggi', href: '/dashboard', icon: Home, badge: 0 },
    { name: 'Turni', href: '/turni', icon: Calendar, badge: 0 },
    { name: 'Ricette', href: '/ricettario', icon: BookOpen, badge: 0 },
    canUseChat
      ? { name: 'Chat', href: '/messaggi', icon: MessageSquare, badge: messaggiNonLetti }
      : { name: 'Avvisi', href: '/avvisi', icon: Bell, badge: avvisiNonLetti },
  ]
  // Quello che chiede un'azione e sta dentro il menu: senza questo numero
  // sulla voce Menu, un avviso o una votazione aperta passerebbero inosservati.
  const daGuardareNelMenu = votazioniDaVotare + (canUseChat ? avvisiNonLetti : 0)

  // Anche le pagine interne accendono la loro voce: /turni/123 e' ancora Turni.
  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(`${path}/`)

  const closeSidebar = () => setSidebarOpen(false)

  return (
    <div className="min-h-screen bg-gray-50">
      {/*
        Barra di navigazione del telefono. Prima c'era una testata in alto con
        logo e menu a panino: ogni sezione stava a due tocchi, e la testata si
        mangiava 64 pixel di ogni schermata. Le quattro sezioni che si usano
        davvero ora sono a un tocco e sotto il pollice; tutto il resto sta
        nel menu, che si apre dall'ultima voce.
      */}
      <nav
        aria-label="Navigazione principale"
        className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="mx-auto flex h-16 max-w-3xl items-stretch">
          {vociBarra.map((voce) => {
            const Icon = voce.icon
            const attiva = !sidebarOpen && location.pathname.startsWith(voce.href)
            return (
              <Link
                key={voce.href}
                to={voce.href}
                onClick={closeSidebar}
                aria-current={attiva ? 'page' : undefined}
                className={`relative flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
                  attiva ? 'text-gray-900' : 'text-gray-400'
                }`}
              >
                <span className="relative">
                  <Icon className="h-[22px] w-[22px]" strokeWidth={attiva ? 2.2 : 1.8} />
                  {voce.badge > 0 && <Pallino numero={voce.badge} />}
                </span>
                {voce.name}
              </Link>
            )
          })}
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-expanded={sidebarOpen}
            className={`relative flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
              sidebarOpen ? 'text-gray-900' : 'text-gray-400'
            }`}
          >
            <span className="relative">
              <Menu className="h-[22px] w-[22px]" strokeWidth={sidebarOpen ? 2.2 : 1.8} />
              {!sidebarOpen && daGuardareNelMenu > 0 && <Pallino numero={daGuardareNelMenu} />}
            </span>
            Menu
          </button>
        </div>
      </nav>

      {/* Velo dietro al menu aperto, sul telefono */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-gray-900/50" onClick={closeSidebar} />
      )}

      {/* Menu laterale: fisso su schermo largo, a scomparsa sul telefono */}
      <aside
        aria-label="Menu"
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] transform border-r border-gray-200 bg-white shadow-xl transition-transform duration-300 ease-in-out lg:w-64 lg:translate-x-0 lg:shadow-none ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          <div
            className="flex flex-none items-center gap-3 px-5 pb-4 pt-5 lg:pt-6"
            style={{ paddingTop: 'max(1.25rem, env(safe-area-inset-top))' }}
          >
            <img src="/logo-labrigata.png" alt="" className="h-10 w-10 flex-none" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-bold leading-tight text-gray-900">La Brigata</p>
              <p className="text-xs text-gray-500">Organizzazione di volontariato</p>
            </div>
            <button
              type="button"
              onClick={closeSidebar}
              className="-mr-2 flex h-11 w-11 flex-none items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 lg:hidden"
              aria-label="Chiudi il menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4">
            {sezioni.map((sezione, i) => (
              <div key={sezione.titolo || i} className={i > 0 ? 'mt-5' : ''}>
                {sezione.titolo && (
                  <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-400">
                    {sezione.titolo}
                  </p>
                )}
                <div className="space-y-0.5">
                  {sezione.voci.map((voce) => {
                    const Icon = voce.icon
                    const attiva = isActive(voce.href)
                    return (
                      <Link
                        key={voce.href}
                        to={voce.href}
                        onClick={closeSidebar}
                        aria-current={attiva ? 'page' : undefined}
                        className={`flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-[15px] transition-colors ${
                          attiva
                            ? 'bg-gray-100 font-semibold text-gray-900'
                            : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                      >
                        <Icon
                          className={`h-5 w-5 flex-none ${attiva ? 'text-gray-900' : 'text-gray-400'}`}
                          strokeWidth={attiva ? 2.2 : 1.8}
                        />
                        <span className="min-w-0 flex-1 truncate">{voce.name}</span>
                        {!!voce.conta && voce.conta > 0 && (
                          <span
                            className={`flex h-5 min-w-[20px] flex-none items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
                              voce.tono === 'urgente' ? 'bg-orange-700 text-white' : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {voce.conta > 99 ? '99+' : voce.conta}
                          </span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div
            className="flex-none border-t border-gray-200 px-3 pt-3"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            <Link
              to={`/soci/${user?.id}`}
              onClick={closeSidebar}
              className="flex min-h-[56px] items-center gap-3 rounded-xl px-3 py-2 hover:bg-gray-50"
            >
              {user?.foto_profilo ? (
                <img
                  src={(() => {
                    const percorso = user.foto_profilo
                    if (percorso.startsWith('http://') || percorso.startsWith('https://')) return percorso
                    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1'
                    return `${apiUrl.replace('/api/v1', '')}${percorso.startsWith('/') ? '' : '/'}${percorso}`
                  })()}
                  alt=""
                  className="h-10 w-10 flex-none rounded-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              ) : (
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-primary-100 font-display text-base font-bold text-primary-700">
                  {(nomeUtente[0] || '?').toUpperCase()}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-gray-900">{nomeUtente || user?.email}</span>
                <span className="block truncate text-xs text-gray-500">{ruolo}</span>
              </span>
            </Link>
            <button
              type="button"
              onClick={logout}
              className="mt-1 flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 text-[15px] text-red-700 hover:bg-red-50"
            >
              <LogOut className="h-5 w-5" />
              Esci
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main
        className="lg:ml-64 pt-[env(safe-area-inset-top)] lg:pt-0"
        style={{ paddingBottom: 'var(--altezza-barra-basso)' }}
      >
        {user?.sospeso && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 m-4 lg:m-8">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-800">
                  <strong>Il tuo stato di socio è stato sospeso o revocato.</strong> Contatta la mail{' '}
                  <a href="mailto:labrigatasalerno@gmail.com" className="underline">labrigatasalerno@gmail.com</a> per ulteriori informazioni.
                </p>
              </div>
            </div>
          </div>
        )}
        <div className="p-4 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

/** Il numerino rosso sopra un'icona della barra in basso. */
function Pallino({ numero }: { numero: number }) {
  return (
    <span className="absolute -right-2.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-orange-700 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
      {numero > 99 ? '99+' : numero}
    </span>
  )
}

export default Layout

