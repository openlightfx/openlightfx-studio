export interface AutosaveRecord {
  version: 1;
  savedAt: number;
  payload: unknown;
}

const DB = 'openlightfx-studio';
const STORE = 'kv';
const KEY = 'current';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
  });
}

export async function saveAutosave(payload: unknown): Promise<void> {
  const record: AutosaveRecord = { version: 1, savedAt: Date.now(), payload };
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('autosave failed'));
    });
    db.close();
  } catch {
    try {
      localStorage.setItem('openlightfx-studio-autosave', JSON.stringify(record));
    } catch {
      /* quota */
    }
  }
}

export async function loadAutosave(): Promise<AutosaveRecord | null> {
  try {
    const db = await openDb();
    const record = await new Promise<AutosaveRecord | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as AutosaveRecord | undefined) ?? null);
      req.onerror = () => reject(req.error ?? new Error('autosave read failed'));
    });
    db.close();
    if (record?.version === 1) return record;
  } catch {
    /* fall through */
  }
  try {
    const raw = localStorage.getItem('openlightfx-studio-autosave');
    if (!raw) return null;
    const record = JSON.parse(raw) as AutosaveRecord;
    return record?.version === 1 ? record : null;
  } catch {
    return null;
  }
}

export async function clearAutosave(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('clear failed'));
    });
    db.close();
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem('openlightfx-studio-autosave');
  } catch {
    /* ignore */
  }
}
