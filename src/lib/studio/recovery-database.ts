export const RECOVERY_STORE = 'crash';
const DATABASE_NAME = 'openlightfx-studio';

function open(version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // Inspect the existing version first: older deployments may have created this
    // database without our store, or may already have a higher schema version.
    const request = indexedDB.open(DATABASE_NAME, version);
    let failed = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RECOVERY_STORE)) db.createObjectStore(RECOVERY_STORE);
    };
    request.onsuccess = () => {
      const db = request.result;
      if (failed) {
        // A blocked request can still finish after another tab closes. Do not
        // leave an orphan connection that blocks a subsequent retry.
        db.close();
        return;
      }
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      failed = true;
      reject(new Error('IndexedDB open was blocked; close other Studio tabs and retry'));
    };
  });
}

/** Repair missing recovery storage without deleting existing stores or records. */
export async function openRecoveryDatabase(): Promise<IDBDatabase> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const db = await open();
    if (db.objectStoreNames.contains(RECOVERY_STORE)) return db;
    const nextVersion = db.version + 1;
    db.close();
    try {
      const upgraded = await open(nextVersion);
      if (upgraded.objectStoreNames.contains(RECOVERY_STORE)) return upgraded;
      upgraded.close();
    } catch (error) {
      // Another tab may have upgraded between inspection and opening. Inspect
      // its resulting schema instead of resetting any recovery data.
      if (!(error instanceof DOMException) || error.name !== 'VersionError') throw error;
    }
  }
  throw new Error('IndexedDB recovery store could not be created');
}
