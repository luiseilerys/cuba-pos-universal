import { useState, useEffect } from 'preact/hooks';
import { Router, Route } from 'preact-router';
import { OnboardingWizard } from './modules/onboarding/OnboardingWizard';
import { POS } from './modules/pos/POS';
import { CashCounter } from './modules/cash/CashCounter';
import { Dashboard } from './modules/dashboard/Dashboard';
import { Settings } from './modules/settings/Settings';
import { Inventory } from './modules/inventory/Inventory';
import { Stats } from './modules/stats/Stats';
import { NetworkStatus } from './components/NetworkStatus';
import { ToastHost } from './components/ToastHost';
import { NavIcon } from './components/Icon';
import { isOnboardingCompleted } from './lib/storage';
import { startAutoSync } from './offline/syncEngine';
import {
  writeBackupToDevice, detectEmptyDbWithBackup, restoreFromPayload,
  scheduleAutoBackup, BackupPayload,
} from './lib/backup';
import { showToast } from './lib/toast';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

function navClass(path: string, current: string) {
  if (path === '/') return current === '/' ? 'active' : '';
  return current.indexOf(path) === 0 ? 'active' : '';
}

export function App() {
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<BackupPayload | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [route, setRoute] = useState('/');

  useEffect(() => {
    (async () => {
      try {
        const done = await isOnboardingCompleted();
        setOnboarded(done);
        if (done) startAutoSync();

        const backup = await detectEmptyDbWithBackup();
        if (backup && (backup.products?.length > 0 || backup.sales?.length > 0)) {
          setPendingRestore(backup);
        } else {
          scheduleAutoBackup();
        }
      } catch (e) {
        console.error(e);
      } finally {
        setReady(true);
      }
    })();

    let handle: { remove: () => void } | undefined;
    if (Capacitor.isNativePlatform()) {
      CapApp.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) {
          writeBackupToDevice().catch(() => {});
        }
      }).then(h => { handle = h; });
    }

    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        writeBackupToDevice().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      handle?.remove();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const doRestore = async () => {
    if (!pendingRestore || restoring) return;
    setRestoring(true);
    try {
      await restoreFromPayload(pendingRestore);
      setPendingRestore(null);
      const done = await isOnboardingCompleted();
      setOnboarded(done);
      if (done) startAutoSync();
      showToast('Datos restaurados del respaldo', 'ok');
      scheduleAutoBackup();
    } catch (e) {
      console.error(e);
      showToast('No se pudo restaurar el respaldo', 'error');
    } finally {
      setRestoring(false);
    }
  };

  if (!ready) {
    return (
      <div class="loading-screen">
        <div class="spinner"></div>
        <p>Cargando Cuba POS…</p>
      </div>
    );
  }

  return (
    <>
      <ToastHost />
      {pendingRestore && (
        <div class="modal-backdrop" style={{ zIndex: 300 }}>
          <div class="modal-sheet">
            <h2 style={{ fontSize: 18, marginBottom: 8 }}>Respaldo encontrado</h2>
            <p class="muted" style={{ marginBottom: 12 }}>
              Se encontró un respaldo en el dispositivo
              ({pendingRestore.products?.length || 0} productos, {pendingRestore.sales?.length || 0} ventas).
              ¿Quieres restaurarlo?
            </p>
            <p class="muted" style={{ marginBottom: 12 }}>
              Fecha: {new Date(pendingRestore.exportedAt).toLocaleString('es-CU')}
            </p>
            <button type="button" class="btn btn-block" disabled={restoring} onClick={doRestore}>
              {restoring ? 'Restaurando…' : 'Restaurar datos'}
            </button>
            <button
              type="button"
              class="btn btn-secondary btn-block"
              style={{ marginTop: 8 }}
              disabled={restoring}
              onClick={() => setPendingRestore(null)}
            >
              Empezar de cero
            </button>
          </div>
        </div>
      )}

      {!onboarded ? (
        <OnboardingWizard
          onComplete={() => {
            setOnboarded(true);
            startAutoSync();
            scheduleAutoBackup();
          }}
        />
      ) : (
        <div class="app-shell">
          <NetworkStatus />
          <Router onChange={e => setRoute(e.url || '/')}>
            <Route path="/" component={Dashboard} />
            <Route path="/pos" component={POS} />
            <Route path="/inventory" component={Inventory} />
            <Route path="/stats" component={Stats} />
            <Route path="/cash" component={CashCounter} />
            <Route path="/settings" component={Settings} />
          </Router>
          <nav class="bottom-nav">
            <a href="/" class={navClass('/', route)}><NavIcon name="home" label="Inicio" /></a>
            <a href="/pos" class={navClass('/pos', route)}><NavIcon name="cart" label="POS" /></a>
            <a href="/inventory" class={navClass('/inventory', route)}><NavIcon name="box" label="Inventario" /></a>
            <a href="/stats" class={navClass('/stats', route)}><NavIcon name="chart" label="Info" /></a>
            <a href="/cash" class={navClass('/cash', route)}><NavIcon name="cash" label="Arqueo" /></a>
            <a href="/settings" class={navClass('/settings', route)}><NavIcon name="settings" label="Ajustes" /></a>
          </nav>
        </div>
      )}
    </>
  );
}
