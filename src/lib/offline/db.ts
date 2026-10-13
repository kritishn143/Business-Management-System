/**
 * A small typed wrapper over IndexedDB. Deliberately not a library: the app
 * needs two stores and six operations, and the browser already provides the
 * engine (SPEC §87).
 */

const DB_NAME = "bms";
const DB_VERSION = 1;

/** Queued mutations waiting to reach the server. Keyed by idempotency key. */
export const OUTBOX = "outbox";
/** Cached server data for reading offline. Keyed by an arbitrary string. */
export const CACHE = "cache";

export function isOfflineCapable(): boolean {
  return typeof indexedDB !== "undefined";
}

let open: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (open) return open;

  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OUTBOX)) {
        db.createObjectStore(OUTBOX, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(CACHE)) {
        db.createObjectStore(CACHE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB unavailable"));
    // Private browsing and some lockdown modes reject the open outright.
    request.onblocked = () => reject(new Error("IndexedDB is blocked"));
  }).catch((error: unknown) => {
    // Never cache a failure: a later attempt may succeed.
    open = null;
    throw error;
  });

  open = opening;
  return opening;
}

function run<T>(
  store: string,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const request = work(tx.objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Write failed"));
        tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
      }),
  );
}

export function put<T>(store: string, value: T, key?: IDBValidKey): Promise<void> {
  return run(store, "readwrite", (s) =>
    key === undefined ? s.put(value) : s.put(value, key),
  ).then(() => undefined);
}

export function get<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  return run<T | undefined>(store, "readonly", (s) => s.get(key));
}

export function getAll<T>(store: string): Promise<T[]> {
  return run<T[]>(store, "readonly", (s) => s.getAll());
}

export function remove(store: string, key: IDBValidKey): Promise<void> {
  return run(store, "readwrite", (s) => s.delete(key)).then(() => undefined);
}

export function clear(store: string): Promise<void> {
  return run(store, "readwrite", (s) => s.clear()).then(() => undefined);
}
