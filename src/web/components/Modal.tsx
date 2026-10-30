import type { ReactNode } from 'react';

interface Props {
  title: string;
  children: ReactNode;
  onClose: () => void;
  /** Klasse für Sonderdarstellungen, z. B. "danger" */
  variant?: string;
}

export function Modal({ title, children, onClose, variant }: Props) {
  return (
    <div className={`modal ${variant ?? ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-card">
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Schließen">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
