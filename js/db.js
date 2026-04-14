/* ============================================
   EXPENSEFLOW — IndexedDB Layer
   ============================================ */

const DB = (() => {
  const DB_NAME = 'ExpenseFlow';
  const DB_VERSION = 1;
  let _db = null;

  function open() {
    return new Promise((resolve, reject) => {
      if (_db) return resolve(_db);

      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('receipts')) {
          const store = db.createObjectStore('receipts', { keyPath: 'id', autoIncrement: true });
          store.createIndex('date', 'date', { unique: false });
          store.createIndex('category', 'category', { unique: false });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };

      req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function tx(mode = 'readonly') {
    return _db.transaction('receipts', mode).objectStore('receipts');
  }

  function getAll() {
    return new Promise((resolve, reject) => {
      const req = tx().getAll();
      req.onsuccess = () => resolve(req.result.sort((a, b) => new Date(b.date) - new Date(a.date)));
      req.onerror = () => reject(req.error);
    });
  }

  function getById(id) {
    return new Promise((resolve, reject) => {
      const req = tx().get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function add(receipt) {
    return new Promise((resolve, reject) => {
      receipt.createdAt = new Date().toISOString();
      const req = tx('readwrite').add(receipt);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function update(receipt) {
    return new Promise((resolve, reject) => {
      receipt.updatedAt = new Date().toISOString();
      const req = tx('readwrite').put(receipt);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function remove(id) {
    return new Promise((resolve, reject) => {
      const req = tx('readwrite').delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  function clear() {
    return new Promise((resolve, reject) => {
      const req = tx('readwrite').clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  return { open, getAll, getById, add, update, remove, clear };
})();
