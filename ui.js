/* ui.js: shared interface state, helpers, saving, toast, modal, event routing. */
(function (root) {
  'use strict';
  var RT = root.RT = root.RT || {};
  var D = RT.dates, L = RT.logic, DB = RT.db, DATA = RT.data;
  var doc = root.document;

  var ui = RT.ui = {};
  var S = ui.S = {
    data: null, view: 'today', date: null, calMonth: null, goalsPage: null, settingsPage: null,
    errors: {}, storageMsg: null, readError: null, demo: false, updateReady: false, persisted: null,
    lastToday: null, timer: null, focusKey: null, openNotes: false, safety: []
  };
  ui.views = {};
  ui.acts = {};
  ui.changes = {};

  ui.esc = function (s) {
    return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  var esc = ui.esc;
  ui.today = function () { return D.todayStr(new Date()); };
  ui.use24 = function () { return S.data.settings.timeFormat === '24'; };
  ui.icon = {
    check: '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false"><path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    dash: '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false"><path d="M5 10h10" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
    left: '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false"><path d="M12.5 4.5L7 10l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    right: '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false"><path d="M7.5 4.5L13 10l-5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    more: '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false"><circle cx="4.5" cy="10" r="1.7" fill="currentColor"/><circle cx="10" cy="10" r="1.7" fill="currentColor"/><circle cx="15.5" cy="10" r="1.7" fill="currentColor"/></svg>',
    plus: '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true" focusable="false"><path d="M6 2v8M2 6h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
  };

  /* ---------- plan helpers ---------- */
  ui.canEdit = function (date) {
    var s = S.data.settings, today = ui.today();
    if (date < s.startDate || date > s.endDate) return false;
    return date <= today || s.allowFuture;
  };
  ui.inPlan = function (date) { return date >= S.data.settings.startDate && date <= S.data.settings.endDate; };

  /* ---------- saving (every change is written at once) ---------- */
  ui.ensureDay = function (date) {
    if (!S.data.days[date]) S.data.days[date] = { date: date, status: {}, meals: {}, changed: Date.now() };
    return S.data.days[date];
  };
  ui.saveDay = function (date) {
    var r = S.data.days[date];
    if (!r) return Promise.resolve(true);
    r.changed = Date.now();
    return DB.saveDay(r);
  };
  ui.saveSettings = function () { return DB.saveSettings(S.data.settings); };
  ui.saveGoals = function () { return DB.saveGoals(S.data.goals); };
  ui.saveSchedule = function (type) { return DB.saveSchedule(type, S.data.schedule[type]); };
  ui.saveHabit = function (h) { return DB.saveHabit(h); };
  ui.snapshot = function (date) { return S.data.days[date] ? JSON.stringify(S.data.days[date]) : null; };
  ui.restoreSnapshot = function (date, snap) {
    if (snap === null) { delete S.data.days[date]; DB.deleteDay(date); }
    else { S.data.days[date] = JSON.parse(snap); DB.saveDay(S.data.days[date]); }
  };

  ui.onStorageError = function (e) {
    var name = e && e.name ? e.name : '';
    if (name === 'QuotaExceededError') {
      S.storageMsg = 'Your phone storage is full, so the last change may not be saved. Free some space on the phone, then use Back up now in Settings.';
    } else {
      S.storageMsg = 'The last change could not be saved. Use Back up now in Settings to keep a copy, then close and reopen the app.';
    }
    ui.renderBanner();
  };

  /* ---------- announcements, toast, haptics ---------- */
  ui.announce = function (text) {
    var el = doc.getElementById('live');
    if (!el) return;
    el.textContent = '';
    setTimeout(function () { el.textContent = text; }, 30);
  };
  ui.haptic = function () {
    if (S.data && S.data.settings.haptics && root.navigator && root.navigator.vibrate) { try { root.navigator.vibrate(12); } catch (e) { /* ignore */ } }
  };
  var toastTimer = null, toastUndo = null;
  ui.toast = function (msg, undoFn) {
    var el = doc.getElementById('toast');
    if (!el) return;
    toastUndo = undoFn || null;
    el.innerHTML = '<span>' + esc(msg) + '</span>' + (undoFn ? ' <button type="button" class="link" data-act="undo">Undo</button>' : '');
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); toastUndo = null; }, undoFn ? 6000 : 3500);
  };
  ui.acts.undo = function () {
    var fn = toastUndo; toastUndo = null;
    var el = doc.getElementById('toast');
    if (el) el.classList.remove('show');
    if (fn) fn();
  };

  /* ---------- modal ---------- */
  var lastFocus = null;
  ui.modal = function (html, title) {
    var rootEl = doc.getElementById('modal-root');
    lastFocus = doc.activeElement;
    rootEl.innerHTML = '<div class="scrim" data-act="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="mt">' +
      '<h2 id="mt">' + esc(title || '') + '</h2>' + html + '</div></div>';
    var first = rootEl.querySelector('input:not([type=hidden]),select,textarea,button.primary,button');
    if (first) first.focus();
    doc.body.classList.add('noscroll');
  };
  ui.closeModal = function () {
    var rootEl = doc.getElementById('modal-root');
    rootEl.innerHTML = '';
    doc.body.classList.remove('noscroll');
    if (lastFocus && lastFocus.focus && doc.contains(lastFocus)) { try { lastFocus.focus(); } catch (e) { /* ignore */ } }
    lastFocus = null;
  };
  ui.modalOpen = function () { return !!doc.querySelector('#modal-root .sheet'); };
  ui.acts.scrim = function (el, ev) { if (ev.target === el) ui.closeModal(); };
  ui.acts.closeModal = function () { ui.closeModal(); };

  /* confirm({title, body (html), yes, danger, typed, onYes}) */
  var confirmCb = null;
  ui.confirm = function (o) {
    confirmCb = o.onYes;
    var html = '<div class="modal-body">' + o.body + '</div>';
    if (o.typed) {
      html += '<label class="field"><span>Type <b>' + esc(o.typed) + '</b> to confirm</span>' +
        '<input type="text" id="typed" autocomplete="off" autocapitalize="characters" data-typed="' + esc(o.typed) + '"></label>';
    }
    html += '<div class="btn-row"><button type="button" class="btn" data-act="closeModal">Cancel</button>' +
      '<button type="button" class="btn ' + (o.danger ? 'danger' : 'primary') + '" data-act="confirmYes"' + (o.typed ? ' disabled id="yesbtn"' : '') + '>' + esc(o.yes || 'Confirm') + '</button></div>';
    ui.modal(html, o.title);
  };
  ui.acts.confirmYes = function () {
    var cb = confirmCb; confirmCb = null;
    ui.closeModal();
    if (cb) cb();
  };

  /* ---------- rendering ---------- */
  ui.renderBanner = function () {
    var el = doc.getElementById('banner');
    if (!el) return;
    var h = '';
    if (S.demo) h += '<div class="banner demo" role="status"><span>Demo mode: sample data, pretending today is ' + esc(D.fmt(S.fakeToday || '')) + '. Your real data is not touched.</span> <button type="button" class="link" data-act="exitDemo">Leave demo mode</button></div>';
    if (S.storageMsg) h += '<div class="banner warn" role="alert">' + esc(S.storageMsg) + '</div>';
    if (S.updateReady) h += '<div class="banner info" role="status"><button type="button" class="link" data-act="applyUpdate">Update ready. Tap to refresh</button></div>';
    el.innerHTML = h;
  };
  ui.render = function () {
    var view = doc.getElementById('view');
    if (!S.data) return;
    var fn = ui.views[S.view];
    var y = root.scrollY;
    view.innerHTML = fn ? fn() : '';
    doc.querySelectorAll('#tabs [data-tab]').forEach(function (b) {
      if (b.getAttribute('data-tab') === S.view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (S.focusKey) {
      var f = view.querySelector('[data-key="' + S.focusKey + '"]');
      if (f) f.focus();
      S.focusKey = null;
    }
    if (root.scrollTo && !ui._resetScroll) root.scrollTo(0, y);
    ui._resetScroll = false;
    ui.fitTabs();
    if (ui.afterRender) ui.afterRender();
  };
  /* If the tab labels do not fit (very large text), show icons only. Names stay for screen readers. */
  ui.fitTabs = function () {
    var nav = doc.getElementById('tabs');
    if (!nav) return;
    nav.classList.remove('compact');
    var over = Array.prototype.some.call(nav.querySelectorAll('button span'), function (sp) { return sp.getBoundingClientRect().height > parseFloat(root.getComputedStyle(sp).fontSize) * 1.8; });
    if (over) nav.classList.add('compact');
  };
  root.addEventListener('resize', function () { if (ui.fitTabs) ui.fitTabs(); });
  ui.go = function (view) {
    S.view = view;
    if (view === 'goals') S.goalsPage = null;
    if (view === 'settings') S.settingsPage = null;
    ui._resetScroll = true;
    ui.render();
    if (root.scrollTo) root.scrollTo(0, 0);
  };
  ui.acts.tab = function (el) { ui.go(el.getAttribute('data-tab')); };
  ui.openDate = function (date) {
    S.date = date; S.errors = {}; S.view = 'today'; ui._resetScroll = true; ui.render();
    if (root.scrollTo) root.scrollTo(0, 0);
  };

  /* ---------- event routing ---------- */
  var pressTimer = null, pressFired = false;
  doc.addEventListener('click', function (ev) {
    if (pressFired) { pressFired = false; ev.preventDefault(); return; }
    var el = ev.target.closest ? ev.target.closest('[data-act]') : null;
    if (!el) return;
    var fn = ui.acts[el.getAttribute('data-act')];
    if (fn) fn(el, ev);
  });
  doc.addEventListener('change', function (ev) {
    var el = ev.target.closest ? ev.target.closest('[data-chg]') : null;
    if (!el) return;
    var fn = ui.changes[el.getAttribute('data-chg')];
    if (fn) fn(el, ev);
  });
  doc.addEventListener('input', function (ev) {
    var el = ev.target;
    if (el && el.getAttribute && el.getAttribute('data-typed')) {
      var btn = doc.getElementById('yesbtn');
      if (btn) btn.disabled = el.value.trim().toUpperCase() !== el.getAttribute('data-typed');
    }
  });
  doc.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && ui.modalOpen()) { ui.closeModal(); return; }
    if (ev.key === 'Tab' && ui.modalOpen()) {
      var f = doc.querySelectorAll('#modal-root input,#modal-root select,#modal-root textarea,#modal-root button:not([disabled])');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (ev.shiftKey && doc.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && doc.activeElement === last) { ev.preventDefault(); first.focus(); }
    }
  });
  /* Long-press on a schedule row opens the skip menu. */
  function cancelPress() { clearTimeout(pressTimer); pressTimer = null; }
  doc.addEventListener('pointerdown', function (ev) {
    var row = ev.target.closest ? ev.target.closest('[data-longpress]') : null;
    if (!row || ev.target.closest('button,input,select,textarea,a')) return;
    cancelPress();
    pressTimer = setTimeout(function () {
      pressFired = true;
      var fn = ui.acts[row.getAttribute('data-longpress')];
      if (fn) fn(row, ev);
    }, 550);
  });
  ['pointerup', 'pointermove', 'pointercancel', 'scroll'].forEach(function (n) { doc.addEventListener(n, cancelPress, true); });

  /* ---------- small shared view helpers ---------- */
  ui.bar = function (pct, label) {
    var p = pct === null || pct === undefined ? 0 : pct;
    return '<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p + '" aria-label="' + esc(label || 'Progress') + '"><span style="width:' + p + '%"></span></div>';
  };
  ui.pctText = function (p) { return p === null || p === undefined ? 'No data yet' : p + '%'; };
  ui.fmtNum = function (n, dp) {
    if (n === null || n === undefined || !isFinite(n)) return 'None yet';
    return (Math.round(n * Math.pow(10, dp || 0)) / Math.pow(10, dp || 0)).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: dp || 0 });
  };
  ui.download = function (filename, text, type) {
    /* Inside the Android app file, the app saves straight to the Downloads folder. */
    if (root.AndroidBridge && root.AndroidBridge.saveFile) {
      try { if (root.AndroidBridge.saveFile(filename, type || 'application/json', text)) return; } catch (e) { /* fall back */ }
    }
    var blob = new Blob([text], { type: type || 'application/json' });
    var a = doc.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    doc.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  };
  ui.clone = DATA.copy;
})(typeof self !== 'undefined' ? self : globalThis);
