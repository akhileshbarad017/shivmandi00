import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { LazyMotion, MotionConfig } from 'motion/react';
import { ToastProvider } from './components/ui/Toast';
import { RegisterSW } from './components/pwa/RegisterSW';
import { SyncStatus } from './components/pwa/SyncStatus';
import { createIdbPersister } from './lib/offline/persister';
import { setupOnlineManager } from './lib/offline/online';
import { flushOutbox, loadOutbox } from './lib/offline/outbox';
import App from './app/App';
import './styles/index.css';

const WEEK = 7 * 24 * 60 * 60 * 1000;

setupOnlineManager();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: WEEK,
      refetchOnWindowFocus: false,
      retry: 1,
      networkMode: 'offlineFirst',
    },
    mutations: {
      networkMode: 'offlineFirst',
      retry: 2,
    },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

// Offline outbox: restore, retry on reconnect, refresh data after a sync.
void loadOutbox().then(() => flushOutbox());
window.addEventListener('online', () => void flushOutbox());
window.addEventListener('offline', () => void loadOutbox());
window.addEventListener('vp:outbox-synced', () => void queryClient.invalidateQueries());

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <LazyMotion features={() => import('motion/react').then((mod) => mod.domMax)} strict>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister: createIdbPersister(), maxAge: WEEK, buster: __APP_BUILD__ }}
          onSuccess={() => {
            void queryClient.resumePausedMutations();
          }}
        >
          <ToastProvider>
            <RegisterSW />
            <SyncStatus />
            <App />
          </ToastProvider>
        </PersistQueryClientProvider>
      </MotionConfig>
    </LazyMotion>
  </React.StrictMode>,
);
