import toast from 'react-hot-toast'
import { api } from './authService'

/**
 * Scarica un file da un endpoint protetto. Un semplice link non porta il token
 * di accesso: per questo il file passa da una richiesta autenticata.
 * Il nome lo decide il server (Content-Disposition), altrimenti `nomeFile`.
 */
export async function scaricaFile(percorso: string, nomeFile: string) {
  try {
    const res = await api.get(percorso, { responseType: 'blob' })
    const disposizione: string = res.headers['content-disposition'] || ''
    const dalServer = /filename="?([^";]+)"?/i.exec(disposizione)?.[1]
    const url = window.URL.createObjectURL(new Blob([res.data]))
    const a = document.createElement('a')
    a.href = url
    a.download = dalServer || nomeFile
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  } catch {
    toast.error('Errore durante il download')
  }
}
