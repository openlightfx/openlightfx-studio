import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openRecoveryDatabase } from '../../src/lib/studio/recovery-database';

function database(version: number, stores: string[]) {
  const names = new Set(stores);
  return {
    version,
    objectStoreNames: { contains: (name: string) => names.has(name) },
    createObjectStore: vi.fn((name: string) => names.add(name)),
    close: vi.fn(),
    onversionchange: null,
  } as unknown as IDBDatabase;
}

function success(request: IDBOpenDBRequest, db: IDBDatabase, upgrade = false) {
  Object.defineProperty(request, 'result', { value: db });
  if (upgrade) request.onupgradeneeded?.(new Event('upgradeneeded') as IDBVersionChangeEvent);
  request.onsuccess?.(new Event('success'));
}

async function nextRequest() {
  // Let the inspected database resolve and the migration request get queued.
  await Promise.resolve();
  await Promise.resolve();
}

describe('recovery database schema compatibility', () => {
  let requests: IDBOpenDBRequest[];
  let open: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    requests = [];
    open = vi.fn(() => {
      const request = {} as IDBOpenDBRequest;
      requests.push(request);
      return request;
    });
    vi.stubGlobal('indexedDB', { open });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('creates recovery storage in a fresh database', async () => {
    const pending = openRecoveryDatabase();
    const db = database(1, []);
    success(requests[0], db, true);
    expect(await pending).toBe(db);
    expect(db.createObjectStore).toHaveBeenCalledWith('crash');
    expect(open).toHaveBeenCalledWith('openlightfx-studio', undefined);
  });

  for (const version of [1, 7]) {
    it(`repairs missing storage at version ${version} without deleting existing stores`, async () => {
      const pending = openRecoveryDatabase();
      const original = database(version, ['legacy']);
      success(requests[0], original);
      await nextRequest();
      expect(original.close).toHaveBeenCalledOnce();
      expect(open).toHaveBeenLastCalledWith('openlightfx-studio', version + 1);
      const repaired = database(version + 1, ['legacy']);
      success(requests[1], repaired, true);
      expect(await pending).toBe(repaired);
      expect(repaired.objectStoreNames.contains('legacy')).toBe(true);
      expect(repaired.objectStoreNames.contains('crash')).toBe(true);
    });
  }

  it('uses compatible higher-version databases without migration', async () => {
    const pending = openRecoveryDatabase();
    const db = database(7, ['legacy', 'crash']);
    success(requests[0], db);
    expect(await pending).toBe(db);
    expect(open).toHaveBeenCalledOnce();
    expect(db.createObjectStore).not.toHaveBeenCalled();
    db.onversionchange?.(new Event('versionchange') as IDBVersionChangeEvent);
    expect(db.close).toHaveBeenCalledOnce();
  });

  it('closes a blocked request if it later succeeds, allowing subsequent retries', async () => {
    const pending = openRecoveryDatabase();
    const rejected = expect(pending).rejects.toThrow('close other Studio tabs');
    requests[0].onblocked?.(new Event('blocked') as IDBVersionChangeEvent);
    await rejected;
    const db = database(1, ['crash']);
    success(requests[0], db);
    expect(db.close).toHaveBeenCalledOnce();
  });

  it('re-inspects the schema when another tab wins the version upgrade race', async () => {
    const pending = openRecoveryDatabase();
    success(requests[0], database(1, ['legacy']));
    await nextRequest();
    Object.defineProperty(requests[1], 'error', {
      value: new DOMException('A newer version already exists', 'VersionError'),
    });
    requests[1].onerror?.(new Event('error'));
    await nextRequest();
    const db = database(3, ['legacy', 'crash']);
    success(requests[2], db);
    expect(await pending).toBe(db);
    expect(open).toHaveBeenLastCalledWith('openlightfx-studio', undefined);
  });

  it('propagates storage errors instead of discarding recovery data', async () => {
    const pending = openRecoveryDatabase();
    const error = new DOMException('Storage denied', 'SecurityError');
    Object.defineProperty(requests[0], 'error', { value: error });
    requests[0].onerror?.(new Event('error'));
    await expect(pending).rejects.toBe(error);
    expect(open).toHaveBeenCalledOnce();
  });
});
