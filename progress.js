/* progress.js: the Progress tab. */
(function (root) {
  'use strict';
  var RT = root.RT, ui = RT.ui, S = ui.S, D = RT.dates, L = RT.logic, esc = ui.esc;

  function weeklyChart(bars) {
    var n = bars.length, W = 30 + n * 10, H = 130, top = 12, base = 100;
    var svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Bar chart of overall completion for each week of the plan. Each bar is one week. Bar height is the share of habits done.">';
    [0, 50, 100].forEach(function (v) {
      var y = base - (v / 100) * (base - top);
      svg += '<line x1="28" x2="' + W + '" y1="' + y + '" y2="' + y + '" class="gl"/><text x="24" y="' + (y + 4) + '" text-anchor="end" class="ax">' + v + '%</text>';
    });
    bars.forEach(function (b, i) {
      var x = 30 + i * 10, hgt = b.pct === null ? 2 : Math.max(1.5, (b.pct / 100) * (base - top));
      svg += '<rect x="' + x + '" y="' + (base - hgt) + '" width="7" height="' + hgt + '" class="' + (b.pct === null ? 'bar-none' : 'bar-on') + '"><title>Week of ' + D.fmtShort(b.start) + ': ' + (b.pct === null ? 'not started' : b.pct + '%') + '</title></rect>';
      if (i % 6 === 0) svg += '<text x="' + (x + 3) + '" y="' + (base + 16) + '" text-anchor="middle" class="ax">' + +b.start.slice(8) + ' ' + D.monthName(b.start.slice(0, 7), true) + '</text>';
    });
    return svg + '</svg>';
  }

  function heatmap(d, today) {
    var s = d.settings, ws = s.weekStart;
    var first = D.weekStart(s.dayOne, ws), last = D.weekStart(s.endDate, ws);
    var h = '<div class="heat" role="table" aria-label="Every day of the plan. Each cell shows the percentage of habits done."><div class="heat-h" role="row"><span></span>';
    for (var i = 0; i < 7; i++) h += '<span role="columnheader" aria-label="' + D.DAYS[(ws + i) % 7] + '">' + D.DAYS[(ws + i) % 7].slice(0, 2) + '</span>';
    h += '</div>';
    for (var w = first; w <= last; w = D.addDays(w, 7)) {
      h += '<div class="heat-r" role="row"><span class="wl" role="rowheader">' + +w.slice(8) + ' ' + D.monthName(w.slice(0, 7), true) + '</span>';
      for (var k = 0; k < 7; k++) {
        var x = D.addDays(w, k);
        if (x < s.dayOne || x > s.endDate) { h += '<span class="hc off" role="cell"></span>'; continue; }
        if (x > today) { h += '<span class="hc lvl-0 fut" role="cell" aria-label="' + esc(D.fmt(x)) + ', not started"></span>'; continue; }
        var st = L.dayStats(d, x);
        h += '<span class="hc lvl-' + L.level(st) + '" role="cell" aria-label="' + esc(D.fmt(x)) + ', ' + (st.pct === null ? 0 : st.pct) + ' percent">' + (st.pct === null ? 0 : st.pct) + '</span>';
      }
      h += '</div>';
    }
    return h + '</div>';
  }

  ui.views.progress = function () {
    var d = S.data, s = d.settings, today = ui.today();
    var h = '<h1>Progress</h1>';
    var elapsed = L.statDays(d, s.dayOne, s.endDate, today).length;
    if (!elapsed) {
      return h + '<section class="card"><p>Progress starts on ' + esc(D.fmt(s.dayOne, true)) + ', day 1 of the plan. Anything you tick before then is saved but not counted.</p></section>';
    }
    var wk = L.weekDates(today < s.dayOne ? s.dayOne : D.min(today, s.endDate), s.weekStart);
    var ym = D.monthKey(D.min(today, s.endDate));
    h += '<section class="card" aria-labelledby="ph-h"><h2 id="ph-h">Every habit</h2><ul class="hl">';
    L.sortedHabits(d).filter(function (x) { return x.enabled && !x.hidden; }).forEach(function (hh) {
      var rw = L.habitRate(d, hh.id, wk[0], wk[6], today), rm = L.habitRate(d, hh.id, D.monthFirst(ym), D.monthLast(ym), today),
        rp = L.habitRate(d, hh.id, s.dayOne, s.endDate, today), st = L.habitStreaks(d, hh.id, today);
      h += '<li><div class="hrow"><strong>' + esc(hh.name) + '</strong></div>' + ui.bar(rp.pct, hh.name + ' whole plan') +
        '<dl class="stats three"><div><dt>This week</dt><dd>' + ui.pctText(rw.pct) + '</dd></div><div><dt>This month</dt><dd>' + ui.pctText(rm.pct) + '</dd></div><div><dt>Whole plan</dt><dd>' + ui.pctText(rp.pct) + '</dd></div></dl>' +
        '<div class="muted small">Streak: ' + st.current + (st.current === 1 ? ' day' : ' days') + '. Best streak: ' + st.best + (st.best === 1 ? ' day' : ' days') + '.</div></li>';
    });
    h += '</ul></section>';

    h += '<section class="card" aria-labelledby="wb-h"><h2 id="wb-h">Completion by week</h2>' + weeklyChart(L.weeklyBars(d, today)) +
      '<p class="muted small">Each bar is one week, starting ' + (s.weekStart === 1 ? 'Monday' : 'Sunday') + '. Empty weeks have not started.</p></section>';

    h += '<section class="card" aria-labelledby="hm-h"><h2 id="hm-h">Whole plan</h2>' + heatmap(d, today) +
      '<div class="legend"><span class="lg"><i class="sw lvl-0"></i>0%</span><span class="lg"><i class="sw lvl-1"></i>1 to 39%</span><span class="lg"><i class="sw lvl-2"></i>40 to 69%</span><span class="lg"><i class="sw lvl-3"></i>70 to 99%</span><span class="lg"><i class="sw lvl-4"></i>100%</span></div></section>';

    var wd = L.weekdayStats(d, today), sl = L.slippingHabits(d, today, 3);
    h += '<section class="card" aria-labelledby="pt-h"><h2 id="pt-h">Patterns</h2>';
    if (wd) {
      h += '<p>Strongest weekday so far: <strong>' + D.DAYS[wd.best.dow] + '</strong> (' + wd.best.avg + '% on average). Weekday with the most room: <strong>' + D.DAYS[wd.worst.dow] + '</strong> (' + wd.worst.avg + '%).</p>';
    } else h += '<p class="muted">Weekday patterns appear after two weeks of days.</p>';
    if (sl.length) {
      h += '<p>Habits done least often so far:</p><ul class="plain">' + sl.map(function (x) { return '<li>' + esc(x.habit.name) + ' (' + x.pct + '%)</li>'; }).join('') + '</ul>';
    } else if (elapsed >= 7) h += '<p class="muted">Every habit is at 100% so far.</p>';
    h += '</section>';

    var notes = Object.keys(d.days).filter(function (k) { return d.days[k].note; }).sort().reverse();
    h += '<section class="card" aria-labelledby="nt-h"><h2 id="nt-h">Notes</h2>';
    if (!notes.length) h += '<p class="muted">No notes yet. You can add one in the log on the Today screen.</p>';
    else h += '<ul class="notes">' + notes.map(function (k) {
      return '<li><button type="button" class="link" data-act="openDate" data-date="' + k + '">' + esc(D.fmt(k)) + '</button><p>' + esc(d.days[k].note) + '</p></li>';
    }).join('') + '</ul>';
    return h + '</section>';
  };
})(typeof self !== 'undefined' ? self : globalThis);
