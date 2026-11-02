/* today.js: the Today screen (schedule, ticks, skip, log card, week strip). */
(function (root) {
  'use strict';
  var RT = root.RT, ui = RT.ui, S = ui.S, D = RT.dates, L = RT.logic, DATA = RT.data, esc = ui.esc;
  var doc = root.document;
  S.drafts = {};

  var GROUPS = [['morning', 'Morning'], ['day', 'Day'], ['evening', 'Evening'], ['all', 'All day']];
  var SRC_LABEL = { suggested: 'Suggested row', assumed: 'Assumed from your notes', changed: 'Changed from your notes' };

  function rowItems(d, type, row) {
    return row.items.filter(function (i) { return L.appliesOn(L.habitById(d, i.habit), type); });
  }
  function rowVisible(d, type, row) {
    if (!row.on) return false;
    return row.items.length === 0 || rowItems(d, type, row).length > 0;
  }
  function itemStatus(d, date, item) {
    if (item.habit === 'meals' && item.meal) {
      var r = d.days[date];
      if (r && r.status && r.status.meals === 'skipped') return 'skipped';
      return r && r.meals && r.meals[item.meal] ? 'done' : null;
    }
    return L.habitStatus(d, date, item.habit);
  }
  function itemLabel(d, item) {
    if (item.label) return item.label;
    var h = L.habitById(d, item.habit);
    return h ? h.name : item.habit;
  }
  function rowStatus(d, date, items) {
    var done = 0, skipped = 0;
    items.forEach(function (i) { var s = itemStatus(d, date, i); if (s === 'done') done++; else if (s === 'skipped') skipped++; });
    if (items.length && done === items.length) return 'done';
    if (items.length && skipped === items.length) return 'skipped';
    if (items.length && done + skipped === items.length) return 'done';
    return null;
  }
  function badge(row) {
    if (row.src === 'suggested') return ' <span class="badge" title="Suggested row. You can switch it off in Settings.">' + ui.icon.plus + '<span class="sr-only">Suggested row</span></span>';
    if (row.src === 'assumed') return ' <span class="tag">Assumed</span>';
    return '';
  }
  function skipReasonOf(r, habit) { return r && r.skipReason && r.skipReason[habit] ? r.skipReason[habit] : ''; }

  function chkButton(d, date, item, status, editable) {
    var label = itemLabel(d, item) + ': ' + (status === 'done' ? 'done' : status === 'skipped' ? 'skipped' : 'not done');
    return '<button type="button" class="chk ' + (status || '') + '" role="checkbox" aria-checked="' + (status === 'done' ? 'true' : status === 'skipped' ? 'mixed' : 'false') + '" aria-label="' + esc(label) + '"' +
      ' data-act="tick" data-date="' + date + '" data-habit="' + item.habit + '"' + (item.meal ? ' data-meal="' + item.meal + '"' : '') +
      ' data-key="tick-' + item.habit + (item.meal || '') + '"' + (editable ? '' : ' aria-disabled="true"') + '>' +
      (status === 'done' ? ui.icon.check : status === 'skipped' ? ui.icon.dash : '') + '</button>';
  }
  function chipButton(d, date, item, status, editable) {
    var label = itemLabel(d, item);
    return '<button type="button" class="chip-chk ' + (status || '') + '" role="checkbox" aria-checked="' + (status === 'done' ? 'true' : status === 'skipped' ? 'mixed' : 'false') + '"' +
      ' data-act="tick" data-date="' + date + '" data-habit="' + item.habit + '"' + (item.meal ? ' data-meal="' + item.meal + '"' : '') +
      ' data-key="tick-' + item.habit + (item.meal || '') + '"' + (editable ? '' : ' aria-disabled="true"') + '>' +
      '<span class="box">' + (status === 'done' ? ui.icon.check : status === 'skipped' ? ui.icon.dash : '') + '</span>' +
      '<span class="lbl">' + esc(label) + '<span class="sr-only">: ' + (status === 'done' ? 'done' : status === 'skipped' ? 'skipped' : 'not done') + '</span></span>' +
      (status === 'skipped' ? '<span class="st">Skipped</span>' : '') + '</button>';
  }

  function timerHtml(row) {
    if (!row.timer) return '';
    if (S.timer && S.timer.end > Date.now()) {
      return '<div class="timer"><span class="mono" data-timer role="timer" aria-label="Bathroom timer">' + timerText() + '</span> ' +
        '<button type="button" class="btn small" data-act="stopTimer">Stop timer</button></div>';
    }
    return '<div class="timer"><button type="button" class="btn small" data-act="startTimer">Start 15-minute timer</button></div>';
  }
  function timerText() {
    var left = Math.max(0, Math.ceil((S.timer.end - Date.now()) / 1000));
    return Math.floor(left / 60) + ':' + D.pad(left % 60);
  }
  ui.timerText = timerText;

  function mealsLine(d, date, type) {
    var req = L.requiredMeals(d, type), r = d.days[date], n = 0;
    req.forEach(function (m) { if (r && r.meals && r.meals[m]) n++; });
    return 'Meals today: ' + n + ' of ' + req.length;
  }

  function renderRow(d, date, type, row, today, nowMin, editable) {
    var items = rowItems(d, type, row), isToday = date === today;
    var st = rowStatus(d, date, items), r = d.days[date];
    var time = D.fmtRange(row.t, row.t2, ui.use24());
    var cls = 'row' + (st ? ' ' + st : '') + (items.length === 0 ? ' info' : '') + (row.timer && !items.length ? ' hint' : '');
    var end = row.t2 !== null && row.t2 !== undefined ? row.t2 : row.t;
    var sub = '';
    if (!st && items.length && isToday && end !== null && end !== undefined && end < nowMin) sub = '<span class="sub">earlier</span>';
    else if (!st && items.length && date < today && editable) sub = '<span class="sub">Not done</span>';
    if (st === 'skipped' || items.some(function (i) { return itemStatus(d, date, i) === 'skipped'; })) {
      var why = '';
      items.forEach(function (i) { var w = skipReasonOf(r, i.habit); if (w && !why) why = w; });
      if (items.length === 1) sub = '<span class="sub">Skipped' + (why ? ': ' + esc(why) : '') + '</span>';
    }
    var hasMeal = items.some(function (i) { return i.meal; });
    var cyc = items.some(function (i) { return i.habit === 'skill'; }) && ui.cycleLine ? ui.cycleLine(date) : '';
    var body = '<div class="text">' + esc(row.text) + badge(row) + '</div>' + (hasMeal ? '<div class="sub">' + mealsLine(d, date, type) + '</div>' : '') + cyc + sub;
    var ctl = '';
    if (items.length === 1) ctl = chkButton(d, date, items[0], itemStatus(d, date, items[0]), editable);
    var multi = '';
    if (items.length > 1) multi = '<div class="chips">' + items.map(function (i) { return chipButton(d, date, i, itemStatus(d, date, i), editable); }).join('') + '</div>';
    var more = items.length ? '<button type="button" class="more" data-act="skipMenu" data-date="' + date + '" data-row="' + row.id + '" aria-label="More options for ' + esc(row.text) + '">' + ui.icon.more + '</button>' : '';
    var attrs = ' data-date="' + date + '" data-row="' + row.id + '"';
    if (items.length === 1 && editable) attrs += ' data-act="rowTap" data-habit="' + items[0].habit + '"' + (items[0].meal ? ' data-meal="' + items[0].meal + '"' : '');
    if (items.length && editable) attrs += ' data-longpress="skipMenu"';
    var src = SRC_LABEL[row.src] ? '<span class="sr-only">' + SRC_LABEL[row.src] + '</span>' : '';
    return '<li class="' + cls + '"' + attrs + '><div class="time mono">' + esc(time) + '</div><div class="body">' + src + body + timerHtml(row) + multi + '</div>' +
      '<div class="ctl">' + ctl + more + '</div></li>';
  }

  function upNext(d, date, type, rows, nowMin, editable) {
    var next = null, open = 0;
    rows.forEach(function (row) {
      var items = rowItems(d, type, row), st = rowStatus(d, date, items);
      var end = row.t2 !== null && row.t2 !== undefined ? row.t2 : row.t;
      if (row.t !== null && row.t !== undefined && !st) {
        if (!next && row.t >= nowMin) next = row;
        else if (items.length && end < nowMin) open++;
      }
    });
    var h = '<section class="card upnext" aria-labelledby="un-h"><h2 id="un-h">Up next</h2>';
    if (next) {
      var items = rowItems(d, type, next);
      h += '<p class="big"><span class="mono">' + esc(D.fmtRange(next.t, next.t2, ui.use24())) + '</span> ' + esc(next.text) + '</p>';
      if (items.length === 1 && editable) h += '<button type="button" class="btn primary" data-act="tick" data-date="' + date + '" data-habit="' + items[0].habit + '"' + (items[0].meal ? ' data-meal="' + items[0].meal + '"' : '') + '>Mark done</button>';
    } else {
      h += '<p>Nothing more is scheduled for today.</p>';
    }
    if (open) h += '<p class="muted">' + open + (open === 1 ? ' earlier row is' : ' earlier rows are') + ' still open.</p>';
    return h + '</section>';
  }

  function weekStrip(d, date, today) {
    var dates = L.weekDates(date, d.settings.weekStart);
    var h = '<section class="card" aria-labelledby="wk-h"><h2 id="wk-h">This week</h2><div class="weekstrip">';
    dates.forEach(function (x) {
      var s = L.dayStats(d, x), lv = L.level(s), inPlan = ui.inPlan(x), future = x > today;
      var pct = future || !inPlan ? '' : (s.pct === null ? '0' : s.pct);
      var lab = D.fmt(x) + (inPlan ? (future ? ', not started' : ', ' + (s.pct === null ? 0 : s.pct) + ' percent done') : ', outside the plan');
      h += '<button type="button" class="wk lvl-' + (future || !inPlan ? 0 : lv) + (x === date ? ' sel' : '') + (x === today ? ' today' : '') + '"' +
        (inPlan ? ' data-act="openDate" data-date="' + x + '"' : ' disabled') + ' aria-label="' + esc(lab) + '"' + (x === date ? ' aria-current="date"' : '') + '>' +
        '<span class="w">' + D.weekdayName(x, true).slice(0, 2) + '</span><span class="n">' + +x.slice(8) + '</span><span class="p">' + (pct === '' ? '&nbsp;' : pct + '%') + '</span></button>';
    });
    h += '</div><label class="datepick"><span>Go to date</span><input type="date" min="' + d.settings.startDate + '" max="' + d.settings.endDate + '" value="' + date + '" data-chg="pickDate"></label>';
    var ws = L.weekSummary(d, date, today);
    h += '<p class="muted">Ticks done: ' + ws.done + ' of ' + ws.possible + '.' + (ws.best ? ' Best day: ' + D.fmtShort(ws.best.date) + ' (' + ws.best.pct + '%).' : '') +
      (ws.weighIn ? ' Weigh-in: ' + ws.weighIn.weight + ' kg on ' + D.fmtShort(ws.weighIn.date) + '.' : '') + '</p></section>';
    return h;
  }

  function field(id, label, value, opts) {
    opts = opts || {};
    var err = S.errors[opts.errKey || id];
    var v = S.drafts[id] !== undefined ? S.drafts[id] : (value === null || value === undefined ? '' : value);
    return '<label class="field"><span>' + esc(label) + '</span><input id="f-' + id + '" type="text" inputmode="' + (opts.mode || 'decimal') + '" autocomplete="off" value="' + esc(v) + '" data-chg="log" data-field="' + (opts.field || id) + '" data-date="' + opts.date + '"' +
      (opts.disabled ? ' disabled' : '') + (err ? ' aria-invalid="true" aria-describedby="err-' + (opts.errKey || id) + '"' : '') + '></label>';
  }
  function logCard(d, date, editable) {
    var r = d.days[date] || {}, dis = !editable, s = d.settings;
    var h = '<section class="card" aria-labelledby="log-h"><h2 id="log-h">Log for today</h2>';
    h += '<p class="muted">All fields are optional. Steps and screen time are typed by you. A web app cannot read them from the phone.</p>';
    if (dis) h += '<p class="muted">This day has not started, so it cannot be changed yet.</p>';
    h += '<div class="grid2">';
    h += field('weight', 'Weight (kg)', r.weight, { date: date, disabled: dis });
    h += field('page', 'Page reached in the book', r.page, { date: date, disabled: dis, mode: 'numeric' });
    h += field('steps', 'Steps', r.steps, { date: date, disabled: dis, mode: 'numeric' });
    h += '</div>';
    ['weight', 'page', 'steps'].forEach(function (k) { if (S.errors[k]) h += '<p class="err" id="err-' + k + '" role="alert">' + esc(S.errors[k]) + '</p>'; });
    var hrs = typeof r.screenMin === 'number' ? Math.floor(r.screenMin / 60) : '', mins = typeof r.screenMin === 'number' ? r.screenMin % 60 : '';
    h += '<div class="grid2"><div><span class="lbl-s">Screen time</span><div class="inline">' +
      field('hours', 'Hours', hrs, { date: date, disabled: dis, mode: 'numeric', field: 'screen', errKey: 'screen' }) +
      field('minutes', 'Minutes', mins, { date: date, disabled: dis, mode: 'numeric', field: 'screen', errKey: 'screen' }) + '</div></div></div>';
    if (S.errors.screen) h += '<p class="err" id="err-screen" role="alert">' + esc(S.errors.screen) + '</p>';
    if (s.foodLog) {
      h += '<div class="grid2">' + field('calories', 'Calories', r.calories, { date: date, disabled: dis, mode: 'numeric' }) +
        field('protein', 'Protein (g)', r.protein, { date: date, disabled: dis, mode: 'numeric' }) + '</div>';
      ['calories', 'protein'].forEach(function (k) { if (S.errors[k]) h += '<p class="err" id="err-' + k + '" role="alert">' + esc(S.errors[k]) + '</p>'; });
    }
    h += '<label class="field"><span>Note</span><textarea id="f-note" rows="3" maxlength="2000" data-chg="log" data-field="note" data-date="' + date + '"' + (dis ? ' disabled' : '') + '>' + esc(r.note || '') + '</textarea></label>';
    var d2 = d.goals.book;
    if (typeof r.page === 'number' && date >= d2.startDate) h += '<p class="muted">' + (L.minimumMet(d, date) ? 'Minimum met: at least 1 page this day.' : 'Minimum of 1 page not reached on this day.') + '</p>';
    return h + '</section>';
  }

  ui.views.today = function () {
    var d = S.data, s = d.settings, today = ui.today(), date = S.date;
    if (date < s.startDate) date = S.date = s.startDate;
    if (date > s.endDate) date = S.date = s.endDate;
    var type = L.dayTypeOf(d, date), stats = L.dayStats(d, date), editable = ui.canEdit(date);
    var rows = (d.schedule[type] || []).filter(function (r) { return rowVisible(d, type, r); });
    var nowMin = D.minutesNow(new Date());
    var n = L.planDayNumber(d, date), total = L.planLength(d);
    var dayText = n < 1 ? 'Before day 1' : n > total ? 'Day ' + n + ' (plan extended)' : 'Day ' + n + ' of ' + total;
    var h = '';

    var weekend = type !== 'office';
    h += '<div class="seg" role="group" aria-label="Which routine to follow on this day">' +
      '<button type="button" data-act="setMode" data-mode="week" data-date="' + date + '" aria-pressed="' + (!weekend) + '"' + (ui.inPlan(date) ? '' : ' disabled') + '>Weekdays</button>' +
      '<button type="button" data-act="setMode" data-mode="weekend" data-date="' + date + '" aria-pressed="' + weekend + '"' + (ui.inPlan(date) ? '' : ' disabled') + '>Weekend</button></div>';
    h += '<div class="alertsrow">' + ui.alertsButton() + '</div>';
    h += '<header class="daybar"><button type="button" class="icon-btn" data-act="prevDay" aria-label="Previous day"' + (date <= s.startDate ? ' disabled' : '') + '>' + ui.icon.left + '</button>' +
      '<div class="dtitle"><h1>' + esc(D.fmt(date, true)) + '</h1></div>' +
      '<button type="button" class="icon-btn" data-act="nextDay" aria-label="Next day"' + (date >= s.endDate ? ' disabled' : '') + '>' + ui.icon.right + '</button></header>';
    h += '<div class="chips-row"><button type="button" class="chip" data-act="dayType" data-date="' + date + '" aria-label="Day type: ' + DATA.DAY_TYPE_LABELS[type] + '. Tap to change.">' + DATA.DAY_TYPE_LABELS[type] + ' <span aria-hidden="true">&#9662;</span></button>' +
      '<span class="chip plain">' + dayText + '</span>' +
      (date !== today ? '<button type="button" class="chip" data-act="backToToday">Back to today</button>' : '<span class="chip plain">Today</span>') + '</div>';

    h += '<div class="progress-box"><div class="prow"><strong id="prog-text">' + stats.done + ' of ' + stats.possible + ' done</strong>' + (stats.skipped ? '<span class="muted"> (' + stats.skipped + ' skipped)</span>' : '') + '</div>' +
      ui.bar(stats.pct, 'Habits done today') + '</div>';
    if (stats.complete) h += '<p class="complete" role="status">Day complete. Every habit for this day is done.</p>';

    /* gentle cards */
    var days = (date === today) ? daysSinceBackup(d, today) : null;
    if (date === today && days !== null && days > s.backupReminderDays) {
      h += '<section class="card quiet"><p>' + (s.lastBackup ? 'It has been ' + days + ' days since your last backup.' : 'You have not made a backup yet.') + ' A backup protects your ticks if the phone is lost or its browser data is cleared.</p><button type="button" class="btn" data-act="backupNow">Back up now</button></section>';
    }
    if (date === today && D.dow(today) === s.weighInDay && !(d.days[today] && typeof d.days[today].weight === 'number') && s.weighInDismissed !== today) {
      h += '<section class="card quiet"><p>Weigh-in day. Add your weight in the log below when you are ready.</p><button type="button" class="btn" data-act="dismissWeighIn">Not now</button></section>';
    }
    var body = L.bodyStats(d);
    var stepsH = L.habitById(d, 'steps');
    if (body.reached && s.stepsDecision === null && stepsH && stepsH.enabled) {
      h += '<section class="card quiet"><p>Your logged weight is at or below your target of ' + d.goals.body.targetWeight + ' kg. Your notebook says to walk 10,000 steps a day until you reach your intended weight. Keep the 10K steps habit, or retire it?</p>' +
        '<div class="btn-row"><button type="button" class="btn" data-act="keepSteps">Keep 10K steps</button><button type="button" class="btn" data-act="retireSteps">Retire 10K steps</button></div></section>';
    }

    if (date === today && rows.length) h += upNext(d, date, type, rows, nowMin, editable);
    if (type !== 'office') {
      h += '<aside class="pinned" aria-label="Pinned note"><div><strong>Note</strong><p>' + esc(s.holidayNote || 'No note yet.') + '</p></div><button type="button" class="btn small" data-act="editNote">Edit note</button></aside>';
    }
    if (!editable && ui.inPlan(date)) h += '<p class="muted pad">This day has not started. You can see its schedule, and tick it when it arrives.</p>';

    GROUPS.forEach(function (g) {
      var list = rows.filter(function (r) { return r.group === g[0]; });
      if (!list.length) return;
      h += '<section class="group" aria-labelledby="g-' + g[0] + '"><h2 id="g-' + g[0] + '">' + g[1] + '</h2><ul class="rows">' +
        list.map(function (r) { return renderRow(d, date, type, r, today, nowMin, editable); }).join('') + '</ul></section>';
    });
    h += logCard(d, date, editable);
    h += weekStrip(d, date, today);
    if (d.days[date] && editable) h += '<div class="btn-row"><button type="button" class="btn small" data-act="clearDay" data-date="' + date + '">Clear this day</button></div>';
    return h;
  };

  function daysSinceBackup(d, today) {
    var s = d.settings;
    if (s.lastBackup) return D.diffDays(s.lastBackup, today);
    var since = D.diffDays(s.startDate, today);
    return since > s.backupReminderDays ? since : null;
  }

  /* ---------- actions ---------- */
  function progressMessage(date) {
    var st = L.dayStats(S.data, date);
    return st.done + ' of ' + st.possible + ' done.' + (st.complete ? ' Day complete.' : '');
  }
  function toggle(date, habit, meal) {
    if (!ui.canEdit(date)) { ui.toast('This day has not started yet. You can tick it when it arrives.'); return; }
    var snap = ui.snapshot(date), r = ui.ensureDay(date), msg;
    if (!r.auto) r.auto = {};
    if (!r.skipReason) r.skipReason = {};
    if (habit === 'meals' && meal) {
      if (r.status.meals === 'skipped') { delete r.status.meals; delete r.skipReason.meals; }
      if (r.meals[meal]) { delete r.meals[meal]; msg = 'Marked not done.'; } else { r.meals[meal] = true; msg = 'Marked done.'; }
    } else {
      if (r.status[habit] === 'done') { delete r.status[habit]; msg = 'Marked not done.'; }
      else { r.status[habit] = 'done'; delete r.skipReason[habit]; msg = 'Marked done.'; }
      delete r.auto[habit];
    }
    ui.saveDay(date);
    S.focusKey = 'tick-' + habit + (meal || '');
    ui.render();
    ui.toast(msg, function () { ui.restoreSnapshot(date, snap); ui.render(); });
    ui.announce(msg + ' ' + progressMessage(date));
    if (msg === 'Marked done.') ui.haptic();
  }
  ui.acts.tick = function (el) { toggle(el.getAttribute('data-date'), el.getAttribute('data-habit'), el.getAttribute('data-meal')); };
  ui.acts.rowTap = function (el) { toggle(el.getAttribute('data-date'), el.getAttribute('data-habit'), el.getAttribute('data-meal')); };

  /* Skip menu */
  ui.acts.skipMenu = function (el) {
    var date = el.getAttribute('data-date'), rowId = el.getAttribute('data-row'), d = S.data, type = L.dayTypeOf(d, date);
    if (!ui.canEdit(date)) { ui.toast('This day has not started yet.'); return; }
    var row = (d.schedule[type] || []).filter(function (r) { return r.id === rowId; })[0];
    if (!row) return;
    var items = rowItems(d, type, row), r = d.days[date], h = '<p class="muted">Skipped is not the same as not done. A skipped habit is left out of the percentage and does not break a streak.</p>';
    items.forEach(function (it, i) {
      var st = itemStatus(d, date, it);
      var hid = it.habit;
      h += '<div class="skipitem"><strong>' + esc(itemLabel(d, it)) + '</strong>' +
        '<label class="field"><span>Reason (optional)</span><input type="text" id="why-' + i + '" maxlength="120" value="' + esc(skipReasonOf(r, hid)) + '" placeholder="For example: ill, travelling"></label>' +
        (st === 'skipped'
          ? '<button type="button" class="btn" data-act="doSkip" data-date="' + date + '" data-habit="' + hid + '" data-i="' + i + '" data-mode="clear">Mark as not skipped</button>'
          : '<button type="button" class="btn primary" data-act="doSkip" data-date="' + date + '" data-habit="' + hid + '" data-i="' + i + '" data-mode="skip">Mark as skipped</button>') + '</div>';
    });
    h += '<div class="btn-row"><button type="button" class="btn" data-act="closeModal">Close</button></div>';
    ui.modal(h, row.text);
  };
  ui.acts.doSkip = function (el) {
    var date = el.getAttribute('data-date'), habit = el.getAttribute('data-habit'), mode = el.getAttribute('data-mode');
    var why = (doc.getElementById('why-' + el.getAttribute('data-i')) || { value: '' }).value.trim();
    var snap = ui.snapshot(date), r = ui.ensureDay(date);
    if (!r.skipReason) r.skipReason = {};
    if (mode === 'skip') { r.status[habit] = 'skipped'; if (why) r.skipReason[habit] = why; else delete r.skipReason[habit]; if (r.auto) delete r.auto[habit]; }
    else { delete r.status[habit]; delete r.skipReason[habit]; }
    ui.saveDay(date);
    ui.closeModal(); ui.render();
    var msg = mode === 'skip' ? 'Marked as skipped.' : 'Skip removed.';
    ui.toast(msg, function () { ui.restoreSnapshot(date, snap); ui.render(); });
    ui.announce(msg + ' ' + progressMessage(date));
  };

  /* Day type */
  ui.acts.dayType = function (el) {
    var date = el.getAttribute('data-date'), d = S.data, cur = L.dayTypeOf(d, date), def = d.settings.defaultTypes[D.dow(date)];
    var h = '<p class="muted">The schedule for ' + esc(D.fmt(date)) + ' changes at once. Anything you already ticked is kept.</p><div class="stack">';
    DATA.DAY_TYPES.forEach(function (t) {
      h += '<button type="button" class="btn ' + (t === cur ? 'primary' : '') + '" data-act="setType" data-date="' + date + '" data-type="' + t + '"' + (t === cur ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' + DATA.DAY_TYPE_LABELS[t] + (t === def ? ' (default for ' + D.weekdayName(date, false) + ')' : '') + '</button>';
    });
    h += '</div><div class="btn-row"><button type="button" class="btn" data-act="closeModal">Close</button></div>';
    ui.modal(h, 'Day type for ' + D.fmtShort(date));
  };
  function applyType(date, t) {
    var d = S.data;
    if (!ui.inPlan(date)) return;
    var def = d.settings.defaultTypes[D.dow(date)];
    if (t === def) {
      if (d.days[date] && d.days[date].type) { delete d.days[date].type; ui.saveDay(date); }
    } else { var r = ui.ensureDay(date); r.type = t; ui.saveDay(date); }
    ui.render();
    ui.announce('Day type is now ' + DATA.DAY_TYPE_LABELS[t] + '. ' + progressMessage(date));
  }
  ui.acts.setType = function (el) {
    var date = el.getAttribute('data-date'), t = el.getAttribute('data-type');
    ui.closeModal();
    applyType(date, t);
  };
  /* Weekdays / Weekend switch at the top of Today. Only this date changes. */
  ui.acts.setMode = function (el) {
    var date = el.getAttribute('data-date'), mode = el.getAttribute('data-mode'), wd = D.dow(date);
    if (mode === 'week') { applyType(date, 'office'); return; }
    if (wd === 6) { applyType(date, 'sat'); return; }
    if (wd === 0) { applyType(date, 'hol'); return; }
    ui.modal('<p>' + esc(D.fmt(date, true)) + ' is a weekday. Which weekend routine should it follow? Anything you already ticked is kept.</p><div class="stack">' +
      '<button type="button" class="btn primary" data-act="setType" data-date="' + date + '" data-type="sat">Saturday routine</button>' +
      '<button type="button" class="btn primary" data-act="setType" data-date="' + date + '" data-type="hol">Sunday routine</button>' +
      '<button type="button" class="btn" data-act="closeModal">Cancel</button></div>', 'Weekend routine for this day');
  };

  /* Navigation */
  ui.acts.prevDay = function () { move(-1); };
  ui.acts.nextDay = function () { move(1); };
  function move(n) {
    var nd = D.addDays(S.date, n);
    if (!ui.inPlan(nd)) return;
    S.date = nd; S.errors = {}; S.drafts = {}; ui.render();
  }
  ui.acts.backToToday = function () { S.date = ui.today(); S.errors = {}; S.drafts = {}; ui.render(); };
  ui.acts.openDate = function (el) { var x = el.getAttribute('data-date'); S.errors = {}; S.drafts = {}; S.date = x; S.view = 'today'; ui._resetScroll = false; ui.render(); };
  ui.changes.pickDate = function (el) {
    var v = el.value;
    if (D.isValid(v) && ui.inPlan(v)) { S.date = v; S.errors = {}; S.drafts = {}; ui.render(); }
    else { ui.toast('Pick a date inside the plan, from ' + D.fmtShort(S.data.settings.startDate) + ' to ' + D.fmtShort(S.data.settings.endDate) + '.'); ui.render(); }
  };

  /* Notes, prompts */
  ui.acts.editNote = function () {
    ui.modal('<label class="field"><span>Note shown on holiday days</span><textarea id="holnote" rows="4" maxlength="500">' + esc(S.data.settings.holidayNote) + '</textarea></label>' +
      '<div class="btn-row"><button type="button" class="btn" data-act="closeModal">Cancel</button><button type="button" class="btn primary" data-act="saveNote">Save note</button></div>', 'Edit note');
  };
  ui.acts.saveNote = function () {
    S.data.settings.holidayNote = doc.getElementById('holnote').value.trim();
    ui.saveSettings(); ui.closeModal(); ui.render();
  };
  ui.acts.dismissWeighIn = function () { S.data.settings.weighInDismissed = ui.today(); ui.saveSettings(); ui.render(); };
  ui.acts.keepSteps = function () { S.data.settings.stepsDecision = 'keep'; ui.saveSettings(); ui.render(); ui.toast('The 10K steps habit stays.'); };
  ui.acts.retireSteps = function () {
    var h = L.habitById(S.data, 'steps');
    if (h) { h.enabled = false; ui.saveHabit(h); }
    S.data.settings.stepsDecision = 'retired'; ui.saveSettings(); ui.render();
    ui.toast('The 10K steps habit is retired. You can turn it on again in Settings.');
  };

  /* Bathroom timer */
  ui.acts.startTimer = function () {
    S.timer = { end: Date.now() + 15 * 60000 };
    try { root.localStorage.setItem('rt-timer', String(S.timer.end)); } catch (e) { /* ignore */ }
    ui.render();
  };
  ui.acts.stopTimer = function () {
    S.timer = null;
    try { root.localStorage.removeItem('rt-timer'); } catch (e) { /* ignore */ }
    ui.render();
  };

  /* Log card: validate, save at once, tick steps / screen / read when the numbers meet the goal. */
  function setAuto(r, habit, shouldBeDone) {
    if (!r.auto) r.auto = {};
    if (shouldBeDone) { if (r.status[habit] !== 'done') { r.status[habit] = 'done'; r.auto[habit] = true; } }
    else if (r.auto[habit] && r.status[habit] === 'done') { delete r.status[habit]; delete r.auto[habit]; }
    else delete r.auto[habit];
  }
  ui.changes.log = function (el) {
    var date = el.getAttribute('data-date'), f = el.getAttribute('data-field'), d = S.data;
    if (!ui.canEdit(date)) return;
    delete S.errors[f]; delete S.drafts[el.id.replace('f-', '')];
    var r, res;
    if (f === 'note') {
      r = ui.ensureDay(date);
      var txt = el.value.trim();
      if (txt) r.note = txt; else delete r.note;
    } else if (f === 'screen') {
      var hv = doc.getElementById('f-hours').value, mv = doc.getElementById('f-minutes').value;
      var rh = L.validate('hours', hv, d), rm = L.validate('minutes', mv, d);
      if (!rh.ok || !rm.ok) {
        S.errors.screen = (!rh.ok ? rh.error : rm.error);
        S.drafts.hours = hv; S.drafts.minutes = mv;
        ui.render(); return;
      }
      r = ui.ensureDay(date);
      if (rh.value === null && rm.value === null) { delete r.screenMin; setAuto(r, 'screen', false); }
      else {
        r.screenMin = (rh.value || 0) * 60 + (rm.value || 0);
        setAuto(r, 'screen', r.screenMin < d.settings.screenLimitMin);
      }
    } else {
      res = L.validate(f, el.value, d);
      if (!res.ok) { S.errors[f] = res.error; S.drafts[f] = el.value; ui.render(); return; }
      r = ui.ensureDay(date);
      var key = { weight: 'weight', page: 'page', steps: 'steps', calories: 'calories', protein: 'protein' }[f];
      if (res.value === null) delete r[key]; else r[key] = res.value;
      if (f === 'steps') setAuto(r, 'steps', res.value !== null && res.value >= d.settings.stepGoal);
      if (f === 'page') setAuto(r, 'read', res.value !== null && res.value >= 1);
    }
    ui.saveDay(date);
    ui.render();
    ui.announce('Saved. ' + progressMessage(date));
  };

  ui.acts.backupNow = function () { if (ui.backupNow) ui.backupNow(); };

  /* ---------- Calendar ---------- */
  ui.views.calendar = function () {
    var d = S.data, s = d.settings, today = ui.today();
    var months = D.monthsBetween(s.startDate, s.endDate);
    if (!S.calMonth || months.indexOf(S.calMonth) < 0) {
      var tk = D.monthKey(today);
      S.calMonth = months.indexOf(tk) >= 0 ? tk : (today < s.startDate ? months[0] : months[months.length - 1]);
    }
    var ym = S.calMonth, idx = months.indexOf(ym);
    var h = '<h1>Calendar</h1>';
    h += '<div class="monthbar"><button type="button" class="icon-btn" data-act="prevMonth" aria-label="Previous month"' + (idx <= 0 ? ' disabled' : '') + '>' + ui.icon.left + '</button>' +
      '<h2 class="mname">' + D.monthName(ym) + ' ' + ym.slice(0, 4) + '</h2>' +
      '<button type="button" class="icon-btn" data-act="nextMonth" aria-label="Next month"' + (idx >= months.length - 1 ? ' disabled' : '') + '>' + ui.icon.right + '</button></div>';
    h += '<div class="chips-row" role="group" aria-label="Choose a month">';
    months.forEach(function (m) {
      h += '<button type="button" class="chip' + (m === ym ? ' sel' : '') + '" data-act="gotoMonth" data-month="' + m + '"' + (m === ym ? ' aria-current="true"' : '') + ' aria-label="' + D.monthName(m) + ' ' + m.slice(0, 4) + '">' + D.monthName(m, true) + '</button>';
    });
    h += '</div><div class="chips-row"><button type="button" class="btn small" data-act="jumpToday">Jump to today</button></div>';

    var first = D.monthFirst(ym), last = D.monthLast(ym), off = (D.dow(first) - s.weekStart + 7) % 7;
    h += '<div class="calgrid" role="grid" aria-label="' + D.monthName(ym) + ' ' + ym.slice(0, 4) + '"><div class="calhead" role="row">';
    for (var i = 0; i < 7; i++) {
      var dn = D.DAYS[(s.weekStart + i) % 7];
      h += '<span role="columnheader" aria-label="' + dn + '">' + dn.slice(0, 2) + '</span>';
    }
    h += '</div><div class="calbody">';
    for (i = 0; i < off; i++) h += '<span class="cell blank" aria-hidden="true"></span>';
    D.range(first, last).forEach(function (x) {
      var st = L.dayStats(d, x), lv = L.level(st), inPlan = ui.inPlan(x), future = x > today, r = d.days[x] || {};
      var dnum = +x.slice(8);
      if (!inPlan) { h += '<span class="cell off" role="gridcell"><span class="dn">' + dnum + '</span></span>'; return; }
      var pct = future ? '' : (st.pct === null ? '0%' : st.pct + '%');
      var marks = '';
      if (st.complete) marks += '<span title="Every habit done">&#10003;</span>';
      if (st.type !== 'office') marks += '<span title="Holiday type">H</span>';
      if (typeof r.weight === 'number') marks += '<span title="Weigh-in logged">W</span>';
      if (r.note) marks += '<span title="Has a note">N</span>';
      var lab = D.fmt(x) + ', ' + DATA.DAY_TYPE_LABELS[st.type] + ', ' + (future ? 'not started' : (st.pct === null ? 0 : st.pct) + ' percent done') +
        (x === today ? ', today' : '') + (st.complete ? ', complete' : '') + (typeof r.weight === 'number' ? ', weight logged' : '') + (r.note ? ', has a note' : '');
      h += '<button type="button" role="gridcell" class="cell lvl-' + (future ? 0 : lv) + (x === today ? ' today' : '') + (future ? ' future' : '') + '" data-act="openDate" data-date="' + x + '" aria-label="' + esc(lab) + '">' +
        '<span class="dn">' + dnum + '</span><span class="pc">' + pct + '</span><span class="mk">' + marks + '</span></button>';
    });
    h += '</div></div>';

    h += '<div class="legend" aria-label="Legend"><span class="lg"><i class="sw lvl-0"></i>0%</span><span class="lg"><i class="sw lvl-1"></i>1 to 39%</span><span class="lg"><i class="sw lvl-2"></i>40 to 69%</span><span class="lg"><i class="sw lvl-3"></i>70 to 99%</span><span class="lg"><i class="sw lvl-4"></i>100%</span></div>' +
      '<p class="muted small">Ring: today. &#10003; every habit done. H holiday type. W weight logged. N has a note. Dates that have not started show no percentage.</p>';

    var ms = L.monthSummary(d, ym, today);
    h += '<section class="card" aria-labelledby="ms-h"><h2 id="ms-h">Month summary</h2>';
    if (ms.possible === 0) h += '<p>No days from this month have started counting yet.</p>';
    else h += '<dl class="stats"><div><dt>Overall completion</dt><dd>' + ui.pctText(ms.pct) + '</dd></div><div><dt>Complete days</dt><dd>' + ms.completeDays + '</dd></div><div><dt>Days with any tick</dt><dd>' + ms.anyTick + '</dd></div><div><dt>Longest run of complete days</dt><dd>' + ms.longestRun + '</dd></div></dl>';
    h += '</section>';

    h += '<section class="card" aria-labelledby="mh-h"><h2 id="mh-h">Habits this month</h2><ul class="hl">';
    L.sortedHabits(d).filter(function (hh) { return hh.enabled && !hh.hidden; }).forEach(function (hh) {
      var rate = L.habitRate(d, hh.id, first, last, today), stk = L.habitStreaks(d, hh.id, today);
      h += '<li><div class="hrow"><span>' + esc(hh.name) + '</span><span class="mono">' + (rate.possible ? rate.done + ' of ' + rate.possible + ' days' : 'No days yet') + '</span></div>' +
        ui.bar(rate.pct, hh.name + ' this month') + '<div class="muted small">Current streak: ' + stk.current + (stk.current === 1 ? ' day' : ' days') + '</div></li>';
    });
    h += '</ul></section>';
    return h;
  };
  ui.acts.prevMonth = function () { S.calMonth = D.addMonths(S.calMonth, -1); ui.render(); };
  ui.acts.nextMonth = function () { S.calMonth = D.addMonths(S.calMonth, 1); ui.render(); };
  ui.acts.gotoMonth = function (el) { S.calMonth = el.getAttribute('data-month'); ui.render(); };
  ui.acts.jumpToday = function () { S.calMonth = D.monthKey(ui.today()); ui.render(); };
})(typeof self !== 'undefined' ? self : globalThis);
