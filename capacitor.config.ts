import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cu.cubapos.universal',
  appName: 'Cuba POS Universal',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    minWebViewVersion: 61,
    allowMixedContent: true,
    // Evita comportamientos raros de foco / multitarea en algunos dispositivos
    backgroundColor: '#f1f5f9',
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    // No manejar enlaces externos como si fueran de la app
    App: {
      // sin deep links configurados a propósito
    },
  },
};

export default config;
