import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import CalendarioPubblico from './pages/CalendarioPubblico'
import VerificaTessera from './pages/VerificaTessera'
import PasswordDimenticata from './pages/PasswordDimenticata'
import ReimpostaPassword from './pages/ReimpostaPassword'
import Dashboard from './pages/Dashboard'
import Turni from './pages/Turni'
import TurniCalendar from './pages/TurniCalendar'
import TurniCreate from './pages/TurniCreate'
import TurnoDetail from './pages/TurnoDetail'
import Soci from './pages/Soci'
import SociCreate from './pages/SociCreate'
import SocioDetail from './pages/SocioDetail'
import Assemblee from './pages/Assemblee'
import AssembleeCreate from './pages/AssembleeCreate'
import AssembleaDetail from './pages/AssembleaDetail'
import Sondaggi from './pages/Sondaggi'
import SondaggiCreate from './pages/SondaggiCreate'
import SondaggioDetail from './pages/SondaggioDetail'
import Votazioni from './pages/Votazioni'
import VotazioniCreate from './pages/VotazioniCreate'
import ConsiglioDirettivo from './pages/ConsiglioDirettivo'
import VotazioneDetail from './pages/VotazioneDetail'
import Impostazioni from './pages/Impostazioni'
import { registraPagina } from './services/statistiche'
import { useChatAttiva } from './hooks/useImpostazioni'
import Magazzino from './pages/Magazzino'
import MagazzinoCreate from './pages/MagazzinoCreate'
import Avvisi from './pages/Avvisi'
import AvvisiCreate from './pages/AvvisiCreate'
import AvvisoDetail from './pages/AvvisoDetail'
import Sportelli from './pages/Sportelli'
import Messaggi from './pages/Messaggi'
import Richieste from './pages/Richieste'
import Ricettario from './pages/Ricettario'
import EntiFittizi from './pages/EntiFittizi'
import StorieInstagram from './pages/StorieInstagram'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Caricamento...</div>
  }

  if (!user) {
    // Conserva la destinazione: chi arriva da un link diretto (un avviso, una
    // votazione) dopo il login deve trovarsi sulla pagina che aveva aperto,
    // non sulla dashboard.
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}

/**
 * Limita una pagina a certi ruoli.
 *
 * Nascondere la voce dal menu non basta: chi conosce l'indirizzo la apre
 * comunque. Qui la rotta dice la stessa cosa del menu. Il server resta
 * l'autorita' finale: questa e' la cortesia di non mostrare una pagina che
 * non si puo' usare, non la misura di sicurezza.
 */
function RuoloRoute({ ruoli, children }: { ruoli: string[]; children: React.ReactNode }) {
  const { user } = useAuth()
  if (!user) return null
  if (!ruoli.includes(user.ruolo)) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

/**
 * Sezione che gli amministratori possono spegnere dalle impostazioni.
 * Serve a chi arriva digitando l'indirizzo: nel menu la voce gia' non c'e'.
 */
function SezioneAttiva({ attiva, children }: { attiva: boolean; children: React.ReactNode }) {
  if (!attiva) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

/** I messaggi interni, se gli amministratori non li hanno spenti. */
function RottaMessaggi() {
  const attiva = useChatAttiva()
  return (
    <SezioneAttiva attiva={attiva}>
      <Messaggi />
    </SezioneAttiva>
  )
}

/**
 * Registra il cambio pagina nelle statistiche, con l'indirizzo ripulito.
 * Sta qui, dentro al Router, perche' useLocation ha bisogno del contesto.
 */
function TracciaPagine() {
  const location = useLocation()
  useEffect(() => {
    registraPagina(location.pathname)
  }, [location.pathname])
  return null
}

function App() {
  return (
    <>
      <TracciaPagine />
      <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/password-dimenticata" element={<PasswordDimenticata />} />
      <Route path="/reimposta-password" element={<ReimpostaPassword />} />
      {/* Calendario in sola lettura per chi non ha un account: niente login. */}
      <Route path="/calendario/:codice" element={<CalendarioPubblico />} />
      {/* Dove porta il QR della tessera digitale: chi controlla non ha un account. */}
      <Route path="/verifica-tessera/:codice" element={<VerificaTessera />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="turni" element={<Turni />} />
        <Route path="turni/calendario" element={<TurniCalendar />} />
        <Route path="turni/nuovo" element={<TurniCreate />} />
        <Route path="turni/:id" element={<TurnoDetail />} />
        <Route path="soci" element={<Soci />} />
        <Route path="soci/nuovo" element={<SociCreate />} />
        <Route path="soci/:id" element={<SocioDetail />} />
        <Route path="assemblee" element={<Assemblee />} />
        <Route path="assemblee/nuova" element={<AssembleeCreate />} />
        <Route path="assemblee/:id" element={<AssembleaDetail />} />
        <Route path="sondaggi" element={<Sondaggi />} />
        <Route path="sondaggi/nuovo" element={<SondaggiCreate />} />
        <Route path="sondaggi/:id" element={<SondaggioDetail />} />
        <Route path="votazioni" element={<Votazioni />} />
        <Route path="votazioni/nuova" element={<VotazioniCreate />} />
        <Route path="votazioni/:id" element={<VotazioneDetail />} />
        <Route path="consiglio-direttivo" element={<ConsiglioDirettivo />} />
        <Route path="impostazioni" element={<Impostazioni />} />
        <Route path="magazzino" element={<Magazzino />} />
        <Route path="magazzino/nuovo" element={<MagazzinoCreate />} />
        <Route path="avvisi" element={<Avvisi />} />
        <Route path="avvisi/nuovo" element={<AvvisiCreate />} />
        <Route path="avvisi/:id" element={<AvvisoDetail />} />
        <Route path="sportelli" element={<Sportelli />} />
        <Route path="messaggi" element={<RottaMessaggi />} />
        <Route path="richieste" element={<Richieste />} />
        <Route path="ricettario" element={<Ricettario />} />
        <Route path="enti-fittizi" element={<EntiFittizi />} />
        {/* Chi organizza i turni sa quali posti mancano: e' la persona
            naturale per pubblicare l'appello sui social. */}
        <Route
          path="storie-instagram"
          element={
            <RuoloRoute ruoli={['admin', 'gestore_cucine']}>
              <StorieInstagram />
            </RuoloRoute>
          }
        />
      </Route>
      </Routes>
    </>
  )
}

export default App

