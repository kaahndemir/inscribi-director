import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';

export function Mark({ small = false }: { small?: boolean }) {
  return (
    <span className={`mark ${small ? 'small' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 32 32"><path d="M6 18 13 6h14L19 26H6Z" /></svg>
    </span>
  );
}

export function ArenaShell({ view, children }: { view: 'admin' | 'stage'; children: ReactNode }) {
  return (
    <div className={`operator-shell ${view}-shell`}>
      <header className="navbar">
        <a className="brand" href="/" aria-label="Inscribi ana sayfa">
          <Mark /><span>inscribi <b>/</b> <strong>monad</strong></span>
        </a>
        <div className="nav-label"><span className="nav-live" />{view === 'admin' ? 'Yönetim paneli' : 'Canlı sahne'}</div>
        <nav className="operator-nav" aria-label="Ekranlar">
          <a href="/">Oylama <ArrowUpRight size={14} /></a>
          <a className="wallet-button" href={view === 'admin' ? '/stage' : '/admin'} target={view === 'admin' ? '_blank' : undefined} rel={view === 'admin' ? 'noopener' : undefined}>
            {view === 'admin' ? 'Sahneyi aç' : 'Yönetim'}<ArrowUpRight size={16} />
          </a>
        </nav>
      </header>
      {children}
      <footer className="operator-footer">
        <span><Mark small /> inscribi / monad</span>
        <span>Monad üzerinde canlı oylama.</span>
        <span className="footer-mode">{view === 'admin' ? 'YÖNETİM' : 'SAHNE'} <i /></span>
      </footer>
    </div>
  );
}
