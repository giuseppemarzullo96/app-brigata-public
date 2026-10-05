import { X } from 'lucide-react'
import { ReactNode, useEffect } from 'react'
import { useAreaVisibile, useBloccaScorrimento } from '../hooks/useAreaVisibile'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Una riga sotto il titolo: di cosa si sta parlando. */
  sottotitolo?: ReactNode
  /** Le azioni: restano ferme in fondo mentre il contenuto scorre. */
  piede?: ReactNode
}

const Modal = ({ isOpen, onClose, title, children, size = 'md', sottotitolo, piede }: ModalProps) => {
  const area = useAreaVisibile(isOpen)

  // Con la finestra aperta la pagina sotto non deve scorrere insieme al dito.
  useBloccaScorrimento(isOpen)
  useEffect(() => {
    if (!isOpen) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const sizeClasses = {
    sm: 'sm:max-w-md',
    md: 'sm:max-w-lg',
    lg: 'sm:max-w-2xl',
    xl: 'sm:max-w-4xl',
  }

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 flex h-[100dvh] items-end justify-center sm:items-center sm:p-6"
      style={area ? { height: area.altezza, top: area.alto } : undefined}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-gray-900/50" onClick={onClose} />

      {/* Sul telefono sale dal basso, a tutta larghezza; su schermo largo sta al centro. */}
      <div
        className={`relative flex max-h-[calc(100%-1.5rem)] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-xl sm:max-h-full sm:rounded-2xl ${sizeClasses[size]}`}
      >
        <div className="flex flex-none items-start gap-2 border-b border-gray-200 py-2 pl-5 pr-2 sm:pl-6">
          <div className="min-w-0 flex-1 py-2.5">
            <h3 className="text-lg font-bold leading-snug text-gray-900">{title}</h3>
            {sottotitolo && <p className="mt-0.5 text-sm text-gray-500">{sottotitolo}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-gray-100"
            aria-label="Chiudi"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4 sm:px-6"
          style={{ paddingBottom: piede ? '1rem' : 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          {children}
        </div>

        {piede && (
          <div
            className="flex-none border-t border-gray-200 bg-white px-5 pt-3 sm:px-6 sm:pb-4"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            {piede}
          </div>
        )}
      </div>
    </div>
  )
}

export default Modal
