import type { CompleteTrainingRequest, StartTrainingRequest } from '../../contracts/training';

export type PendingTrainingRecord = {
  localId: string;
  start: StartTrainingRequest;
  complete: CompleteTrainingRequest | null;
};

const DATABASE = 'songxian-training-v1';
const STORE = 'pending-records';

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
const transactionToPromise = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB write aborted'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB write failed'));
  });

export class IndexedDbTrainingQueue {
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) {
          request.result.createObjectStore(STORE, { keyPath: 'localId' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB unavailable'));
    });
  }

  async put(record: PendingTrainingRecord): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(STORE, 'readwrite');
    try {
      await Promise.all([
        requestToPromise(transaction.objectStore(STORE).put(record)),
        transactionToPromise(transaction),
      ]);
    } finally {
      database.close();
    }
  }

  async list(): Promise<PendingTrainingRecord[]> {
    const database = await this.open();
    const transaction = database.transaction(STORE, 'readonly');
    const records = await requestToPromise(transaction.objectStore(STORE).getAll());
    database.close();
    return records as PendingTrainingRecord[];
  }

  async remove(localId: string): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(STORE, 'readwrite');
    try {
      await Promise.all([
        requestToPromise(transaction.objectStore(STORE).delete(localId)),
        transactionToPromise(transaction),
      ]);
    } finally {
      database.close();
    }
  }
}
