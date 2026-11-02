/* db.js: IndexedDB storage. Every change is written at once (no Save button).
   If IndexedDB is not available, a memory fallback keeps the app usable and says so. */
(function (root) {
  'use strict';
  var RT = root.RT = root.RT || {};

  var STORES = {
    settings: { keyPath: 'key' }, habits: { keyPath: 'id' }, schedule: { keyPath: 'dayType' },
    days: { keyPath: 'date' }, goals: { keyPath: 'key' }, skillCycles: { keyPath: 'id' },
    safety: { keyPath: 'id', autoIncrement: true }
  };
  var DBX = null, mode = 'idb', mem = {}, errorHandler = function () { };

  function initMem() {
    mem = {};
    Object.keys(STORES).forEach(function (s) { mem[s] = {}; });
    mem._autoId = 1;
  }
  function req(r) {
    return new Promise(function (res, rej) { r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; });
  }
  function txDone(tx) {
    return new Promise(function (res, rej) {
      tx.oncomplete = function () { res(true); };
      tx.onerror = function () { rej(tx.error); };
      tx.onabort = function () { rej(tx.error || new Error('Storage write was cancelled.')); };
    });
  }
  function fail(e) { try { errorHandler(e); } catch (x) { /* ignore */ } return false; }

  function open(name) {
    return new Promise(function (resolve) {
      function fallback(err) {
        mode = 'memory'; initMem();
        resolve({ mode: 'memory', error: err ? String(err.message || err) : 'IndexedDB is not available.' });
      }
      if (!root.indexedDB) return fallback();
      var r;
      try { r = root.indexedDB.open(name, 1); } catch (e) { return fallback(e); }
      r.onupgradeneeded = function () {
        var db = r.result;
        Object.keys(STORES).forEach(function (s) {
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, STORES[s]);
        });
      };
      r.onsuccess = function () {
        DBX = r.result; mode = 'idb';
        DBX.onversionchange = function () { DBX.close(); };
        resolve({ mode: 'idb' });
      };
      r.onerror = function () { fallback(r.error); };
      r.onblocked = function () { fallback(new Error('Storage is blocked by another tab.')); };
    });
  }

  function put(store, val) {
    if (mode === 'memory') {
      var key = val[STORES[store].keyPath];
      if (key === undefined) key = mem._autoId++;
      if (STORES[store].autoIncrement && val.id === undefined) val.id = key;
      mem[store][key] = JSON.parse(JSON.stringify(val));
      return Promise.resolve(true);
    }
    try {
      var tx = DBX.transaction(store, 'readwrite');
      tx.objectStore(store).put(val);
      return txDone(tx).catch(fail);
    } catch (e) { return Promise.resolve(fail(e)); }
  }
  function del(store, key) {
    if (mode === 'memory') { delete mem[store][key]; return Promise.resolve(true); }
    try {
      var tx = DBX.transaction(store, 'readwrite');
      tx.objectStore(store).delete(key);
      return txDone(tx).catch(fail);
    } catch (e) { return Promise.resolve(fail(e)); }
  }
  function getAll(store) {
    if (mode === 'memory') return Promise.resolve(Object.keys(mem[store]).map(function (k) { return JSON.parse(JSON.stringify(mem[store][k])); }));
    return req(DBX.transaction(store, 'readonly').objectStore(store).getAll());
  }

  function strip(rec, keyName) { var o = {}; Object.keys(rec).forEach(function (k) { if (k !== keyName) o[k] = rec[k]; }); return o; }

  /* Returns the stored data object, or null when nothing has been saved yet. Throws if it cannot be read. */
  function loadAll() {
    return Promise.all(['settings', 'habits', 'schedule', 'days', 'goals', 'skillCycles'].map(getAll)).then(function (r) {
      var settings = r[0].filter(function (x) { return x.key === 'main'; })[0];
      if (!settings) return null;
      var schedule = {};
      ['office', 'sat', 'hol'].forEach(function (k) {
        r[2].forEach(function (x) { if (x.dayType === k) schedule[k] = x.rows; });
      });
      r[1].sort(function (a, b) { return a.order - b.order; });
      var days = {};
      r[3].forEach(function (x) { days[x.date] = x; });
      var goals = r[4].filter(function (x) { return x.key === 'main'; })[0];
      var s = strip(settings, 'key');
      return {
        schemaVersion: typeof s.schemaVersion === 'number' ? s.schemaVersion : 0,
        settings: s, habits: r[1], schedule: schedule, days: days,
        goals: goals ? strip(goals, 'key') : undefined, skillCycles: r[5]
      };
    });
  }

  function saveSettings(s) { var o = JSON.parse(JSON.stringify(s)); o.key = 'main'; return put('settings', o); }
  function saveGoals(g) { var o = JSON.parse(JSON.stringify(g)); o.key = 'main'; return put('goals', o); }
  function saveHabit(h) { return put('habits', JSON.parse(JSON.stringify(h))); }
  function deleteHabit(id) { return del('habits', id); }
  function saveSchedule(type, rows) { return put('schedule', { dayType: type, rows: JSON.parse(JSON.stringify(rows)) }); }
  function saveDay(rec) { return put('days', JSON.parse(JSON.stringify(rec))); }
  function deleteDay(date) { return del('days', date); }
  function saveCycle(c) { return put('skillCycles', JSON.parse(JSON.stringify(c))); }
  function deleteCycle(id) { return del('skillCycles', id); }

  /* Replace every store (except safety copies) in one transaction: all or nothing. */
  function replaceAll(d) {
    var names = ['settings', 'habits', 'schedule', 'days', 'goals', 'skillCycles'];
    var s = JSON.parse(JSON.stringify(d.settings)); s.key = 'main'; s.schemaVersion = d.schemaVersion;
    var g = JSON.parse(JSON.stringify(d.goals)); g.key = 'main';
    if (mode === 'memory') {
      names.forEach(function (n) { mem[n] = {}; });
      mem.settings.main = s; mem.goals.main = g;
      d.habits.forEach(function (h) { mem.habits[h.id] = JSON.parse(JSON.stringify(h)); });
      Object.keys(d.schedule).forEach(function (k) { mem.schedule[k] = { dayType: k, rows: JSON.parse(JSON.stringify(d.schedule[k])) }; });
      Object.keys(d.days).forEach(function (k) { mem.days[k] = JSON.parse(JSON.stringify(d.days[k])); });
      d.skillCycles.forEach(function (c) { mem.skillCycles[c.id] = JSON.parse(JSON.stringify(c)); });
      return Promise.resolve(true);
    }
    try {
      var tx = DBX.transaction(names, 'readwrite');
      names.forEach(function (n) { tx.objectStore(n).clear(); });
      tx.objectStore('settings').put(s);
      tx.objectStore('goals').put(g);
      d.habits.forEach(function (h) { tx.objectStore('habits').put(JSON.parse(JSON.stringify(h))); });
      Object.keys(d.schedule).forEach(function (k) { tx.objectStore('schedule').put({ dayType: k, rows: JSON.parse(JSON.stringify(d.schedule[k])) }); });
      Object.keys(d.days).forEach(function (k) { tx.objectStore('days').put(JSON.parse(JSON.stringify(d.days[k]))); });
      d.skillCycles.forEach(function (c) { tx.objectStore('skillCycles').put(JSON.parse(JSON.stringify(c))); });
      return txDone(tx).catch(fail);
    } catch (e) { return Promise.resolve(fail(e)); }
  }

  /* Safety copies made before a restore, reset or large delete. */
  function addSafety(entry) { return put('safety', entry); }
  function listSafety() {
    return getAll('safety').then(function (l) { return l.sort(function (a, b) { return b.createdAt - a.createdAt; }); });
  }
  function deleteSafety(id) { return del('safety', id); }

  function persist() {
    if (root.navigator && root.navigator.storage && root.navigator.storage.persist) {
      return root.navigator.storage.persisted().then(function (p) { return p ? true : root.navigator.storage.persist(); }).catch(function () { return null; });
    }
    return Promise.resolve(null);
  }
  function estimate() {
    if (root.navigator && root.navigator.storage && root.navigator.storage.estimate) return root.navigator.storage.estimate().catch(function () { return null; });
    return Promise.resolve(null);
  }

  RT.db = {
    open: open, loadAll: loadAll, saveSettings: saveSettings, saveGoals: saveGoals, saveHabit: saveHabit,
    deleteHabit: deleteHabit, saveSchedule: saveSchedule, saveDay: saveDay, deleteDay: deleteDay,
    saveCycle: saveCycle, deleteCycle: deleteCycle, replaceAll: replaceAll, addSafety: addSafety,
    listSafety: listSafety, deleteSafety: deleteSafety, persist: persist, estimate: estimate,
    setErrorHandler: function (fn) { errorHandler = fn; },
    getMode: function () { return mode; }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = RT.db;
})(typeof self !== 'undefined' ? self : globalThis);
