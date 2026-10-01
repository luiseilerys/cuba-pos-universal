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
import { isOnboardingCompleted } from './lib/storage';
import { startAutoSync } from './offline/syncEngine';

export function App() {
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(false);

  useEffect(() => {
    (async () => {
      const done = await isOnboardingCompleted();
      setOnboarded(done);
      setReady(true);
      if (done) startAutoSync();
    })();
  }, []);

  if (!ready) {
    return (
      <div class="loading-screen">
        <div class="spinner"></div>
        <p>Cargando Cuba POS…</p>
      </div>
    );
  }

  if (!onboarded) {
    return (
      <>
        <ToastHost />
        <OnboardingWizard
          onComplete={() => {
            setOnboarded(true);
            startAutoSync();
          }}
        />
      </>
    );
  }

  return (
    <div class="app-shell">
      <ToastHost />
      <NetworkStatus />
      <Router>
        <Route path="/" component={Dashboard} />
        <Route path="/pos" component={POS} />
        <Route path="/inventory" component={Inventory} />
        <Route path="/stats" component={Stats} />
        <Route path="/cash" component={CashCounter} />
        <Route path="/settings" component={Settings} />
      </Router>
      <nav class="bottom-nav">
        <a href="/">Inicio</a>
        <a href="/pos">POS</a>
        <a href="/inventory">Inventario</a>
        <a href="/stats">Info</a>
        <a href="/cash">Arqueo</a>
        <a href="/settings">Ajustes</a>
      </nav>
    </div>
  );
}
