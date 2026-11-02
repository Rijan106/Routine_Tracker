/* logic.js: percentages, streaks, summaries, goal maths, validation, backup and CSV.
   Pure functions. They take the data object and return plain values. */
(function (root) {
  'use strict';
  var RT = root.RT = root.RT || {};
  var D = RT.dates, DATA = RT.data;

  /* ---------- day types and habits ---------- */
  function dayTypeOf(d, date) {
    var r = d.days[date];
    if (r && r.type && DATA.DAY_TYPES.indexOf(r.type) >= 0) return r.type;
    return d.settings.defaultTypes[D.dow(date)] || 'office';
  }
  function sortedHabits(d) {
    return d.habits.slice().sort(function (a, b) { return a.order - b.order; });
  }
  function habitById(d, id) {
    for (var i = 0; i < d.habits.length; i++) if (d.habits[i].id === id) return d.habits[i];
    return null;
  }
  function appliesOn(h, type) { return !!h && h.enabled && !h.hidden && h.types.indexOf(type) >= 0; }
  function activeHabits(d, type) { return sortedHabits(d).filter(function (h) { return appliesOn(h, type); }); }

  function requiredMeals(d, type) {
    var out = [];
    (d.schedule[type] || []).forEach(function (r) {
      if (!r.on) return;
      r.items.forEach(function (i) {
        if (i.habit === 'meals' && i.meal && out.indexOf(i.meal) < 0) out.push(i.meal);
      });
    });
    return out;
  }

  /* 'done', 'skipped' or null. The meals habit is derived from its sub-ticks. */
  function habitStatus(d, date, habitId) {
    var r = d.days[date];
    if (!r) return null;
    var st = r.status || {};
    if (habitId === 'meals') {
      if (st.meals === 'skipped') return 'skipped';
      var req = requiredMeals(d, dayTypeOf(d, date));
      if (req.length === 0) return st.meals === 'done' ? 'done' : null;
      var all = req.every(function (m) { return r.meals && r.meals[m]; });
      return all ? 'done' : null;
    }
    return st[habitId] === 'done' || st[habitId] === 'skipped' ? st[habitId] : null;
  }

  function dayStats(d, date) {
    var type = dayTypeOf(d, date);
    var hs = activeHabits(d, type), done = 0, skipped = 0;
    hs.forEach(function (h) {
      var s = habitStatus(d, date, h.id);
      if (s === 'done') done++; else if (s === 'skipped') skipped++;
    });
    var possible = hs.length - skipped;
    var complete = possible > 0 && done === possible;
    var pct = null;
    if (possible > 0) pct = complete ? 100 : Math.min(99, Math.round(100 * done / possible));
    return { type: type, applicable: hs.length, done: done, skipped: skipped, possible: possible, pct: pct, complete: complete };
  }
  /* 5 shading levels, 0 to 4 */
  function level(stats) {
    if (!stats || stats.pct === null || stats.pct === 0) return 0;
    if (stats.complete) return 4;
    if (stats.pct < 40) return 1;
    if (stats.pct < 70) return 2;
    return 3;
  }

  /* ---------- date windows ---------- */
  function lastStatDay(d, today) { return D.min(today, d.settings.endDate); }
  function statDays(d, from, to, today) {
    var a = D.max(from, d.settings.dayOne), b = D.min(to, lastStatDay(d, today));
    return D.range(a, b);
  }
  function planDayNumber(d, date) {
    var n = D.diffDays(d.settings.dayOne, date) + 1;
    return n;
  }
  function planLength(d) { return D.diffDays(d.settings.dayOne, d.settings.endDate) + 1; }

  /* ---------- habit streaks and rates ---------- */
  function habitState(d, h, date, today) {
    var type = dayTypeOf(d, date);
    if (h.types.indexOf(type) < 0) return 'na';
    var s = habitStatus(d, date, h.id);
    if (s === 'done') return 'done';
    if (s === 'skipped') return 'skip';
    return date >= today ? 'pending' : 'miss';
  }
  /* Done extends. Missed breaks. Skipped, not-applicable and a not-yet-ticked today do neither. */
  function habitStreaks(d, habitId, today) {
    var h = habitById(d, habitId);
    if (!h) return { current: 0, best: 0 };
    var days = statDays(d, d.settings.dayOne, d.settings.endDate, today);
    var states = days.map(function (x) { return habitState(d, h, x, today); });
    var best = 0, run = 0, i;
    for (i = 0; i < states.length; i++) {
      if (states[i] === 'done') { run++; if (run > best) best = run; }
      else if (states[i] === 'miss') run = 0;
    }
    var cur = 0;
    for (i = states.length - 1; i >= 0; i--) {
      if (states[i] === 'done') cur++;
      else if (states[i] === 'miss') break;
    }
    return { current: cur, best: best };
  }
  /* Done out of days that counted. Skipped days are left out. Today only counts once done. */
  function habitRate(d, habitId, from, to, today) {
    var h = habitById(d, habitId), done = 0, poss = 0;
    if (!h) return { done: 0, possible: 0, pct: null };
    statDays(d, from, to, today).forEach(function (x) {
      var st = habitState(d, h, x, today);
      if (st === 'done') { done++; poss++; } else if (st === 'miss') poss++;
    });
    return { done: done, possible: poss, pct: poss ? Math.round(100 * done / poss) : null };
  }

  /* ---------- summaries ---------- */
  function weekDates(date, startsOn) {
    var s = D.weekStart(date, startsOn);
    return D.range(s, D.addDays(s, 6));
  }
  function rangeSummary(d, dates, today) {
    var done = 0, poss = 0, completeDays = 0, anyTick = 0, run = 0, longest = 0, best = null;
    dates.forEach(function (x) {
      var s = dayStats(d, x);
      done += s.done; poss += s.possible;
      if (s.done > 0) anyTick++;
      if (s.complete) { completeDays++; run++; if (run > longest) longest = run; } else run = 0;
      if (s.pct !== null && (best === null || s.pct > best.pct)) best = { date: x, pct: s.pct };
    });
    return { done: done, possible: poss, pct: poss ? Math.round(100 * done / poss) : null,
      completeDays: completeDays, anyTick: anyTick, longestRun: longest, best: best };
  }
  function weekSummary(d, date, today) {
    var dates = statDays(d, weekDates(date, d.settings.weekStart)[0], weekDates(date, d.settings.weekStart)[6], today);
    var sum = rangeSummary(d, dates, today), weigh = null;
    weekDates(date, d.settings.weekStart).forEach(function (x) {
      if (d.days[x] && typeof d.days[x].weight === 'number') weigh = { date: x, weight: d.days[x].weight };
    });
    sum.weighIn = weigh;
    return sum;
  }
  function monthSummary(d, ym, today) {
    return rangeSummary(d, statDays(d, D.monthFirst(ym), D.monthLast(ym), today), today);
  }
  function weeklyBars(d, today) {
    var out = [], s = D.weekStart(d.settings.dayOne, d.settings.weekStart), last = D.weekStart(d.settings.endDate, d.settings.weekStart);
    while (s <= last) {
      var days = statDays(d, s, D.addDays(s, 6), today);
      var sum = rangeSummary(d, days, today);
      out.push({ start: s, pct: sum.pct, done: sum.done, possible: sum.possible });
      s = D.addDays(s, 7);
    }
    return out;
  }
  /* Average completion per weekday over finished days (before today). */
  function weekdayStats(d, today) {
    var sums = [0, 0, 0, 0, 0, 0, 0], cnt = [0, 0, 0, 0, 0, 0, 0], n = 0;
    statDays(d, d.settings.dayOne, d.settings.endDate, today).forEach(function (x) {
      if (x >= today) return;
      var s = dayStats(d, x);
      if (s.pct === null) return;
      sums[D.dow(x)] += s.pct; cnt[D.dow(x)]++; n++;
    });
    if (n < 14) return null;
    var best = null, worst = null;
    for (var i = 0; i < 7; i++) {
      if (!cnt[i]) continue;
      var avg = Math.round(sums[i] / cnt[i]);
      if (best === null || avg > best.avg) best = { dow: i, avg: avg };
      if (worst === null || avg < worst.avg) worst = { dow: i, avg: avg };
    }
    return { best: best, worst: worst };
  }
  /* Habits with the lowest whole-plan rate, once a week of data exists. */
  function slippingHabits(d, today, count) {
    if (statDays(d, d.settings.dayOne, d.settings.endDate, today).length < 7) return [];
    var list = [];
    sortedHabits(d).forEach(function (h) {
      if (!h.enabled || h.hidden) return;
      var r = habitRate(d, h.id, d.settings.dayOne, d.settings.endDate, today);
      if (r.pct !== null && r.possible >= 3) list.push({ habit: h, pct: r.pct });
    });
    list.sort(function (a, b) { return a.pct - b.pct; });
    return list.slice(0, count || 3).filter(function (x) { return x.pct < 100; });
  }

  /* ---------- weight ---------- */
  function weightPoints(d) {
    var out = [];
    Object.keys(d.days).sort().forEach(function (k) {
      var w = d.days[k].weight;
      if (typeof w === 'number') out.push({ date: k, weight: w });
    });
    return out;
  }
  function avgAround(points, date) {
    var from = D.addDays(date, -6), s = 0, n = 0;
    points.forEach(function (p) { if (p.date >= from && p.date <= date) { s += p.weight; n++; } });
    return n ? s / n : null;
  }
  function bodyStats(d) {
    var g = d.goals.body, pts = weightPoints(d), latest = pts.length ? pts[pts.length - 1] : null;
    var days = D.diffDays(g.startDate, g.targetDate);
    var res = {
      points: pts, latest: latest, needed: days > 0 ? (g.startWeight - g.targetWeight) / (days / 7) : null,
      lost: null, toGo: null, perWeek: null, projected: null, reached: false, late: false, proteinNote: false
    };
    if (!latest) return res;
    res.lost = g.startWeight - latest.weight;
    res.toGo = latest.weight - g.targetWeight;
    res.reached = latest.weight <= g.targetWeight;
    var span = D.diffDays(g.startDate, latest.date);
    if (span >= 7) res.perWeek = (g.startWeight - latest.weight) / (span / 7);
    if (!res.reached && res.perWeek !== null && res.perWeek > 0) {
      res.projected = D.addDays(latest.date, Math.ceil(res.toGo / res.perWeek * 7));
      res.late = res.projected > g.targetDate;
    }
    var a0 = avgAround(pts, latest.date), a1 = avgAround(pts, D.addDays(latest.date, -7)), a2 = avgAround(pts, D.addDays(latest.date, -14));
    if (a0 !== null && a1 !== null && a2 !== null && (a1 - a0) > 1 && (a2 - a1) > 1) res.proteinNote = true;
    return res;
  }
  /* Mifflin-St Jeor maintenance estimate and a target 300 to 500 kcal below. */
  function maintenanceKcal(weightKg, heightCm, age, sex, activity) {
    var mult = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 }[activity];
    if (!mult || !(weightKg > 0) || !(heightCm > 0) || !(age > 0) || (sex !== 'male' && sex !== 'female')) return null;
    var bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
    var m = Math.round(bmr * mult);
    return { bmr: Math.round(bmr), maintenance: m, targetLow: m - 500, targetHigh: m - 300 };
  }

  /* ---------- book ---------- */
  function bookStats(d, today) {
    var b = d.goals.book, page = 0, finishedOn = null;
    Object.keys(d.days).sort().forEach(function (k) {
      var p = d.days[k].page;
      if (k >= b.startDate && typeof p === 'number') {
        page = p;
        if (p >= b.totalPages && !finishedOn) finishedOn = k;
      }
    });
    var left = Math.max(0, b.totalPages - page);
    var from = D.max(today, b.startDate);
    var daysLeft = Math.max(0, D.diffDays(from, b.deadline) + 1);
    var need = daysLeft > 0 ? left / daysLeft : left;
    var span = D.diffDays(b.startDate, b.deadline) + 1;
    var before = Math.max(0, Math.min(span, D.diffDays(b.startDate, today)));
    var expected = span > 0 ? Math.round(b.totalPages * before / span) : 0;
    var diff = page - expected;
    return { page: page, left: left, daysLeft: daysLeft, need: need, expected: expected, diff: diff,
      finished: page >= b.totalPages, finishedOn: finishedOn };
  }
  function minimumMet(d, date) {
    var r = d.days[date];
    if (!r) return false;
    var b = d.goals.book;
    if (typeof r.page !== 'number' || date < b.startDate) return false;
    var prev = null;
    Object.keys(d.days).sort().forEach(function (k) {
      if (k < date && k >= b.startDate && typeof d.days[k].page === 'number') prev = d.days[k].page;
    });
    return prev === null ? r.page >= 1 : r.page - prev >= 1;
  }

  /* ---------- steps ---------- */
  function stepsStats(d, today) {
    var typed = [], reached = {};
    Object.keys(d.days).forEach(function (k) {
      var r = d.days[k];
      if (typeof r.steps === 'number') typed.push(r.steps);
    });
    var avg = typed.length ? Math.round(typed.reduce(function (a, b) { return a + b; }, 0) / typed.length) : null;
    var monthCount = {};
    Object.keys(d.days).forEach(function (k) {
      if (habitStatus(d, k, 'steps') === 'done') {
        var m = D.monthKey(k); monthCount[m] = (monthCount[m] || 0) + 1;
      }
    });
    return { average: avg, typedDays: typed.length, monthCount: monthCount, streaks: habitStreaks(d, 'steps', today) };
  }

  /* ---------- skill cycle ---------- */
  function cycleStats(d, cycle, today) {
    var dayNo = D.diffDays(cycle.start, today) + 1, end = D.addDays(cycle.start, 29);
    var practised = 0, minutes = 0;
    D.range(cycle.start, D.min(end, today)).forEach(function (x) {
      if (habitStatus(d, x, 'skill') === 'done') practised++;
      if (cycle.minutes && typeof cycle.minutes[x] === 'number') minutes += cycle.minutes[x];
    });
    return { dayNo: dayNo, end: end, practised: practised, minutes: minutes, due: dayNo >= 30, notStarted: dayNo < 1 };
  }

  /* ---------- validation of typed numbers. Empty is always allowed. ---------- */
  function isBlank(v) { return v === '' || v === null || v === undefined; }
  function num(v) { return typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.')); }
  function validate(kind, v, d) {
    if (isBlank(v)) return { ok: true, value: null };
    var n = num(v);
    if (!isFinite(n) || String(v).trim() === '') return { ok: false, error: 'Enter a number, or leave this empty.' };
    switch (kind) {
      case 'weight':
        if (n < 20 || n > 300) return { ok: false, error: 'Weight must be between 20 and 300 kg.' };
        return { ok: true, value: Math.round(n * 10) / 10 };
      case 'page': {
        var total = d && d.goals && d.goals.book ? d.goals.book.totalPages : 5000;
        if (n % 1 !== 0 || n < 0) return { ok: false, error: 'Page must be a whole number, 0 or more.' };
        if (n > total) return { ok: false, error: 'Page cannot be more than the book total (' + total + ' pages).' };
        return { ok: true, value: n };
      }
      case 'steps':
        if (n % 1 !== 0 || n < 0 || n > 100000) return { ok: false, error: 'Steps must be a whole number from 0 to 100,000.' };
        return { ok: true, value: n };
      case 'hours':
        if (n % 1 !== 0 || n < 0 || n > 24) return { ok: false, error: 'Hours must be a whole number from 0 to 24.' };
        return { ok: true, value: n };
      case 'minutes':
        if (n % 1 !== 0 || n < 0 || n > 59) return { ok: false, error: 'Minutes must be a whole number from 0 to 59.' };
        return { ok: true, value: n };
      case 'calories':
        if (n % 1 !== 0 || n < 0 || n > 20000) return { ok: false, error: 'Calories must be a whole number from 0 to 20,000.' };
        return { ok: true, value: n };
      case 'protein':
        if (n < 0 || n > 1000) return { ok: false, error: 'Protein must be between 0 and 1,000 g.' };
        return { ok: true, value: Math.round(n) };
      case 'sessionMinutes':
        if (n % 1 !== 0 || n < 0 || n > 1440) return { ok: false, error: 'Minutes must be a whole number from 0 to 1,440.' };
        return { ok: true, value: n };
    }
    return { ok: false, error: 'Unknown field.' };
  }

  /* ---------- backup, merge, CSV ---------- */
  function exportData(d, now) {
    return {
      app: 'routine-tracker', schemaVersion: DATA.SCHEMA_VERSION, exportedAt: (now || new Date()).toISOString(),
      settings: d.settings, habits: d.habits, schedule: d.schedule, days: d.days, goals: d.goals, skillCycles: d.skillCycles
    };
  }
  function summarize(d) {
    var keys = Object.keys(d.days).sort(), last = 0;
    keys.forEach(function (k) { if ((d.days[k].changed || 0) > last) last = d.days[k].changed; });
    return { first: keys[0] || null, last: keys[keys.length - 1] || null, dayCount: keys.length, lastChanged: last || null,
      cycles: d.skillCycles.length };
  }
  /* Check a backup file's text. Returns {ok:true, data, summary} or {ok:false, error}. Changes nothing. */
  function validateBackup(text) {
    var o;
    try { o = JSON.parse(text); } catch (e) { return { ok: false, error: 'This file is not a backup. It could not be read as JSON. Choose a file named routine-tracker-backup-....json.' }; }
    if (!o || typeof o !== 'object' || Array.isArray(o) || o.app !== 'routine-tracker') {
      return { ok: false, error: 'This file is not a Routine Tracker backup. Choose a file named routine-tracker-backup-....json.' };
    }
    if (typeof o.schemaVersion !== 'number' || o.schemaVersion < 0 || o.schemaVersion % 1 !== 0) {
      return { ok: false, error: 'This backup has no valid version number, so it was not imported.' };
    }
    if (o.schemaVersion > DATA.SCHEMA_VERSION) {
      return { ok: false, error: 'This backup was made by a newer version of the app. Update the app first, then try again.' };
    }
    if (o.schemaVersion >= 1) {
      var shape = { settings: 'object', habits: 'array', schedule: 'object', days: 'object', goals: 'object', skillCycles: 'array' };
      var missing = Object.keys(shape).filter(function (k) {
        var v = o[k];
        if (shape[k] === 'array') return !Array.isArray(v);
        return !v || typeof v !== 'object' || Array.isArray(v);
      })[0];
      if (missing) return { ok: false, error: 'This backup is damaged (the ' + missing + ' section is missing or not valid), so nothing was imported.' };
    }
    var data;
    try {
      delete o.app; delete o.exportedAt;
      data = DATA.migrate(o);
    } catch (e) { return { ok: false, error: 'This backup could not be upgraded to this version, so it was not imported.' }; }
    var bad = null;
    if (!data.settings || typeof data.settings !== 'object') bad = 'settings';
    else if (!Array.isArray(data.habits) || data.habits.some(function (h) { return !h || typeof h.id !== 'string' || typeof h.name !== 'string' || !Array.isArray(h.types); })) bad = 'habits';
    else if (DATA.DAY_TYPES.some(function (k) { return !Array.isArray(data.schedule[k]) || data.schedule[k].some(function (r) { return !r || typeof r.id !== 'string' || !Array.isArray(r.items); }); })) bad = 'schedule';
    else if (typeof data.days !== 'object' || Array.isArray(data.days) || Object.keys(data.days).some(function (k) { return !D.isValid(k) || typeof data.days[k] !== 'object' || data.days[k] === null; })) bad = 'days';
    else if (!data.goals || typeof data.goals !== 'object' || !data.goals.body || !data.goals.book) bad = 'goals';
    else if (data.skillCycles.some(function (c) { return !c || typeof c.id !== 'string' || !D.isValid(c.start); })) bad = 'skill cycles';
    else if (!D.isValid(data.settings.startDate) || !D.isValid(data.settings.dayOne) || !D.isValid(data.settings.endDate)) bad = 'plan dates';
    if (bad) return { ok: false, error: 'This backup is damaged (the ' + bad + ' section is not valid), so nothing was imported.' };
    return { ok: true, data: data, summary: summarize(data) };
  }
  /* Merge: days from the file replace mine only when changed more recently. Nothing is deleted. */
  function mergeData(cur, inc) {
    var out = DATA.copy(cur);
    Object.keys(inc.days).forEach(function (k) {
      var mine = out.days[k];
      if (!mine || (inc.days[k].changed || 0) > (mine.changed || 0)) out.days[k] = DATA.copy(inc.days[k]);
    });
    var ids = {};
    out.habits.forEach(function (h) { ids[h.id] = true; });
    inc.habits.forEach(function (h) { if (!ids[h.id]) out.habits.push(DATA.copy(h)); });
    var cyc = {};
    out.skillCycles.forEach(function (c) { cyc[c.id] = true; });
    inc.skillCycles.forEach(function (c) { if (!cyc[c.id]) out.skillCycles.push(DATA.copy(c)); });
    return DATA.normalize(out);
  }
  function csvCell(v) {
    if (v === null || v === undefined) return '';
    var s = String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCSV(d) {
    var hs = sortedHabits(d), dates = {};
    D.range(d.settings.startDate, d.settings.endDate).forEach(function (x) { dates[x] = true; });
    Object.keys(d.days).forEach(function (x) { dates[x] = true; });
    var head = ['date', 'weekday', 'day_type'].concat(hs.map(function (h) { return h.name; }),
      ['weight_kg', 'page', 'steps', 'screen_minutes', 'calories', 'protein_g', 'note']);
    var lines = [head.map(csvCell).join(',')];
    Object.keys(dates).sort().forEach(function (x) {
      var r = d.days[x] || {};
      var cells = [x, D.weekdayName(x, false), DATA.DAY_TYPE_LABELS[dayTypeOf(d, x)]];
      hs.forEach(function (h) { cells.push(habitStatus(d, x, h.id) || ''); });
      cells.push(r.weight, r.page, r.steps, r.screenMin, r.calories, r.protein, r.note);
      lines.push(cells.map(csvCell).join(','));
    });
    return lines.join('\r\n') + '\r\n';
  }

  RT.logic = {
    dayTypeOf: dayTypeOf, sortedHabits: sortedHabits, habitById: habitById, appliesOn: appliesOn,
    activeHabits: activeHabits, requiredMeals: requiredMeals, habitStatus: habitStatus,
    dayStats: dayStats, level: level, lastStatDay: lastStatDay, statDays: statDays,
    planDayNumber: planDayNumber, planLength: planLength, habitState: habitState,
    habitStreaks: habitStreaks, habitRate: habitRate, weekDates: weekDates, rangeSummary: rangeSummary,
    weekSummary: weekSummary, monthSummary: monthSummary, weeklyBars: weeklyBars,
    weekdayStats: weekdayStats, slippingHabits: slippingHabits, weightPoints: weightPoints,
    avgAround: avgAround, bodyStats: bodyStats, maintenanceKcal: maintenanceKcal, bookStats: bookStats,
    minimumMet: minimumMet, stepsStats: stepsStats, cycleStats: cycleStats, validate: validate,
    exportData: exportData, summarize: summarize, validateBackup: validateBackup,
    mergeData: mergeData, toCSV: toCSV
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = RT.logic;
})(typeof self !== 'undefined' ? self : globalThis);
