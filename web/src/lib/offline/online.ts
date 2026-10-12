import { onlineManager } from '@tanstack/react-query';

/** Keep TanStack's online state in sync with the browser network status. */
export function setupOnlineManager(): void {
  onlineManager.setEventListener((setOnline) => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  });
}
