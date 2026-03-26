const DEMO_FILE_DB = 'yuque-demo-files';
const DEMO_FILE_STORE = 'file_blobs';
const DEMO_FILE_DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDemoFileDb(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this environment.'));
      return;
    }

    const request = indexedDB.open(DEMO_FILE_DB, DEMO_FILE_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DEMO_FILE_STORE)) {
        db.createObjectStore(DEMO_FILE_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open demo file database.'));
  });

  return dbPromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

export const demoFileStore = {
  async putBlob(key: string, blob: Blob): Promise<void> {
    const db = await openDemoFileDb();
    const tx = db.transaction(DEMO_FILE_STORE, 'readwrite');
    await requestToPromise(tx.objectStore(DEMO_FILE_STORE).put(blob, key));
  },

  async getBlob(key: string): Promise<Blob | null> {
    const db = await openDemoFileDb();
    const tx = db.transaction(DEMO_FILE_STORE, 'readonly');
    const result = await requestToPromise(tx.objectStore(DEMO_FILE_STORE).get(key));
    return result instanceof Blob ? result : null;
  },

  async deleteBlob(key: string): Promise<void> {
    const db = await openDemoFileDb();
    const tx = db.transaction(DEMO_FILE_STORE, 'readwrite');
    await requestToPromise(tx.objectStore(DEMO_FILE_STORE).delete(key));
  },
};
