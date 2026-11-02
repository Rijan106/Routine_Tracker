/* main.js: start-up, clock (midnight rollover), bathroom timer, service worker updates, demo mode. */
(function (root) {
  'use strict';
  var RT = root.RT, ui = RT.ui, S = ui.S, D = RT.dates, L = RT.logic, DB = RT.db, DATA = RT.data, esc = ui.esc;
  var doc = root.document, nav = root.navigator;

  var DEMO = false;
  try { DEMO = root.localStorage.getItem('rt-demo') === '1'; } catch (e) { /* ignore */ }
  var DEMO_TODAY = '2027-03-10';
  S.demo = DEMO;
  if (DEMO) S.fakeToday = DEMO_TODAY;
  ui.today = function () { return S.fakeToday || D.todayStr(new Date()); };

  /* ---------- demo data (separate database, fixed sample) ---------- */
  function seedDemo(d) {
    var seed = 12345;
    function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
    var last = D.addDays(DEMO_TODAY, -1), page = 0, weight = 82, weeks = 0;
    D.range(d.settings.dayOne, last).forEach(function (x, i) {
      var type = L.dayTypeOf(d, x), r = { date: x, status: {}, meals: {}, changed: Date.parse(x + 'T12:00:00Z') };
      var p = Math.min(0.95, 0.55 + i * 0.0025);
      L.activeHabits(d, type).forEach(function (h) {
        var roll = rnd();
        if (h.id === 'meals') { L.requiredMeals(d, type).forEach(function (m) { if (rnd() < p + 0.03) r.meals[m] = true; }); }
        else if (roll < p) r.status[h.id] = 'done';
        else if (roll > 0.985) { r.status[h.id] = 'skipped'; r.skipReason = r.skipReason || {}; r.skipReason[h.id] = 'travelling'; }
      });
      if (r.status.read === 'done') { page = Math.min(450, page + 2 + Math.floor(rnd() * 3)); r.page = page; }
      if (r.status.steps === 'done') r.steps = 10000 + Math.floor(rnd() * 3000); else if (rnd() < 0.3) r.steps = 5000 + Math.floor(rnd() * 4000);
      if (r.status.screen === 'done') r.screenMin = 60 + Math.floor(rnd() * 55);
      if (D.dow(x) === 0) { weight = Math.round((82 - 0.28 * weeks + (rnd() - 0.5) * 0.6) * 10) / 10; r.weight = weight; weeks++; }
      if (i % 17 === 5) r.note = 'Sample note for ' + D.fmtShort(x) + '.';
      d.days[x] = r;
    });
    d.skillCycles.push({ id: 'demo1', name: 'Public speaking', start: '2026-11-07', minutes: { '2026-11-07': 30, '2026-11-14': 45 }, review: 'Sample review text.', result: 'continue', done: true });
    d.skillCycles.push({ id: 'demo2', name: 'Public speaking', start: '2026-12-07', minutes: {}, review: '', result: '', done: false });
    d.goals.skills[0].status = 'inprogress';
    return d;
  }

  /* ---------- fatal: stored data cannot be read ---------- */
  function renderFatal(msg) {
    doc.getElementById('view').innerHTML = '<h1>Your saved data could not be read</h1><section class="card"><p>' + esc(msg || 'The data stored on this phone could not be read.') + '</p>' +
      '<p><strong>Nothing has been changed or overwritten.</strong> Close the app and open it again first. If this message stays, choose a backup file below.</p>' +
      '<div class="stack"><button type="button" class="btn" data-act="reloadApp">Try again</button><button type="button" class="btn primary" data-act="fatalPick">Choose a backup file</button></div>' +
      '<input type="file" id="fatal-file" accept=".json,application/json" hidden data-chg="fatalFile"></section>';
  }
  ui.acts.reloadApp = function () { root.location.reload(); };
  ui.acts.fatalPick = function () { var f = doc.getElementById('fatal-file'); if (f) { f.value = ''; f.click(); } };
  ui.changes.fatalFile = function (el) {
    var f = el.files && el.files[0];
    if (!f) return;
    var rd = new root.FileReader();
    rd.onload = function () {
      var v = L.validateBackup(String(rd.result));
      if (!v.ok) { ui.modal('<p>' + esc(v.error) + '</p><div class="btn-row"><button type="button" class="btn primary" data-act="closeModal">Close</button></div>', 'This file was not imported'); return; }
      S.pendingRestore = v;
      ui.modal('<p>This backup has ' + v.summary.dayCount + ' days with data. Importing replaces the unreadable data stored on this phone.</p><div class="btn-row"><button type="button" class="btn" data-act="closeModal">Cancel</button><button type="button" class="btn danger" data-act="fatalDo">Replace and import</button></div>', 'Import this backup?');
    };
    rd.readAsText(f);
  };
  ui.acts.fatalDo = function () {
    var v = S.pendingRestore;
    if (!v) return;
    DB.replaceAll(v.data).then(function () { root.location.reload(); });
  };

  /* ---------- service worker ---------- */
  var hadController = !!(nav.serviceWorker && nav.serviceWorker.controller);
  function setupSW() {
    if (!('serviceWorker' in nav) || root.location.protocol === 'file:' || root.AndroidBridge) return;
    nav.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController) { hadController = true; return; }
      if (S.reloading) return;
      S.reloading = true; root.location.reload();
    });
    nav.serviceWorker.register('sw.js').then(function (reg) {
      S.reg = reg;
      function watch(w) {
        if (!w) return;
        w.addEventListener('statechange', function () {
          if (w.state === 'installed' && nav.serviceWorker.controller) { S.updateReady = true; ui.renderBanner(); }
        });
      }
      if (reg.waiting && nav.serviceWorker.controller) { S.updateReady = true; ui.renderBanner(); }
      watch(reg.installing);
      reg.addEventListener('updatefound', function () { watch(reg.installing); });
    }).catch(function () { /* the app still works without offline support */ });
  }
  ui.acts.applyUpdate = function () {
    var w = S.reg && S.reg.waiting;
    if (w) w.postMessage({ type: 'SKIP_WAITING' }); else root.location.reload();
  };
  ui.checkUpdate = function () {
    if (!S.reg) { ui.toast(root.AndroidBridge ? 'This app file has no online updates. Install a newer app file to update.' : 'Update checks work once the app is installed from its web address.'); return; }
    S.reg.update().then(function () {
      setTimeout(function () { ui.toast(S.updateReady ? 'Update ready. Tap the message at the top to refresh.' : 'You have the latest version.'); }, 800);
    }).catch(function () { ui.toast('Could not check for an update. You may be offline. Try again later.'); });
  };

  /* ---------- clock ---------- */
  function editing() {
    var a = doc.activeElement;
    return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT');
  }
  function checkDay() {
    if (!S.data) return;
    var t = ui.today(), minute = Math.floor(Date.now() / 60000);
    if (S.lastToday && t !== S.lastToday) {
      var old = S.lastToday;
      S.lastToday = t;
      if (S.date === old) S.date = t;
      if (!ui.modalOpen()) ui.render();
      return;
    }
    if (minute !== S.lastMinute) {
      S.lastMinute = minute;
      if (S.view === 'today' && S.date === t && !editing() && !ui.modalOpen()) ui.render();
    }
  }
  function scheduleMidnight() {
    var n = new Date(), next = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 1);
    setTimeout(function () { checkDay(); scheduleMidnight(); }, Math.max(1000, next - n));
  }
  function tickTimer() {
    if (!S.timer) return;
    if (S.timer.end <= Date.now()) {
      S.timer = null;
      try { root.localStorage.removeItem('rt-timer'); } catch (e) { /* ignore */ }
      ui.toast('15 minutes are up.');
      ui.announce('15 minutes are up.');
      ui.haptic();
      if (S.view === 'today' && !editing() && !ui.modalOpen()) ui.render();
      return;
    }
    var el = doc.querySelector('[data-timer]');
    if (el) el.textContent = ui.timerText();
  }

  /* ---------- boot ---------- */
  function start(data) {
    S.data = data;
    ui.applyTheme();
    if (root.matchMedia) {
      var mq = root.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', function () { ui.applyTheme(); });
    }
    S.date = ui.today(); S.lastToday = S.date; S.lastMinute = Math.floor(Date.now() / 60000);
    try {
      var te = Number(root.localStorage.getItem('rt-timer'));
      if (te > Date.now()) S.timer = { end: te };
    } catch (e) { /* ignore */ }
    DB.listSafety().then(function (l) { S.safety = l; }).catch(function () { S.safety = []; });
    DB.persist().then(function (p) { S.persisted = p; });
    ui.renderBanner();
    ui.render();
    setInterval(checkDay, 15000);
    setInterval(tickTimer, 1000);
    scheduleMidnight();
    doc.addEventListener('visibilitychange', function () { if (!doc.hidden) checkDay(); });
    root.addEventListener('focus', checkDay);
    root.addEventListener('pageshow', checkDay);
    if (ui.startAlarms) ui.startAlarms();
    setupSW();
    doc.documentElement.setAttribute('data-ready', '1');
  }

  function boot() {
    DB.setErrorHandler(ui.onStorageError);
    DB.open(DEMO ? 'routine-tracker-demo' : 'routine-tracker').then(function (o) {
      if (o.mode === 'memory') {
        S.storageMsg = 'This browser is blocking storage, so your ticks cannot be saved on this phone. Close private browsing, or open the app from the home screen, then try again. Use Back up now in Settings to keep a copy.';
      }
      return DB.loadAll().catch(function (e) { return { __error: e }; });
    }).then(function (stored) {
      if (stored && stored.__error) { ui.renderBanner(); renderFatal('The stored data could not be read (' + (stored.__error.message || 'unknown error') + ').'); return; }
      var data;
      if (stored === null) {
        data = DATA.makeDefaultData();
        if (DEMO) seedDemo(data);
        return DB.replaceAll(data).then(function () { start(data); });
      }
      var old = (stored.schemaVersion || 0) < DATA.SCHEMA_VERSION;
      try { data = DATA.migrate(JSON.parse(JSON.stringify(stored))); }
      catch (e) { renderFatal('The stored data is from a version this app cannot open (' + (e.message || 'unknown') + ').'); return; }
      if (!old) { start(data); return; }
      var raw = JSON.parse(JSON.stringify(stored)); raw.app = 'routine-tracker';
      return DB.addSafety({ createdAt: Date.now(), reason: 'Before upgrading the data format', data: raw })
        .then(function () { return DB.replaceAll(data); }).then(function () { start(data); });
    });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof self !== 'undefined' ? self : globalThis);
