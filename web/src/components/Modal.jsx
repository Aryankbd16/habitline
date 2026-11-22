import { X } from 'lucide-react'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export default function Modal({ open, onClose, title, children, maxWidth = 'max-w-lg' }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/65 backdrop-blur-md transition-opacity duration-200 animate-rise"
        onClick={onClose}
        style={{ animationDuration: '0.18s' }}
      />

      {/* Modal Dialog Box */}
      <div
        className={`relative w-full ${maxWidth} bg-[var(--bg-surface)] text-[var(--text-main)] rounded-t-3xl sm:rounded-3xl border border-[var(--border-color)] max-h-[92vh] overflow-y-auto shadow-2xl animate-rise z-10`}
        style={{
          boxShadow: '0 20px 50px -10px rgba(0,0,0,0.5), inset 0 1px 0 0 rgba(255,255,255,0.08)',
        }}
      >
        {/* Sticky Header */}
        <div className="sticky top-0 bg-[var(--bg-surface)]/95 backdrop-blur-md flex items-center justify-between px-6 py-4.5 border-b border-[var(--border-color)] z-10">
          <h2 className="font-extrabold text-lg text-[var(--text-main)] tracking-tight">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-main)] transition cursor-pointer border border-transparent hover:border-[var(--border-color)]"
          >
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6">{children}</div>
      </div>
    </div>,
    document.body
  )
}
