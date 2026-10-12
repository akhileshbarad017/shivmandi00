import { get, set } from 'idb-keyval';
import { api } from '@/lib/api';

export type OutboxMethod = 'POST' | 'PATCH' | 'DELETE';

export interface OutboxOp {
  id: string;
  method: OutboxMethod;
  path: string;
  body?: unknown;
  idempotencyKey: string;
  label: string;
  createdAt: number;
}

export interface OutboxState {
  queued: number;
  failed: number;
  syncing: boolean;
  lastError: string | null;
}

const STORE_KEY = 'vp.mandi.outbox';

let ops: OutboxOp[] = [];
let failed: OutboxOp[] = [];
let syncing = false;
let lastError: string | null = null;
let loaded = false;

const listeners = new Set<() => void>();
let snapshot: OutboxState = { queued: 0, failed: 0, syncing: false, lastError: null };

function emit(): void {
  snapshot = { queued: ops.length, failed: failed.length, syncing, lastError };
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): OutboxState {
  return snapshot;
}

const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

async function persist(): Promise<void> {
  try {
    await set(STORE_KEY, { ops, failed });
  } catch {
    /* ignore */
  }
}

export async function loadOutbox(): Promise<void> {
  if (loaded) return;
  try {
    const stored = await get<{ ops: OutboxOp[]; failed: OutboxOp[] }>(STORE_KEY);
    if (stored) {
      ops = stored.ops ?? [];
      failed = stored.failed ?? [];
    }
  } catch {
    /* ignore */
  }
  loaded = true;
  emit();
}

export async function enqueue(op: Omit<OutboxOp, 'id' | 'createdAt'>): Promise<void> {
  await loadOutbox();
  ops.push({ ...op, id: newId(), createdAt: Date.now() });
  lastError = null;
  await persist();
  emit();
}

/** Drain queued writes in order. Network failures keep the item; 4xx moves it to failed. */
export async function flushOutbox(): Promise<void> {
  await loadOutbox();
  if (syncing || ops.length === 0) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  syncing = true;
  emit();
  let syncedAny = false;
  while (ops.length > 0) {
    const op = ops[0]!;
    try {
      await api(op.path, { method: op.method, body: op.body, idempotencyKey: op.idempotencyKey });
      ops.shift();
      syncedAny = true;
      await persist();
      emit();
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 401 || error instanceof TypeError) {
        lastError = status === 401 ? 'Sign in to sync' : 'Waiting for connection';
        break;
      }
      // Server rejected the write — keep it aside so it does not block the queue.
      ops.shift();
      failed.push(op);
      lastError = error instanceof Error ? error.message : 'Sync failed';
      await persist();
      emit();
    }
  }
  syncing = false;
  emit();
  if (syncedAny) window.dispatchEvent(new Event('vp:outbox-synced'));
}

export async function retryFailed(): Promise<void> {
  await loadOutbox();
  if (failed.length === 0) return;
  ops.push(...failed);
  failed = [];
  await persist();
  emit();
  await flushOutbox();
}

export async function clearOutbox(): Promise<void> {
  ops = [];
  failed = [];
  lastError = null;
  await persist();
  emit();
}

/**
 * Writes immediately when online; queues into the outbox when offline or when
 * the network drops mid-request. Callers get `{ queued: true }` in that case.
 */
export async function offlineWrite<T>(op: {
  method: OutboxMethod;
  path: string;
  body?: unknown;
  label: string;
}): Promise<{ queued: boolean; data?: T }> {
  const idempotencyKey = newId();
  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      const data = await api<T>(op.path, { method: op.method, body: op.body, idempotencyKey });
      return { queued: false, data };
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
    }
  }
  await enqueue({ ...op, idempotencyKey });
  return { queued: true };
}
