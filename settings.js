/* settings.js: the Settings tab (general, habits, schedule, backup and data, about). */
(function (root) {
  'use strict';
  var RT = root.RT, ui = RT.ui, S = ui.S, D = RT.dates, L = RT.logic, DB = RT.db, DATA = RT.data, esc = ui.esc;
  var doc = root.document;
  S.schedType = 'office';

  /* ---------- theme ---------- */
  ui.applyTheme = function () {
    var t = S.data ? S.data.settings.theme : 'system', el = doc.documentElement;
    if (t === 'light' || t === 'dark') el.setAttribute('data-theme', t); else el.removeAttribute('data-theme');
    var dark = t === 'dark' || (t === 'system' && root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches);
    var m = doc.getElementById('theme-color');
    if (m) m.setAttribute('content', dark ? '#0F161D' : '#F3F6FA');
  };

  /* ---------- safety copies and backups ---------- */
  ui.makeSafety = function (reason) {
    var entry = { createdAt: Date.now(), reason: reason, data: L.exportData(S.data) };
    entry.data = JSON.parse(JSON.stringify(entry.data));
    return DB.addSafety(entry).then(function () { return DB.listSafety(); }).then(function (list) {
      var cutoff = Date.now() - 30 * 86400000, keep = 0, jobs = [];
      list.forEach(function (e) {
        keep++;
        if (keep > 10 && e.createdAt < cutoff) jobs.push(DB.deleteSafety(e.id));
      });
      S.safety = list.filter(function (e) { return !(list.indexOf(e) >= 10 && e.createdAt < cutoff); });
      return Promise.all(jobs);
    });
  };
  function stamp(ms) {
    var dt = new Date(ms);
    return D.fmtShort(D.todayStr(dt)) + ' ' + D.fmtTime(dt.getHours() * 60 + dt.getMinutes(), ui.use24());
  }
  function markBackup() {
    S.data.settings.lastBackup = ui.today();
    ui.saveSettings(); ui.render(); ui.toast('Backup made.');
  }
  function backupText() { return JSON.stringify(L.exportData(S.data)); }
  function backupName() { return 'routine-tracker-backup-' + ui.today() + '.json'; }
  ui.backupNow = function () {
    var json = backupText(), name = backupName(), nav = root.navigator;
    try {
      var file = new root.File([json], name, { type: 'application/json' });
      if (!root.AndroidBridge && nav && nav.canShare && nav.canShare({ files: [file] })) {
        nav.share({ files: [file], title: 'Routine Tracker backup' }).then(markBackup).catch(function (e) {
          if (e && e.name === 'AbortError') { ui.toast('Backup not shared. Nothing was changed.'); return; }
          ui.download(name, json); markBackup();
        });
        return;
      }
    } catch (e) { /* fall through to download */ }
    ui.download(name, json); markBackup();
  };
  ui.acts.backupDownload = function () { ui.download(backupName(), backupText()); markBackup(); };
  ui.acts.csv = function () { ui.download('routine-tracker-' + ui.today() + '.csv', '﻿' + L.toCSV(S.data), 'text/csv'); ui.toast('Spreadsheet file created.'); };

  ui.acts.pickRestore = function () { var f = doc.getElementById('restore-file'); if (f) { f.value = ''; f.click(); } };
  ui.changes.restoreFile = function (el) {
    var f = el.files && el.files[0];
    if (!f) return;
    var rd = new root.FileReader();
    rd.onerror = function () { ui.toast('That file could not be read. Nothing was changed.'); };
    rd.onload = function () {
      var v = L.validateBackup(String(rd.result));
      if (!v.ok) { ui.modal('<p>' + esc(v.error) + '</p><p class="muted">Nothing was changed.</p><div class="btn-row"><button type="button" class="btn primary" data-act="closeModal">Close</button></div>', 'This file was not imported'); return; }
      S.pendingRestore = v;
      var sm = v.summary;
      ui.modal('<dl class="stats"><div><dt>First day</dt><dd>' + (sm.first ? esc(D.fmt(sm.first)) : 'None') + '</dd></div><div><dt>Last day</dt><dd>' + (sm.last ? esc(D.fmt(sm.last)) : 'None') + '</dd></div>' +
        '<div><dt>Days with data</dt><dd>' + sm.dayCount + '</dd></div><div><dt>Last changed</dt><dd>' + (sm.lastChanged ? esc(stamp(sm.lastChanged)) : 'Not recorded') + '</dd></div></dl>' +
        '<p><strong>Replace everything</strong> deletes what is on this phone now and uses the file. <strong>Merge</strong> keeps what is on this phone and adds days from the file, and for a day in both, the newest change wins.</p>' +
        '<p class="muted">A safety copy of your current data is made first. You can go back to it from Settings for at least 7 days. Nothing changes until you choose.</p>' +
        '<div class="stack"><button type="button" class="btn danger" data-act="doRestore" data-mode="replace">Replace everything</button><button type="button" class="btn primary" data-act="doRestore" data-mode="merge">Merge</button><button type="button" class="btn" data-act="closeModal">Cancel</button></div>', 'Restore from this backup?');
    };
    rd.readAsText(f);
  };
  ui.acts.doRestore = function (el) {
    var v = S.pendingRestore, mode = el.getAttribute('data-mode');
    if (!v) return;
    ui.closeModal();
    ui.makeSafety(mode === 'replace' ? 'Before restoring a backup (replace)' : 'Before restoring a backup (merge)').then(function () {
      var next = mode === 'replace' ? v.data : L.mergeData(S.data, v.data);
      return DB.replaceAll(next).then(function () { S.data = next; S.pendingRestore = null; ui.applyTheme(); ui.render(); ui.toast(mode === 'replace' ? 'Backup restored.' : 'Backup merged.'); });
    });
  };
  ui.acts.restoreSafety = function (el) {
    var id = Number(el.getAttribute('data-id'));
    var e = S.safety.filter(function (x) { return x.id === id; })[0];
    if (!e) return;
    ui.confirm({
      title: 'Go back to this safety copy?', yes: 'Go back to this copy', danger: true,
      body: '<p>This replaces what is on the phone now with the copy made on ' + esc(stamp(e.createdAt)) + ' (' + esc(e.reason) + '). A new safety copy of the current data is made first.</p>',
      onYes: function () {
        var v = L.validateBackup(JSON.stringify(e.data));
        if (!v.ok) { ui.toast(v.error); return; }
        ui.makeSafety('Before going back to a safety copy').then(function () { return DB.replaceAll(v.data); }).then(function () { S.data = v.data; ui.applyTheme(); ui.render(); ui.toast('Safety copy restored.'); });
      }
    });
  };
  ui.acts.resetAll = function () {
    ui.confirm({
      title: 'Reset everything?', yes: 'Reset everything', danger: true, typed: 'RESET',
      body: '<p>This deletes all ticks, notes, weights, pages, goals, skill cycles and any changes to habits and schedules. The app goes back to your notebook routine.</p><p>A safety copy is made first and kept for at least 7 days. A backup file is safer: use Back up now first.</p>',
      onYes: function () {
        ui.makeSafety('Before reset').then(function () {
          var fresh = DATA.makeDefaultData();
          return DB.replaceAll(fresh).then(function () { S.data = fresh; S.date = ui.today(); S.view = 'settings'; S.settingsPage = null; ui.applyTheme(); ui.render(); ui.toast('Everything was reset.'); });
        });
      }
    });
  };

  /* clear one day (used from Today) */
  ui.acts.clearDay = function (el) {
    var date = el.getAttribute('data-date');
    if (!S.data.days[date]) { ui.toast('There is nothing saved for this day.'); return; }
    ui.confirm({
      title: 'Clear this day?', yes: 'Clear ' + D.fmtShort(date), danger: true,
      body: '<p>This removes every tick, skip, number and note saved for ' + esc(D.fmt(date, true)) + '. A safety copy is made first.</p>',
      onYes: function () {
        ui.makeSafety('Before clearing ' + date).then(function () { delete S.data.days[date]; return DB.deleteDay(date); }).then(function () { ui.render(); ui.toast('Day cleared.'); });
      }
    });
  };

  /* ---------- demo mode ---------- */
  ui.acts.enterDemo = function () {
    ui.confirm({
      title: 'Open demo mode?', yes: 'Open demo mode',
      body: '<p>Demo mode opens a separate copy of the app filled with sample ticks, so you can see a full calendar. Your real data is not touched or mixed in. You can leave demo mode at any time.</p>',
      onYes: function () { try { root.localStorage.setItem('rt-demo', '1'); } catch (e) { /* ignore */ } root.location.reload(); }
    });
  };
  ui.acts.exitDemo = function () { try { root.localStorage.removeItem('rt-demo'); } catch (e) { /* ignore */ } root.location.reload(); };

  /* ---------- general ---------- */
  function sel(label, key, opts, cur) {
    return '<label class="field"><span>' + esc(label) + '</span><select data-chg="setg" data-key="' + key + '">' +
      opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(o[0]) === String(cur) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></label>';
  }
  function txt(label, key, value, mode, hint) {
    var v = S.drafts['s:' + key] !== undefined ? S.drafts['s:' + key] : (value === null || value === undefined ? '' : value);
    return '<label class="field"><span>' + esc(label) + '</span><input type="' + (mode === 'date' ? 'date' : mode === 'time' ? 'time' : 'text') + '" inputmode="' + (mode === 'numeric' ? 'numeric' : 'text') + '" autocomplete="off" value="' + esc(v) + '" data-chg="setg" data-key="' + key + '">' + (hint ? '<small>' + esc(hint) + '</small>' : '') + '</label>';
  }
  function chk(label, key, on) {
    return '<label class="check"><input type="checkbox" data-chg="setg" data-key="' + key + '"' + (on ? ' checked' : '') + '><span>' + esc(label) + '</span></label>';
  }
  function sErr() { return S.errors.set ? '<p class="err" role="alert">' + esc(S.errors.set) + '</p>' : ''; }

  function generalPage() {
    var d = S.data, s = d.settings;
    var h = '<button type="button" class="btn small" data-act="settingsBack">Back to Settings</button><h1>General</h1>' + sErr();
    h += '<section class="card"><h2>Plan dates</h2><p class="muted">You can tick from the start date. Day 1 of the plan, used for the day count, streaks and percentages, is the day-one date.</p>' +
      txt('First day you can tick', 'startDate', s.startDate, 'date') + txt('Day 1 of the plan', 'dayOne', s.dayOne, 'date') + txt('Last day of the plan', 'endDate', s.endDate, 'date') +
      '<p>The plan has ' + L.planLength(d) + ' days.</p><button type="button" class="btn" data-act="addMonth">Add another month</button></section>';
    h += '<section class="card"><h2>Targets</h2>' + txt('Step goal', 'stepGoal', s.stepGoal, 'numeric') + txt('Screen time limit (minutes a day)', 'screenLimitMin', s.screenLimitMin, 'numeric', 'The Screen time habit is done when the time you type is under this limit.') +
      '<div class="grid2">' + txt('Wake window starts', 'wakeStart', D.toInputTime(s.wakeStart), 'time') + txt('Wake window ends', 'wakeEnd', D.toInputTime(s.wakeEnd), 'time') + '</div>' +
      sel('Weekly weigh-in day', 'weighInDay', D.DAYS.map(function (n, i) { return [i, n]; }), s.weighInDay) + '</section>';
    var order = []; for (var i = 0; i < 7; i++) order.push((s.weekStart + i) % 7);
    h += '<section class="card"><h2>Default day type for each weekday</h2><p class="muted">You can still change the type of any single date on the Today screen.</p>' +
      order.map(function (wd) { return sel(D.DAYS[wd], 'dt.' + wd, DATA.DAY_TYPES.map(function (t) { return [t, DATA.DAY_TYPE_LABELS[t]]; }), s.defaultTypes[wd]); }).join('') + '</section>';
    h += '<section class="card"><h2>Look and feel</h2>' + sel('Theme', 'theme', [['system', 'Follow the phone'], ['light', 'Light'], ['dark', 'Dark']], s.theme) +
      sel('Time format', 'timeFormat', [['12', '12 hour (5:30 am)'], ['24', '24 hour (05:30)']], s.timeFormat) +
      sel('Week starts on', 'weekStart', [[1, 'Monday'], [0, 'Sunday']], s.weekStart) +
      chk('Allow ticking days that have not started', 'allowFuture', s.allowFuture) + chk('Light vibration when a habit is done (Android only)', 'haptics', s.haptics) + '</section>';
    h += '<section class="card"><h2>Food log (optional)</h2>' + chk('Show calories and protein in the daily log', 'foodLog', s.foodLog) +
      (s.foodLog ? '<div class="grid2">' + txt('Daily calorie target', 'calorieTarget', s.calorieTarget, 'numeric') + txt('Daily protein target (g)', 'proteinTarget', s.proteinTarget, 'numeric') + '</div>' : '') + '</section>';
    h += '<section class="card"><h2>Backup reminder</h2>' + txt('Remind me after this many days without a backup', 'backupReminderDays', s.backupReminderDays, 'numeric') + '</section>';
    return h;
  }
  ui.acts.addMonth = function () {
    var s = S.data.settings, next = D.monthLast(D.addMonths(D.monthKey(s.endDate), 1));
    s.endDate = next; ui.saveSettings(); ui.render(); ui.toast('The plan now ends on ' + D.fmt(next) + '.');
  };
  function applyWake(d) {
    ['office', 'sat', 'hol'].forEach(function (k) {
      var ch = false;
      d.schedule[k].forEach(function (r) { if (r.items.length && r.items[0].habit === 'wake') { r.t = d.settings.wakeStart; r.t2 = d.settings.wakeEnd; ch = true; } });
      if (ch) ui.saveSchedule(k);
    });
  }
  function intIn(v, lo, hi) { var n = Number(String(v).trim()); return isFinite(n) && n % 1 === 0 && n >= lo && n <= hi ? n : null; }
  ui.changes.setg = function (el) {
    var key = el.getAttribute('data-key'), s = S.data.settings, v = el.type === 'checkbox' ? el.checked : el.value.trim(), n;
    delete S.errors.set; delete S.drafts['s:' + key];
    function bad(msg) { S.errors.set = msg; S.drafts['s:' + key] = el.value; ui.render(); }
    if (key.indexOf('dt.') === 0) { s.defaultTypes[key.slice(3)] = v; }
    else switch (key) {
      case 'stepGoal': n = intIn(v, 100, 100000); if (n === null) return bad('The step goal must be a whole number from 100 to 100,000.'); s.stepGoal = n; break;
      case 'screenLimitMin': n = intIn(v, 15, 1440); if (n === null) return bad('The screen time limit must be a whole number of minutes from 15 to 1,440.'); s.screenLimitMin = n; break;
      case 'proteinTarget': n = intIn(v, 10, 500); if (n === null) return bad('The protein target must be a whole number from 10 to 500 g.'); s.proteinTarget = n; break;
      case 'calorieTarget': if (v === '') s.calorieTarget = null; else { n = intIn(v, 500, 10000); if (n === null) return bad('The calorie target must be a whole number from 500 to 10,000, or empty.'); s.calorieTarget = n; } break;
      case 'backupReminderDays': n = intIn(v, 1, 365); if (n === null) return bad('Enter a whole number of days from 1 to 365.'); s.backupReminderDays = n; break;
      case 'weighInDay': s.weighInDay = Number(v); break;
      case 'weekStart': s.weekStart = Number(v); break;
      case 'theme': s.theme = v; ui.applyTheme(); break;
      case 'timeFormat': s.timeFormat = v; break;
      case 'allowFuture': case 'haptics': case 'foodLog': s[key] = !!v; break;
      case 'startDate': case 'dayOne': case 'endDate': {
        if (!D.isValid(v)) return bad('Enter a valid date.');
        var a = key === 'startDate' ? v : s.startDate, b = key === 'dayOne' ? v : s.dayOne, c = key === 'endDate' ? v : s.endDate;
        if (!(a <= b && b < c)) return bad('The dates must be in this order: first day you can tick, day 1, last day.');
        s[key] = v; break;
      }
      case 'wakeStart': case 'wakeEnd': {
        var tm = D.parseTime(v);
        if (tm === null) return bad('Enter a time like 05:30.');
        var ws = key === 'wakeStart' ? tm : s.wakeStart, we = key === 'wakeEnd' ? tm : s.wakeEnd;
        if (ws >= we) return bad('The wake window must end after it starts.');
        s.wakeStart = ws; s.wakeEnd = we; applyWake(S.data); break;
      }
    }
    ui.saveSettings(); ui.render();
  };

  /* ---------- habits ---------- */
  function habitsPage() {
    var d = S.data, list = L.sortedHabits(d).filter(function (h) { return !h.hidden; }), hidden = d.habits.filter(function (h) { return h.hidden; });
    var h = '<button type="button" class="btn small" data-act="settingsBack">Back to Settings</button><h1>Habits</h1><p class="muted">Renaming a habit keeps its history, because history is stored under a fixed internal id. To change a time, edit the schedule rows.</p>' + sErr();
    list.forEach(function (hb, i) {
      h += '<section class="card habit" aria-label="' + esc(hb.name) + '"><label class="field"><span>Name</span><input type="text" maxlength="60" value="' + esc(hb.name) + '" data-chg="habitName" data-id="' + hb.id + '"></label>' +
        chk('On (counts and shows on its days)', 'habitOn:' + hb.id, hb.enabled).replace('data-chg="setg"', 'data-chg="habitOn" data-id="' + hb.id + '"') +
        '<fieldset class="types"><legend>Applies on</legend>' + DATA.DAY_TYPES.map(function (t) {
          return '<label class="check"><input type="checkbox" data-chg="habitType" data-id="' + hb.id + '" data-type="' + t + '"' + (hb.types.indexOf(t) >= 0 ? ' checked' : '') + '><span>' + DATA.DAY_TYPE_LABELS[t] + '</span></label>';
        }).join('') + '</fieldset>' +
        '<label class="field"><span>Counts as done when</span><textarea rows="2" maxlength="300" data-chg="habitNote" data-id="' + hb.id + '">' + esc(hb.note || '') + '</textarea></label>' +
        '<div class="btn-row"><button type="button" class="btn small" data-act="habitMove" data-id="' + hb.id + '" data-dir="-1"' + (i === 0 ? ' disabled' : '') + ' aria-label="Move ' + esc(hb.name) + ' up">Move up</button>' +
        '<button type="button" class="btn small" data-act="habitMove" data-id="' + hb.id + '" data-dir="1"' + (i === list.length - 1 ? ' disabled' : '') + ' aria-label="Move ' + esc(hb.name) + ' down">Move down</button>' +
        '<button type="button" class="btn small" data-act="habitHide" data-id="' + hb.id + '" aria-label="Delete ' + esc(hb.name) + '">Delete habit</button></div></section>';
    });
    if (hidden.length) {
      h += '<section class="card"><h2>Hidden habits</h2><p class="muted">Their history is kept.</p><ul class="plain">' + hidden.map(function (x) {
        return '<li>' + esc(x.name) + ' <button type="button" class="link" data-act="habitShow" data-id="' + x.id + '">Show again</button></li>';
      }).join('') + '</ul></section>';
    }
    h += '<section class="card"><h2>Add your own habit</h2><label class="field"><span>Name</span><input type="text" id="nh-name" maxlength="60"></label><fieldset class="types"><legend>Applies on</legend>' +
      DATA.DAY_TYPES.map(function (t) { return '<label class="check"><input type="checkbox" id="nh-' + t + '" checked><span>' + DATA.DAY_TYPE_LABELS[t] + '</span></label>'; }).join('') + '</fieldset>' +
      '<button type="button" class="btn primary" data-act="addHabit">Add habit</button></section>';
    return h;
  }
  function habit(id) { return L.habitById(S.data, id); }
  ui.changes.habitName = function (el) {
    var h = habit(el.getAttribute('data-id')), v = el.value.trim();
    delete S.errors.set;
    if (!v) { S.errors.set = 'A habit needs a name.'; ui.render(); return; }
    h.name = v; ui.saveHabit(h); ui.render();
  };
  ui.changes.habitOn = function (el) { var h = habit(el.getAttribute('data-id')); h.enabled = el.checked; ui.saveHabit(h); ui.render(); };
  ui.changes.habitType = function (el) {
    var h = habit(el.getAttribute('data-id')), t = el.getAttribute('data-type'), i = h.types.indexOf(t);
    if (el.checked && i < 0) h.types.push(t); else if (!el.checked && i >= 0) h.types.splice(i, 1);
    ui.saveHabit(h); ui.render();
  };
  ui.changes.habitNote = function (el) { var h = habit(el.getAttribute('data-id')); h.note = el.value.trim(); ui.saveHabit(h); };
  ui.acts.habitMove = function (el) {
    var list = L.sortedHabits(S.data).filter(function (h) { return !h.hidden; }), id = el.getAttribute('data-id'), dir = Number(el.getAttribute('data-dir'));
    var i = list.map(function (h) { return h.id; }).indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    var t = list[i]; list[i] = list[j]; list[j] = t;
    list.forEach(function (h, k) { h.order = k + 1; DB.saveHabit(h); });
    ui.render();
  };
  ui.acts.habitHide = function (el) {
    var id = el.getAttribute('data-id'), h = habit(id);
    ui.modal('<p>Delete <strong>' + esc(h.name) + '</strong>? It disappears from the Today screen, the calendar and the percentages.</p>' +
      '<p><strong>Keep history</strong> hides the habit and keeps every tick already saved. You can show it again.</p>' +
      '<p><strong>Delete history too</strong> also removes every tick, skip and reason saved for this habit on every day. A safety copy is made first.</p>' +
      '<div class="stack"><button type="button" class="btn primary" data-act="habitHideDo" data-id="' + id + '" data-mode="keep">Hide and keep history</button>' +
      '<button type="button" class="btn danger" data-act="habitHideDo" data-id="' + id + '" data-mode="wipe">Delete history too</button><button type="button" class="btn" data-act="closeModal">Cancel</button></div>', 'Delete this habit?');
  };
  ui.acts.habitHideDo = function (el) {
    var id = el.getAttribute('data-id'), mode = el.getAttribute('data-mode'), h = habit(id);
    ui.closeModal();
    function hide() { h.hidden = true; ui.saveHabit(h); ui.render(); ui.toast('Habit hidden.'); }
    if (mode === 'keep') { hide(); return; }
    ui.makeSafety('Before deleting history of ' + h.name).then(function () {
      Object.keys(S.data.days).forEach(function (k) {
        var r = S.data.days[k], ch = false;
        if (r.status && r.status[id] !== undefined) { delete r.status[id]; ch = true; }
        if (r.skipReason && r.skipReason[id] !== undefined) { delete r.skipReason[id]; ch = true; }
        if (r.auto && r.auto[id] !== undefined) { delete r.auto[id]; ch = true; }
        if (id === 'meals' && r.meals && Object.keys(r.meals).length) { r.meals = {}; ch = true; }
        if (ch) DB.saveDay(r);
      });
      hide();
    });
  };
  ui.acts.habitShow = function (el) { var h = habit(el.getAttribute('data-id')); h.hidden = false; ui.saveHabit(h); ui.render(); };
  ui.acts.addHabit = function () {
    var name = doc.getElementById('nh-name').value.trim(), types = DATA.DAY_TYPES.filter(function (t) { return doc.getElementById('nh-' + t).checked; });
    delete S.errors.set;
    if (!name) S.errors.set = 'Enter a name for the habit.';
    else if (!types.length) S.errors.set = 'Choose at least one day type for the habit.';
    if (S.errors.set) { ui.render(); return; }
    var id = 'x' + Date.now().toString(36), maxOrder = Math.max.apply(null, S.data.habits.map(function (x) { return x.order; }));
    var hb = { id: id, name: name, enabled: true, hidden: false, order: maxOrder + 1, types: types, note: '', custom: true };
    S.data.habits.push(hb); ui.saveHabit(hb);
    types.forEach(function (t) {
      S.data.schedule[t].push({ id: 'r' + Date.now().toString(36) + t, t: null, t2: null, text: name, items: [{ habit: id }], src: 'custom', on: true, group: 'all' });
      ui.saveSchedule(t);
    });
    ui.render(); ui.toast('Habit added. It shows under All day. Edit its row in Schedule to give it a time.');
  };

  /* ---------- schedule ---------- */
  function schedulePage() {
    var d = S.data, type = S.schedType, rows = d.schedule[type];
    var h = '<button type="button" class="btn small" data-act="settingsBack">Back to Settings</button><h1>Schedule</h1><p class="muted">Edit the text and times of each row, switch rows off, or add a note row. Rows marked + were suggested by the app, and you can switch them off.</p>' + sErr();
    h += '<div class="chips-row" role="group" aria-label="Day type">' + DATA.DAY_TYPES.map(function (t) {
      return '<button type="button" class="chip' + (t === type ? ' sel' : '') + '" data-act="schedType" data-type="' + t + '"' + (t === type ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' + DATA.DAY_TYPE_LABELS[t] + '</button>';
    }).join('') + '</div>';
    rows.forEach(function (r, i) {
      var ticks = r.items.map(function (it) { return it.label || (L.habitById(d, it.habit) || { name: it.habit }).name; }).join(', ');
      h += '<section class="card srow" aria-label="Row ' + (i + 1) + '">' +
        '<label class="check"><input type="checkbox" data-chg="rowOn" data-id="' + r.id + '"' + (r.on ? ' checked' : '') + '><span>Show this row' + (r.src === 'suggested' ? ' <span class="badge">' + ui.icon.plus + '<span class="sr-only">Suggested row</span></span>' : '') + (r.src === 'assumed' ? ' <span class="tag">Assumed</span>' : '') + '</span></label>' +
        '<label class="field"><span>Text</span><input type="text" maxlength="200" value="' + esc(r.text) + '" data-chg="rowText" data-id="' + r.id + '"></label>' +
        '<div class="grid2"><label class="field"><span>Time (optional)</span><input type="time" value="' + D.toInputTime(r.t) + '" data-chg="rowTime" data-id="' + r.id + '" data-which="t"></label>' +
        '<label class="field"><span>Until (optional)</span><input type="time" value="' + D.toInputTime(r.t2) + '" data-chg="rowTime" data-id="' + r.id + '" data-which="t2"></label></div>' +
        '<p class="muted small">' + (ticks ? 'Ticks: ' + esc(ticks) + '.' : 'Information row, nothing to tick.') + '</p>' +
        '<div class="btn-row"><button type="button" class="btn small" data-act="rowMove" data-id="' + r.id + '" data-dir="-1"' + (i === 0 ? ' disabled' : '') + ' aria-label="Move row ' + (i + 1) + ' up">Move up</button>' +
        '<button type="button" class="btn small" data-act="rowMove" data-id="' + r.id + '" data-dir="1"' + (i === rows.length - 1 ? ' disabled' : '') + ' aria-label="Move row ' + (i + 1) + ' down">Move down</button>' +
        (r.src === 'custom' ? '<button type="button" class="btn small" data-act="rowDel" data-id="' + r.id + '">Delete row</button>' : '') + '</div></section>';
    });
    h += '<section class="card"><h2>Add a note row</h2><label class="field"><span>Text</span><input type="text" id="nr-text" maxlength="200"></label><div class="grid2"><label class="field"><span>Time (optional)</span><input type="time" id="nr-time"></label>' +
      '<label class="field"><span>Shown under</span><select id="nr-group"><option value="morning">Morning</option><option value="day">Day</option><option value="evening">Evening</option><option value="all">All day</option></select></label></div>' +
      '<button type="button" class="btn primary" data-act="addRow">Add row</button></section>';
    h += '<section class="card"><button type="button" class="btn" data-act="resetSchedule">Put this day type back to my notebook schedule</button></section>';
    return h;
  }
  function row(id) { return S.data.schedule[S.schedType].filter(function (r) { return r.id === id; })[0]; }
  ui.acts.schedType = function (el) { S.schedType = el.getAttribute('data-type'); ui.render(); };
  ui.changes.rowOn = function (el) { row(el.getAttribute('data-id')).on = el.checked; ui.saveSchedule(S.schedType); ui.render(); };
  ui.changes.rowText = function (el) {
    var r = row(el.getAttribute('data-id')), v = el.value.trim();
    delete S.errors.set;
    if (!v) { S.errors.set = 'A row needs some text.'; ui.render(); return; }
    r.text = v; ui.saveSchedule(S.schedType); ui.render();
  };
  ui.changes.rowTime = function (el) {
    var r = row(el.getAttribute('data-id')), which = el.getAttribute('data-which'), tm = el.value === '' ? null : D.parseTime(el.value);
    delete S.errors.set;
    if (el.value !== '' && tm === null) { S.errors.set = 'Enter a time like 05:30.'; ui.render(); return; }
    if (which === 't2' && tm !== null && (r.t === null || tm <= r.t)) { S.errors.set = 'The end time must be after the start time. Set the start time first.'; ui.render(); return; }
    if (which === 't' && tm === null) r.t2 = null;
    if (which === 't' && tm !== null && r.t2 !== null && r.t2 <= tm) r.t2 = null;
    r[which] = tm;
    ui.saveSchedule(S.schedType); ui.render();
  };
  ui.acts.rowMove = function (el) {
    var rows = S.data.schedule[S.schedType], i = rows.map(function (r) { return r.id; }).indexOf(el.getAttribute('data-id')), j = i + Number(el.getAttribute('data-dir'));
    if (i < 0 || j < 0 || j >= rows.length) return;
    var t = rows[i]; rows[i] = rows[j]; rows[j] = t;
    ui.saveSchedule(S.schedType); ui.render();
  };
  ui.acts.rowDel = function (el) {
    var rows = S.data.schedule[S.schedType], id = el.getAttribute('data-id');
    var r = row(id);
    if (!r || r.src !== 'custom') return;
    var i = rows.indexOf(r); rows.splice(i, 1);
    ui.saveSchedule(S.schedType); ui.render();
  };
  ui.acts.addRow = function () {
    var text = doc.getElementById('nr-text').value.trim(), tv = doc.getElementById('nr-time').value, g = doc.getElementById('nr-group').value;
    delete S.errors.set;
    if (!text) { S.errors.set = 'Enter some text for the row.'; ui.render(); return; }
    S.data.schedule[S.schedType].push({ id: 'r' + Date.now().toString(36), t: tv ? D.parseTime(tv) : null, t2: null, text: text, items: [], src: 'custom', on: true, group: g });
    ui.saveSchedule(S.schedType); ui.render();
  };
  ui.acts.resetSchedule = function () {
    var type = S.schedType;
    ui.confirm({
      title: 'Put this schedule back?', yes: 'Put it back', danger: true,
      body: '<p>This replaces every row of the ' + esc(DATA.DAY_TYPE_LABELS[type]) + ' schedule with the notebook version, including its times. Your own note rows and habits you added to this day type are removed from it. Ticks you already saved are not touched.</p>',
      onYes: function () { S.data.schedule[type] = DATA.defaultSchedule()[type]; applyWake(S.data); ui.saveSchedule(type); ui.render(); }
    });
  };

  /* ---------- backup and data ---------- */
  function daysAgoText(d) {
    var s = d.settings;
    if (!s.lastBackup) return 'You have not made a backup yet.';
    var n = D.diffDays(s.lastBackup, ui.today());
    return 'Last backup: ' + (n <= 0 ? 'today' : n === 1 ? '1 day ago' : n + ' days ago') + ' (' + D.fmt(s.lastBackup) + ').';
  }
  function backupPage() {
    var d = S.data;
    var h = '<button type="button" class="btn small" data-act="settingsBack">Back to Settings</button><h1>Backup and data</h1>';
    h += '<section class="card"><h2>Back up</h2><p>' + esc(daysAgoText(d)) + '</p><p class="muted">Your data lives only on this phone. A backup file protects it if you clear browser data, uninstall, lose the phone or change phones.</p>' +
      '<div class="stack"><button type="button" class="btn primary" data-act="backupNowBtn">Back up now</button><button type="button" class="btn" data-act="backupDownload">Download backup file</button><button type="button" class="btn" data-act="csv">Export as CSV</button></div></section>';
    h += '<section class="card"><h2>Restore from backup</h2><p class="muted">Choose a file named routine-tracker-backup-....json. You see what it contains before anything changes.</p>' +
      '<button type="button" class="btn" data-act="pickRestore">Restore from backup</button><input type="file" id="restore-file" accept=".json,application/json" hidden data-chg="restoreFile"></section>';
    h += '<section class="card"><h2>Safety copies</h2><p class="muted">The app makes one automatically before a restore, a reset or a large delete. Copies are kept for at least 7 days.</p>';
    if (!S.safety.length) h += '<p>No safety copies yet.</p>';
    else h += '<ul class="notes">' + S.safety.map(function (e) {
      return '<li><strong>' + esc(stamp(e.createdAt)) + '</strong><div class="muted small">' + esc(e.reason) + '</div><button type="button" class="btn small" data-act="restoreSafety" data-id="' + e.id + '">Go back to this copy</button></li>';
    }).join('') + '</ul>';
    h += '</section><section class="card"><h2>Reset everything</h2><p class="muted">Deletes all data on this phone and starts again with your notebook routine. You must type a word to confirm.</p><button type="button" class="btn danger" data-act="resetAll">Reset everything</button></section>';
    return h;
  }
  ui.acts.backupNowBtn = function () { ui.backupNow(); };

  /* ---------- about ---------- */
  function aboutPage() {
    var d = S.data, per = S.persisted;
    var h = '<button type="button" class="btn small" data-act="settingsBack">Back to Settings</button><h1>About and storage</h1>';
    h += '<section class="card"><h2>Storage</h2><dl class="stats"><div><dt>Where data is kept</dt><dd>' + (DB.getMode() === 'idb' ? 'On this phone (IndexedDB)' : 'Memory only (not saved)') + '</dd></div>' +
      '<div><dt>Protected from automatic clean-up</dt><dd>' + (per === true ? 'Yes, granted' : per === false ? 'Not granted' : 'Not available here') + '</dd></div>' +
      '<div><dt>Space used</dt><dd id="usage">Checking</dd></div></dl>' +
      (per !== true ? '<p class="muted">The browser has not promised to keep this data if the phone runs low on space. Installing the app to the home screen and making backups reduces the risk.</p>' : '') + '</section>';
    h += '<section class="card"><h2>App</h2><dl class="stats"><div><dt>Version</dt><dd>' + esc(root.RT_VERSION || 'unknown') + '</dd></div><div><dt>Data format version</dt><dd>' + DATA.SCHEMA_VERSION + '</dd></div></dl>' +
      '<button type="button" class="btn" data-act="checkUpdate">Check for update</button></section>';
    h += '<section class="card"><h2>What this app cannot do</h2><ul class="plain"><li>It cannot read the phone step counter or the screen time total. You type the numbers or tick the habits.</li>' +
      '<li>It cannot ring or notify while it is fully closed. Open it, or use the calendar file in Alarms and alerts, which your phone calendar rings for you.</li>' +
      '<li>It cannot back itself up. Use Back up now.</li></ul></section>';
    h += '<section class="card"><h2>Demo mode</h2><p class="muted">See a full calendar using sample data in a separate copy. Your real data is not touched.</p><button type="button" class="btn" data-act="enterDemo">Open demo mode</button></section>';
    return h;
  }
  ui.acts.checkUpdate = function () { if (ui.checkUpdate) ui.checkUpdate(); };

  ui.afterRender = function () {
    var u = doc.getElementById('usage');
    if (u) DB.estimate().then(function (e) {
      var el = doc.getElementById('usage');
      if (el) el.textContent = e && typeof e.usage === 'number' ? (e.usage < 1048576 ? Math.max(1, Math.round(e.usage / 1024)) + ' KB' : (e.usage / 1048576).toFixed(1) + ' MB') : 'Not available';
    });
  };

  /* ---------- index ---------- */
  ui.views.settings = function () {
    switch (S.settingsPage) {
      case 'general': return generalPage();
      case 'habits': return habitsPage();
      case 'schedule': return schedulePage();
      case 'alarms': return ui.alarmsPage();
      case 'backup': return backupPage();
      case 'about': return aboutPage();
    }
    var d = S.data;
    var items = [['general', 'General', 'Plan dates, targets, day types, theme, time format'], ['habits', 'Habits', 'Rename, turn on or off, reorder, add your own'],
      ['schedule', 'Schedule', 'Rows and times for each day type'], ['alarms', 'Alarms and alerts', 'Alarm at each time, heads-up 30 minutes before, calendar file'], ['backup', 'Backup and data', daysAgoText(d)], ['about', 'About and storage', 'Version, storage status, update, demo mode']];
    return '<h1>Settings</h1><ul class="menu">' + items.map(function (i) {
      return '<li><button type="button" class="menu-btn" data-act="settingsOpen" data-page="' + i[0] + '"><strong>' + i[1] + '</strong><span class="muted">' + esc(i[2]) + '</span></button></li>';
    }).join('') + '</ul>';
  };
  ui.acts.settingsOpen = function (el) { S.settingsPage = el.getAttribute('data-page'); S.errors = {}; ui._resetScroll = true; ui.render(); root.scrollTo && root.scrollTo(0, 0); };
  ui.acts.settingsBack = function () { S.settingsPage = null; S.errors = {}; ui._resetScroll = true; ui.render(); };
})(typeof self !== 'undefined' ? self : globalThis);
