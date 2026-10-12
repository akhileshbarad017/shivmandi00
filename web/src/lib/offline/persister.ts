import { get, set, del } from 'idb-keyval';
import type { Persister, PersistedClient } from '@tanstack/query-persist-client-core';

const CACHE_KEY = 'vp.mandi.query-cache';

/** IndexedDB-backed TanStack Query persister (query data + paused mutations). */
export function createIdbPersister(): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      await set(CACHE_KEY, client);
    },
    restoreClient: async () => get<PersistedClient>(CACHE_KEY),
    removeClient: async () => {
      await del(CACHE_KEY);
    },
  };
}
