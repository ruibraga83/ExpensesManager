/* ============================================
   EXPENSETRACKER — IndexedDB Layer  v2
   ============================================ */

const DB = (() => {
  const DB_NAME = 'ExpenseTracker';
  const DB_VERSION = 2;
  let _db = null;

  function open() {
    return new Promise((resolve, reject) => {
      if (_db) return resolve(_db);
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db  = e.target.result;
        const tx  = e.target.transaction;
        const old = e.oldVersion;

        /* ── receipts store (created fresh or upgraded) ── */
        if (old < 1) {
          const rs = db.createObjectStore('receipts', { keyPath: 'id', autoIncrement: true });
          rs.createIndex('date',      'date');
          rs.createIndex('category',  'category');
          rs.createIndex('status',    'status');
          rs.createIndex('createdAt', 'createdAt');
          rs.createIndex('userId',    'userId');
        } else if (!tx.objectStore('receipts').indexNames.contains('userId')) {
          /* upgrading from v1 — add userId index to existing store */
          tx.objectStore('receipts').createIndex('userId', 'userId');
        }

        /* ── users store (v2 addition) ── */
        if (old < 2) {
          const us = db.createObjectStore('users', { keyPath: 'id', autoIncrement: true });
          us.createIndex('email', 'email');
          us.createIndex('role',  'role');
        }
      };

      req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  /* ── helpers ── */
  function _store(name, mode = 'readonly') {
    return _db.transaction(name, mode).objectStore(name);
  }
  function _wrap(req) {
    return new Promise((res, rej) => {
      req.onsuccess = () => res(req.result);
      req.onerror   = () => rej(req.error);
    });
  }

  /* ════════════════════════════════
     RECEIPTS
     ════════════════════════════════ */
  function getAll() {
    return _wrap(_store('receipts').getAll())
      .then(rows => rows.sort((a, b) => new Date(b.date) - new Date(a.date)));
  }

  function getAllByUser(userId) {
    return getAll().then(rows => rows.filter(r => r.userId === userId));
  }

  function getById(id) { return _wrap(_store('receipts').get(id)); }

  function add(receipt) {
    receipt.createdAt = new Date().toISOString();
    return _wrap(_store('receipts', 'readwrite').add(receipt));
  }

  function update(receipt) {
    receipt.updatedAt = new Date().toISOString();
    return _wrap(_store('receipts', 'readwrite').put(receipt));
  }

  function remove(id)  { return _wrap(_store('receipts', 'readwrite').delete(id)); }
  function clear()     { return _wrap(_store('receipts', 'readwrite').clear()); }

  /* ════════════════════════════════
     USERS
     ════════════════════════════════ */
  function getAllUsers() {
    return _wrap(_store('users').getAll())
      .then(rows => rows.sort((a, b) => a.id - b.id));
  }

  function getUserById(id)   { return _wrap(_store('users').get(id)); }

  function addUser(user) {
    user.createdAt = new Date().toISOString();
    return _wrap(_store('users', 'readwrite').add(user));
  }

  function updateUser(user) {
    user.updatedAt = new Date().toISOString();
    return _wrap(_store('users', 'readwrite').put(user));
  }

  function removeUser(id) { return _wrap(_store('users', 'readwrite').delete(id)); }

  return {
    open,
    getAll, getAllByUser, getById, add, update, remove, clear,
    getAllUsers, getUserById, addUser, updateUser, removeUser
  };
})();
