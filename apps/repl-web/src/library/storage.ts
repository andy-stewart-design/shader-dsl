import { validateSnapshot, type SketchSnapshot } from "./codec.ts";

export interface SketchRecord extends SketchSnapshot {
  id: string;
  savedAt?: number;
}

const DB_NAME = "shdr-sketch-library";
const STORE = "sketches";

// Open on demand: importing this module during SSR never accesses browser APIs.
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, 1);
    let blocked = false;
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to open library"));
    request.onblocked = () => {
      blocked = true;
      reject(new Error("Opening library was blocked"));
    };
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else resolve(request.result);
    };
  });
}

async function transaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore, set: (value: T) => void) => void,
): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      let result: T;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () =>
        reject(tx.error ?? new Error("Library transaction aborted"));
      tx.onerror = () => {
        /* onabort reports the final transaction failure */
      };
      try {
        run(tx.objectStore(STORE), (value) => {
          result = value;
        });
      } catch (error) {
        tx.abort();
        reject(error);
      }
    });
  } finally {
    db.close();
  }
}

export const sketchStorage = {
  list(): Promise<SketchRecord[]> {
    return transaction("readonly", (store, set) => {
      const request = store.getAll();
      request.onsuccess = () =>
        set(
          request.result.sort(
            (a: SketchRecord, b: SketchRecord) =>
              (b.savedAt ?? -Infinity) - (a.savedAt ?? -Infinity),
          ),
        );
    });
  },
  read(id: string): Promise<SketchRecord | undefined> {
    return transaction("readonly", (store, set) => {
      const request = store.get(id);
      request.onsuccess = () => set(request.result);
    });
  },
  create(snapshot: SketchSnapshot): Promise<SketchRecord> {
    const record: SketchRecord = {
      ...validateSnapshot(snapshot),
      id: crypto.randomUUID(),
      savedAt: Date.now(),
    };
    return transaction("readwrite", (store, set) => {
      store.add(record);
      set(record);
    });
  },
  update(
    id: string,
    snapshot: SketchSnapshot,
  ): Promise<SketchRecord | undefined> {
    const record: SketchRecord = {
      ...validateSnapshot(snapshot),
      id,
      savedAt: Date.now(),
    };
    return transaction("readwrite", (store, set) => {
      const request = store.get(id);
      request.onsuccess = () => {
        if (request.result === undefined) {
          set(undefined);
          return;
        }
        store.put(record);
        set(record);
      };
    });
  },
  rename(id: string, name: string): Promise<SketchRecord | undefined> {
    if (typeof name !== "string" || !name.trim())
      return Promise.reject(new Error("Name must not be blank"));
    return transaction("readwrite", (store, set) => {
      const request = store.get(id);
      request.onsuccess = () => {
        if (request.result === undefined) {
          set(undefined);
          return;
        }
        const record: SketchRecord = { ...request.result, name };
        store.put(record);
        set(record);
      };
    });
  },
  delete(id: string): Promise<boolean> {
    return transaction("readwrite", (store, set) => {
      const request = store.getKey(id);
      request.onsuccess = () => {
        if (request.result === undefined) {
          set(false);
          return;
        }
        store.delete(id);
        set(true);
      };
    });
  },
};
