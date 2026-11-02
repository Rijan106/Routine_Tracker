/* alarms.js: alarms, heads-up alerts, the notification center and the calendar file.
   The first part is plain logic (also used by the tests). The second part is the screen and the timer.
   Honest limit: a web app can only ring or notify while it is open or recently open. The calendar file
   (made here) puts the same alerts into the phone's own calendar, which does ring when the app is closed. */
(function (root) {
  'use strict';
  var RT = root.RT = root.RT || {};
  var D = RT.dates, L = RT.logic;

  function cfg(d) {
    var a = (d.settings && d.settings.alarms) || {};
    return { on: !!a.on, lead: a.lead === undefined ? 30 : a.lead, atTime: a.atTime !== false, sound: a.sound !== false, vibrate: a.vibrate !== false, icsDays: a.icsDays || 14 };
  }

  /* All rows of the chosen day type that have a clock time and are switched on. */
  function timedRows(d, date) {
    var type = L.dayTypeOf(d, date), out = [];
    (d.schedule[type] || []).forEach(function (r) {
      if (!r.on || r.t === null || r.t === undefined) return;
      if (r.items.length) {
        var any = r.items.some(function (i) { return L.appliesOn(L.habitById(d, i.habit), type); });
        if (!any) return;
      }
      out.push({ id: r.id, t: r.t, t2: r.t2 === undefined ? null : r.t2, text: r.text, items: r.items, type: type });
    });
    return out.sort(function (a, b) { return a.t - b.t; });
  }

  /* True when every habit in the row is already done or skipped for that date. */
  function rowFinished(d, date, row) {
    var items = row.items.filter(function (i) { return L.appliesOn(L.habitById(d, i.habit), row.type); });
    if (!items.length) return false;
    var rec = d.days[date];
    return items.every(function (i) {
      if (i.habit === 'meals' && i.meal) return !!(rec && rec.status && rec.status.meals === 'skipped') || !!(rec && rec.meals && rec.meals[i.meal]);
      return L.habitStatus(d, date, i.habit) !== null;
    });
  }

  /* What should be announced right now. Returns [{kind:'ahead'|'now', row}]. */
  function due(d, date, nowMin) {
    var c = cfg(d), out = [];
    if (!c.on) return out;
    timedRows(d, date).forEach(function (r) {
      if (rowFinished(d, date, r)) return;
      if (c.lead > 0 && nowMin >= r.t - c.lead && nowMin < r.t) out.push({ kind: 'ahead', row: r });
      if (c.atTime && nowMin >= r.t && nowMin < r.t + 3) out.push({ kind: 'now', row: r });
    });
    return out;
  }

  function pad(n, w) { n = String(n); while (n.length < (w || 2)) n = '0' + n; return n; }
  function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function fold(line) {
    var out = [];
    while (line.length > 73) { out.push(line.slice(0, 73)); line = ' ' + line.slice(73); }
    out.push(line);
    return out.join('\r\n');
  }
  function stamp(date, min) { return date.replace(/-/g, '') + 'T' + pad(Math.floor(min / 60)) + pad(min % 60) + '00'; }

  /* A calendar file with one event per timed row for `days` days, each with two alerts. */
  function icsText(d, fromDate, days, nowMin, utcStamp, lead) {
    var L1 = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Routine Tracker//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:My routine'];
    var last = d.settings.endDate, count = 0;
    for (var i = 0; i < days; i++) {
      var date = D.addDays(fromDate, i);
      if (date > last) break;
      if (date < d.settings.startDate) continue;
      timedRows(d, date).forEach(function (r) {
        if (i === 0 && nowMin !== null && r.t <= nowMin) return;
        var end = r.t2 !== null && r.t2 > r.t ? r.t2 : r.t + 15;
        if (end > 1439) end = 1439;
        var ev = ['BEGIN:VEVENT', 'UID:rt-' + date + '-' + r.id + '@routine-tracker', 'DTSTAMP:' + utcStamp,
          'DTSTART:' + stamp(date, r.t), 'DTEND:' + stamp(date, end), 'SUMMARY:' + icsEscape(r.text.length > 70 ? r.text.slice(0, 67) + '...' : r.text)];
        if (r.text.length > 70) ev.push('DESCRIPTION:' + icsEscape(r.text));
        if (lead > 0) ev.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:In ' + lead + ' minutes', 'TRIGGER:-PT' + lead + 'M', 'END:VALARM');
        ev.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Now', 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
        L1 = L1.concat(ev); count++;
      });
    }
    L1.push('END:VCALENDAR');
    return { text: L1.map(fold).join('\r\n') + '\r\n', events: count };
  }

  RT.alarms = { cfg: cfg, timedRows: timedRows, rowFinished: rowFinished, due: due, icsText: icsText };

  /* ---------------------------------------------------------------- screen and timer */
  var ui = RT.ui;
  if (!ui || !root.document) return;
  var S = ui.S, esc = ui.esc, doc = root.document;
  var LOGKEY = 'rt-alerts';
  var audio = null, beepTimer = null, snoozed = [];

  function readLog() { try { var a = JSON.parse(root.localStorage.getItem(LOGKEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function writeLog(a) { try { root.localStorage.setItem(LOGKEY, JSON.stringify(a.slice(-60))); } catch (e) { /* ignore */ } }
  function unread() { return readLog().filter(function (x) { return !x.read; }).length; }
  ui.alertsUnread = unread;

  function tm(min) { return D.fmtTime(min, S.data.settings.timeFormat === '24'); }

  function unlockAudio() {
    try {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return;
      if (!audio) audio = new AC();
      if (audio.state === 'suspended') audio.resume();
    } catch (e) { /* ignore */ }
  }
  doc.addEventListener('pointerdown', unlockAudio, { passive: true });
  doc.addEventListener('keydown', unlockAudio);

  function beep(times) {
    if (!audio) return;
    try {
      for (var i = 0; i < times; i++) {
        var o = audio.createOscillator(), g = audio.createGain(), t0 = audio.currentTime + i * 0.3;
        o.type = 'sine'; o.frequency.value = 880; o.connect(g); g.connect(audio.destination);
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.4, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
        o.start(t0); o.stop(t0 + 0.25);
      }
    } catch (e) { /* ignore */ }
  }
  function stopRinging() { if (beepTimer) { clearInterval(beepTimer); beepTimer = null; } }
  function startRinging(c) {
    stopRinging();
    var n = 0;
    function go() {
      if (!doc.querySelector('[data-alarm]') || ++n > 60) { stopRinging(); return; }
      if (c.sound) beep(3);
      if (c.vibrate && root.navigator && root.navigator.vibrate) { try { root.navigator.vibrate([300, 150, 300]); } catch (e) { /* ignore */ } }
    }
    go(); beepTimer = setInterval(go, 2000);
  }

  function systemNotify(title, body, tag) {
    try {
      if (!root.Notification || root.Notification.permission !== 'granted') return;
      var opts = { body: body, tag: tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' };
      if (root.navigator.serviceWorker && root.navigator.serviceWorker.getRegistration) {
        root.navigator.serviceWorker.getRegistration().then(function (r) { if (r) r.showNotification(title, opts); else new root.Notification(title, opts); });
      } else new root.Notification(title, opts);
    } catch (e) { /* ignore */ }
  }

  function record(id, kind, date, row) {
    var log = readLog();
    if (log.some(function (x) { return x.id === id; })) return false;
    log.push({ id: id, kind: kind, date: date, t: row.t, text: row.text, at: Date.now(), read: false });
    writeLog(log);
    return true;
  }

  function ring(row, snooze) {
    var c = cfg(S.data), when = tm(row.t);
    var html = '<div data-alarm="1"><p class="alarm-big">' + esc(when) + '</p><p>' + esc(row.text) + '</p><div class="stack">' +
      '<button type="button" class="btn primary" data-act="alarmStop">Stop</button>' +
      '<button type="button" class="btn" data-act="alarmSnooze" data-id="' + esc(row.id) + '" data-t="' + row.t + '">Snooze 5 minutes</button></div></div>';
    ui.modal(html, snooze ? 'Alarm (snoozed)' : 'Alarm');
    ui.announce('Alarm. ' + when + '. ' + row.text);
    startRinging(c);
    systemNotify('Now: ' + when, row.text, 'rt-now-' + row.id);
  }

  function tick() {
    if (!S.data || S.fakeToday) return;
    var c = cfg(S.data);
    if (!c.on) return;
    var n = new Date(), date = ui.today(), nowMin = n.getHours() * 60 + n.getMinutes();
    var changed = false;
    due(S.data, date, nowMin).forEach(function (x) {
      var id = date + '|' + x.row.id + '|' + x.kind;
      if (!record(id, x.kind, date, x.row)) return;
      changed = true;
      if (x.kind === 'ahead') {
        var left = x.row.t - nowMin;
        ui.toast('In ' + left + ' min: ' + x.row.text);
        systemNotify('In ' + left + ' minutes (' + tm(x.row.t) + ')', x.row.text, 'rt-ahead-' + x.row.id);
        if (c.sound) beep(1);
      } else ring(x.row, false);
    });
    snoozed = snoozed.filter(function (s) {
      if (s.at > Date.now()) return true;
      ring(s.row, true); return false;
    });
    if (changed && S.view === 'today' && !ui.modalOpen()) ui.render();
  }
  ui.startAlarms = function () { setInterval(tick, 10000); setTimeout(tick, 1500); };
  ui.alarmTick = tick;

  ui.acts.alarmStop = function () { stopRinging(); ui.closeModal(); };
  ui.acts.alarmSnooze = function (el) {
    var row = { id: el.getAttribute('data-id'), t: Number(el.getAttribute('data-t')), text: (doc.querySelector('[data-alarm] p:nth-of-type(2)') || {}).textContent || '' };
    stopRinging(); ui.closeModal();
    snoozed.push({ at: Date.now() + 5 * 60000, row: row });
    ui.toast('Snoozed for 5 minutes. Keep the app open.');
  };

  /* ---- notification center ---- */
  var KIND = { ahead: 'Coming up', now: 'Now' };
  ui.acts.openAlerts = function () {
    var log = readLog().slice().reverse(), c = cfg(S.data);
    var h = '';
    if (!c.on) h += '<p class="muted">Alerts are off. Turn them on in Settings, Alarms and alerts.</p>';
    if (!log.length) h += '<p class="muted">Nothing yet. A heads-up appears here ' + c.lead + ' minutes before each timed item, and again at the time.</p>';
    else h += '<ul class="notes">' + log.map(function (x) {
      var at = new Date(x.at), clock = D.fmtTime(at.getHours() * 60 + at.getMinutes(), S.data.settings.timeFormat === '24');
      return '<li><strong>' + esc((KIND[x.kind] || '') + ': ' + tm(x.t)) + (x.read ? '' : ' (new)') + '</strong><div>' + esc(x.text) + '</div><div class="muted small">' + esc(D.fmtShort(x.date) + ', shown at ' + clock) + '</div></li>';
    }).join('') + '</ul>';
    h += '<div class="stack"><button type="button" class="btn" data-act="alertsClear">Clear list</button><button type="button" class="btn" data-act="closeModal">Close</button></div>';
    var l = readLog(); l.forEach(function (x) { x.read = true; }); writeLog(l);
    ui.modal(h, 'Notification center');
    if (S.view === 'today') { /* badge refreshes on the next render */ }
  };
  ui.acts.alertsClear = function () { writeLog([]); ui.closeModal(); ui.render(); ui.toast('List cleared.'); };

  ui.alertsButton = function () {
    var n = unread(), c = cfg(S.data);
    var label = 'Alerts' + (n ? ' (' + n + ' new)' : '');
    return '<button type="button" class="btn small alerts-btn" data-act="openAlerts" aria-label="Open notification center' + (n ? ', ' + n + ' new' : '') + '">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M6 17h12l-1.5-2v-4.5a4.5 4.5 0 0 0-9 0V15L6 17zM10 19a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> ' +
      esc(label) + (c.on ? '' : ' - off') + '</button>';
  };

  /* ---- settings page ---- */
  function chkA(label, key, on) { return '<label class="check"><input type="checkbox" data-chg="alset" data-key="' + key + '"' + (on ? ' checked' : '') + '><span>' + esc(label) + '</span></label>'; }
  function selA(label, key, opts, cur) {
    return '<label class="field"><span>' + esc(label) + '</span><select data-chg="alset" data-key="' + key + '">' +
      opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(o[0]) === String(cur) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></label>';
  }
  function permText() {
    if (!root.Notification) return 'Not available in this browser.';
    return { granted: 'Allowed', denied: 'Blocked (change it in the phone settings for this app)', 'default': 'Not asked yet' }[root.Notification.permission] || 'Unknown';
  }
  ui.alarmsPage = function () {
    var c = cfg(S.data);
    var h = '<button type="button" class="btn small" data-act="settingsBack">Back to Settings</button><h1>Alarms and alerts</h1>';
    h += '<section class="card"><h2>In the app</h2><p class="muted">Rings and notifies you from this schedule, so you do not set separate alarms. It only works while the app is open or was open a moment ago. For alerts that work with the app closed, use the calendar file below.</p>' +
      chkA('Turn alerts on', 'on', c.on) +
      selA('Heads-up before each timed item', 'lead', [[0, 'No heads-up'], [10, '10 minutes before'], [15, '15 minutes before'], [30, '30 minutes before'], [60, '1 hour before']], c.lead) +
      chkA('Ring an alarm at the time', 'atTime', c.atTime) + chkA('Play a sound', 'sound', c.sound) + chkA('Vibrate (Android only)', 'vibrate', c.vibrate) +
      '<p>Phone notifications: <strong>' + esc(permText()) + '</strong></p>' +
      '<div class="stack"><button type="button" class="btn" data-act="alertsAllow">Allow phone notifications</button><button type="button" class="btn" data-act="alertsTest">Test the alarm</button></div>' +
      '<p class="muted small">Items you already ticked or skipped do not ring. On an iPhone, phone notifications need the app added to the Home Screen first.</p></section>';
    h += '<section class="card"><h2>Calendar file (works with the app closed)</h2><p class="muted">Makes a file with every timed item as a calendar event, each with an alert ' + (c.lead ? c.lead + ' minutes before and ' : '') + 'at the time. Open the file on your phone and add it to a new calendar, so you can delete it in one tap later. Your own day types are used for each date. Make a new file after you change the schedule or a day type.</p>' +
      selA('How many days to include', 'icsDays', [[7, '7 days'], [14, '14 days'], [30, '30 days'], [60, '60 days']], c.icsDays) +
      '<button type="button" class="btn primary" data-act="alertsIcs">Create calendar file</button></section>';
    return h;
  };
  ui.changes.alset = function (el) {
    var key = el.getAttribute('data-key'), s = S.data.settings, v = el.type === 'checkbox' ? el.checked : el.value;
    s.alarms = s.alarms || {};
    if (key === 'lead' || key === 'icsDays') s.alarms[key] = Number(v); else s.alarms[key] = !!v;
    ui.saveSettings(); ui.render();
    if (key === 'on' && v) { unlockAudio(); ui.alarmTick(); }
  };
  ui.acts.alertsAllow = function () {
    if (!root.Notification) { ui.toast('This browser cannot show phone notifications.'); return; }
    root.Notification.requestPermission().then(function () { ui.render(); });
  };
  ui.acts.alertsTest = function () {
    unlockAudio();
    ring({ id: 'test', t: new Date().getHours() * 60 + new Date().getMinutes(), text: 'This is a test alarm.' }, false);
  };
  ui.acts.alertsIcs = function () {
    var d = S.data, c = cfg(d), n = new Date(), date = ui.today();
    var utc = n.getUTCFullYear() + pad(n.getUTCMonth() + 1) + pad(n.getUTCDate()) + 'T' + pad(n.getUTCHours()) + pad(n.getUTCMinutes()) + pad(n.getUTCSeconds()) + 'Z';
    var r = icsText(d, date, c.icsDays, n.getHours() * 60 + n.getMinutes(), utc, c.lead);
    if (!r.events) { ui.toast('There are no timed items in that period.'); return; }
    ui.download('my-routine-' + date + '.ics', r.text, 'text/calendar');
    ui.toast(r.events + ' events in the file. Open it to add them to your calendar.');
  };
})(typeof self !== 'undefined' ? self : globalThis);
