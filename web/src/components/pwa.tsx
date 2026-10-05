import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';

export function UpdatePrompt() {
  const { needRefresh, updateServiceWorker } = useRegisterSW();
  if (!needRefresh[0]) return null;
  return (
    <div className="safe-top fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-3 bg-accent px-4 py-2 text-sm font-medium text-[rgb(var(--accent-contrast-rgb,255_255_255))]">
      <span>New version available</span>
      <button onClick={() => updateServiceWorker(true)} className="rounded-lg bg-white/20 px-3 py-1">
        Update
      </button>
    </div>
  );
}

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
const DISMISS_KEY = 'radbit:auto:install-dismissed-until';
function dismissalActive() {
  try { return Number(localStorage.getItem(DISMISS_KEY)) > Date.now(); }
  catch { return false; }
}
function installedMode() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
export function InstallBanner() {
  const { pathname } = useLocation();
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [dismissed, setDismissed] = useState(dismissalActive);
  const [installed, setInstalled] = useState(installedMode);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const isIOS = (/iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) &&
    !/crios|fxios|edgios/i.test(navigator.userAgent);
  useEffect(() => {
    const capture = (event: Event) => { event.preventDefault(); setDeferred(event as InstallEvent); };
    const complete = () => { setInstalled(true); setDeferred(null); };
    const mode = window.matchMedia('(display-mode: standalone)');
    const modeChanged = () => setInstalled(installedMode());
    window.addEventListener('beforeinstallprompt', capture);
    window.addEventListener('appinstalled', complete);
    mode.addEventListener('change', modeChanged);
    return () => {
      window.removeEventListener('beforeinstallprompt', capture);
      window.removeEventListener('appinstalled', complete);
      mode.removeEventListener('change', modeChanged);
    };
  }, []);
  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now() + 7 * 86400000)); } catch { /* Session state still hides it. */ }
    setDismissed(true);
  }
  async function install() {
    if (!deferred || busy) return;
    setBusy(true); setMessage('');
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      setDeferred(null);
      if (choice.outcome === 'accepted') setInstalled(true);
      else dismiss();
    } catch {
      setMessage('Installation couldn’t open. You can also install from your browser menu.');
      setDeferred(null);
    } finally { setBusy(false); }
  }
  // In normal document flow: never covers stock, forms or bottom navigation.
  const eligiblePage = pathname === '/' || /^\/showroom\/[^/]+$/.test(pathname) || pathname === '/app/account';
  if (!eligiblePage || installed || dismissed || (!deferred && !isIOS && !message)) return null;
  return <aside className="install-panel" aria-label="Install Radbit Auto">
    <img src="/icons/radbit-auto-v2.svg" width="40" height="40" alt="" aria-hidden="true" />
    <div className="install-panel-copy"><h2>Radbit Auto, a tap away</h2>
      <p>{isIOS ? 'In Safari, tap Share, then Add to Home Screen.' : 'Add to your home screen for easy access. You can keep using the website.'}</p>
      {message && <p role="status">{message}</p>}
    </div>
    <div className="install-panel-actions">
      {deferred && <button type="button" className="install-panel-primary" onClick={install} disabled={busy}>{busy ? 'Opening…' : 'Install app'}</button>}
      <button type="button" className="install-panel-dismiss" onClick={dismiss}>Not now</button>
    </div>
  </aside>;
}
