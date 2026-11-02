/* goals.js: the Goals tab (body, skills, reading, steps). */
(function (root) {
  'use strict';
  var RT = root.RT, ui = RT.ui, S = ui.S, D = RT.dates, L = RT.logic, esc = ui.esc;
  var doc = root.document;

  function activeCycle(d) {
    for (var i = d.skillCycles.length - 1; i >= 0; i--) if (!d.skillCycles[i].done) return d.skillCycles[i];
    return null;
  }
  ui.cycleLine = function (date) {
    var d = S.data, c = activeCycle(d);
    if (!c) return '';
    var st = L.cycleStats(d, c, date);
    if (st.dayNo < 1 || st.dayNo > 30) return '';
    return '<div class="sub">Skill cycle: ' + esc(c.name) + ', day ' + st.dayNo + ' of 30. <button type="button" class="link" data-act="openCycle">Open cycle</button></div>';
  };
  ui.acts.openCycle = function () { S.view = 'goals'; S.goalsPage = 'skills'; ui._resetScroll = true; ui.render(); root.scrollTo && root.scrollTo(0, 0); };

  function setPath(obj, path, val) {
    var parts = path.split('.'), o = obj;
    for (var i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    o[parts[parts.length - 1]] = val;
  }
  function getPath(obj, path) {
    var o = obj;
    path.split('.').forEach(function (p) { o = o === undefined || o === null ? o : o[p]; });
    return o;
  }
  function inp(label, path, type, extra) {
    extra = extra || {};
    var v = getPath(S.data.goals, path);
    if (S.drafts['g:' + path] !== undefined) v = S.drafts['g:' + path];
    var t = type === 'date' ? 'date' : 'text';
    var mode = type === 'int' || type === 'age' || type === 'height' ? 'numeric' : (type === 'text' || type === 'date' ? 'text' : 'decimal');
    return '<label class="field"><span>' + esc(label) + '</span><input type="' + t + '" inputmode="' + mode + '" autocomplete="off" value="' + esc(v === null || v === undefined ? '' : v) + '" data-chg="goalf" data-path="' + path + '" data-type="' + type + '"' + (extra.min ? ' min="' + extra.min + '"' : '') + (extra.max ? ' max="' + extra.max + '"' : '') + '></label>';
  }
  function errLine() { return S.errors.goal ? '<p class="err" role="alert">' + esc(S.errors.goal) + '</p>' : ''; }

  ui.changes.goalf = function (el) {
    var path = el.getAttribute('data-path'), type = el.getAttribute('data-type'), d = S.data, g = d.goals, v = el.value.trim(), val;
    delete S.errors.goal; delete S.drafts['g:' + path];
    function bad(msg) { S.errors.goal = msg; S.drafts['g:' + path] = el.value; ui.render(); }
    if (type === 'weight') {
      var r = L.validate('weight', v, d);
      if (!r.ok || r.value === null) return bad(r.ok ? 'Enter a weight in kg.' : r.error);
      val = r.value;
    } else if (type === 'date') {
      if (v !== '' && !D.isValid(v)) return bad('Enter a valid date.');
      val = v;
      if (path === 'body.startDate' && v && v >= g.body.targetDate) return bad('The start date must be before the target date.');
      if (path === 'body.targetDate' && v && v <= g.body.startDate) return bad('The target date must be after the start date.');
      if ((path === 'body.startDate' || path === 'body.targetDate' || path === 'book.startDate' || path === 'book.deadline') && v === '') return bad('This date cannot be empty.');
      if (path === 'book.deadline' && v <= g.book.startDate) return bad('The deadline must be after the start date of the book.');
    } else if (type === 'pages') {
      var n = Number(v);
      if (!isFinite(n) || n % 1 !== 0 || n < 1 || n > 5000) return bad('Total pages must be a whole number from 1 to 5,000.');
      var cur = L.bookStats(d, ui.today()).page;
      if (n < cur) return bad('Total pages cannot be lower than the page you already reached (' + cur + ').');
      val = n;
    } else if (type === 'height') {
      if (v === '') val = null; else { var hh = Number(v.replace(',', '.')); if (!isFinite(hh) || hh < 100 || hh > 250) return bad('Height must be between 100 and 250 cm.'); val = hh; }
    } else if (type === 'age') {
      if (v === '') val = null; else { var aa = Number(v); if (!isFinite(aa) || aa % 1 !== 0 || aa < 10 || aa > 110) return bad('Age must be a whole number from 10 to 110.'); val = aa; }
    } else if (type === 'title') {
      if (!v) return bad('The title cannot be empty.');
      val = v.slice(0, 120);
    } else val = v.slice(0, 1000);
    setPath(g, path, val);
    ui.saveGoals(); ui.render();
  };

  /* ---------- index ---------- */
  function card(page, title, line, pct, bar) {
    return '<section class="card goalcard"><h2>' + title + '</h2><p class="big">' + line + '</p>' + (bar ? ui.bar(pct, title + ' progress') : '') +
      '<button type="button" class="btn" data-act="openGoal" data-page="' + page + '" aria-label="Open ' + title + '">Open</button></section>';
  }
  function goalsIndex() {
    var d = S.data, today = ui.today(), g = d.goals;
    var b = L.bodyStats(d), tot = g.body.startWeight - g.body.targetWeight;
    var bPct = b.latest && tot > 0 ? Math.max(0, Math.min(100, Math.round(100 * b.lost / tot))) : 0;
    var bLine = b.latest ? ui.fmtNum(b.latest.weight, 1) + ' kg now. ' + ui.fmtNum(b.toGo, 1) + ' kg to ' + g.body.targetWeight + ' kg.' : 'Start ' + g.body.startWeight + ' kg, target ' + g.body.targetWeight + ' kg. Log a weight to begin.';
    var done = g.skills.filter(function (x) { return x.status === 'done'; }).length, c = activeCycle(d), cl = '';
    if (c) { var cs = L.cycleStats(d, c, today); cl = cs.dayNo >= 1 ? ' Cycle: ' + esc(c.name) + ', day ' + Math.min(cs.dayNo, 30) + ' of 30.' : ' Cycle ' + esc(c.name) + ' starts ' + esc(D.fmtShort(c.start)) + '.'; }
    var bk = L.bookStats(d, today), pPct = Math.round(100 * bk.page / g.book.totalPages);
    var ss = L.stepsStats(d, today), tr = d.days[today] || {};
    var stepsHabit = L.habitById(d, 'steps');
    return '<h1>Goals</h1>' +
      card('body', 'Strength / Body', esc(bLine), bPct, true) +
      card('skills', 'Skills', done + ' of ' + g.skills.length + ' goals done.' + cl, Math.round(100 * done / g.skills.length), true) +
      card('mental', 'Mentally', esc(g.book.title) + ': page ' + bk.page + ' of ' + g.book.totalPages + (bk.finished ? '. Finished.' : '.'), pPct, true) +
      card('adventure', 'Adventure', (typeof tr.steps === 'number' ? ui.fmtNum(tr.steps) : 'No steps typed') + ' of ' + ui.fmtNum(d.settings.stepGoal) + ' steps today. Streak: ' + ss.streaks.current + (ss.streaks.current === 1 ? ' day.' : ' days.') + (stepsHabit && !stepsHabit.enabled ? ' The habit is retired.' : ''),
        typeof tr.steps === 'number' ? Math.min(100, Math.round(100 * tr.steps / d.settings.stepGoal)) : 0, true);
  }
  ui.acts.openGoal = function (el) { S.goalsPage = el.getAttribute('data-page'); S.errors = {}; ui._resetScroll = true; ui.render(); root.scrollTo && root.scrollTo(0, 0); };
  ui.acts.goalsBack = function () { S.goalsPage = null; S.errors = {}; ui._resetScroll = true; ui.render(); };
  ui.acts.openTodayLog = function () { S.date = ui.today(); S.view = 'today'; ui._resetScroll = true; ui.render(); var f = doc.getElementById('log-h'); if (f && f.scrollIntoView) f.scrollIntoView(); };
  function back() { return '<button type="button" class="btn small" data-act="goalsBack">Back to Goals</button>'; }

  /* ---------- body ---------- */
  function niceStep(range) { return range <= 12 ? 2 : range <= 30 ? 5 : 10; }
  function weightChart(d) {
    var g = d.goals.body, b = L.bodyStats(d), pts = b.points;
    var W = 360, H = 250, ml = 50, mr = 12, mt = 12, mb = 40;
    var x0 = g.startDate, x1 = g.targetDate;
    if (pts.length && pts[pts.length - 1].date > x1) x1 = pts[pts.length - 1].date;
    var span = Math.max(1, D.diffDays(x0, x1));
    function xs(date) { return ml + (Math.max(0, Math.min(span, D.diffDays(x0, date))) / span) * (W - ml - mr); }
    var vals = [g.startWeight, g.targetWeight];
    pts.forEach(function (p) { vals.push(p.weight); });
    var ymin = Math.floor(Math.min.apply(null, vals) - 1), ymax = Math.ceil(Math.max.apply(null, vals) + 1), step = niceStep(ymax - ymin);
    ymin = Math.floor(ymin / step) * step; ymax = Math.ceil(ymax / step) * step;
    function ys(v) { return mt + (1 - (v - ymin) / (ymax - ymin)) * (H - mt - mb); }
    var svg = '<svg class="chart weight" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Line chart of weight in kilograms over time with the target, the needed line from ' + g.startWeight + ' to ' + g.targetWeight + ' kg, a 7-day average and your logged weights.">';
    for (var v = ymin; v <= ymax; v += step) svg += '<line x1="' + ml + '" x2="' + (W - mr) + '" y1="' + ys(v) + '" y2="' + ys(v) + '" class="gl"/><text x="' + (ml - 6) + '" y="' + (ys(v) + 4) + '" text-anchor="end" class="ax">' + v + '</text>';
    D.monthsBetween(x0, x1).forEach(function (m) {
      var first = D.monthFirst(m);
      if (first < x0 || first > x1) return;
      svg += '<line x1="' + xs(first) + '" x2="' + xs(first) + '" y1="' + mt + '" y2="' + (H - mb) + '" class="gl v"/><text x="' + xs(first) + '" y="' + (H - mb + 15) + '" text-anchor="middle" class="ax">' + D.monthName(m, true) + '</text>';
    });
    svg += '<text transform="rotate(-90 12 ' + (H / 2 - 10) + ')" x="12" y="' + (H / 2 - 10) + '" text-anchor="middle" class="ax">Weight (kg)</text>';
    svg += '<text x="' + (ml + (W - ml - mr) / 2) + '" y="' + (H - 6) + '" text-anchor="middle" class="ax">Date (month)</text>';
    svg += '<line x1="' + xs(g.startDate) + '" y1="' + ys(g.startWeight) + '" x2="' + xs(g.targetDate) + '" y2="' + ys(g.targetWeight) + '" class="ln-need"/>';
    svg += '<line x1="' + xs(x0) + '" y1="' + ys(g.targetWeight) + '" x2="' + xs(x1) + '" y2="' + ys(g.targetWeight) + '" class="ln-target"/>';
    if (pts.length) {
      var trend = pts.map(function (p) { return xs(p.date).toFixed(1) + ',' + ys(L.avgAround(pts, p.date)).toFixed(1); }).join(' ');
      svg += (pts.length > 1 ? '<polyline points="' + trend + '" class="ln-trend"/>' : '');
      pts.forEach(function (p) { svg += '<circle cx="' + xs(p.date).toFixed(1) + '" cy="' + ys(p.weight).toFixed(1) + '" r="3" class="pt"><title>' + esc(D.fmtShort(p.date)) + ': ' + p.weight + ' kg</title></circle>'; });
      if (pts.length === 1) svg += '<circle cx="' + xs(pts[0].date).toFixed(1) + '" cy="' + ys(L.avgAround(pts, pts[0].date)).toFixed(1) + '" r="5" class="pt-avg"/>';
    }
    svg += '</svg>';
    svg += '<ul class="chart-key"><li><svg width="34" height="10" aria-hidden="true"><line x1="0" y1="5" x2="34" y2="5" class="ln-need"/></svg> Needed line, ' + g.startWeight + ' kg to ' + g.targetWeight + ' kg</li>' +
      '<li><svg width="34" height="10" aria-hidden="true"><line x1="0" y1="5" x2="34" y2="5" class="ln-target"/></svg> Target, ' + g.targetWeight + ' kg</li>' +
      '<li><svg width="34" height="10" aria-hidden="true"><line x1="0" y1="5" x2="34" y2="5" class="ln-trend"/></svg> 7-day average</li>' +
      '<li><svg width="34" height="10" aria-hidden="true"><circle cx="17" cy="5" r="3" class="pt"/></svg> Logged weight</li></ul>';
    return svg;
  }

  function bodyPage() {
    var d = S.data, g = d.goals, b = L.bodyStats(d), today = ui.today();
    var h = back() + '<h1>Strength / Body</h1><p class="muted">Get from ' + g.body.startWeight + ' kg to ' + g.body.targetWeight + ' kg with muscle by ' + esc(D.fmt(g.body.targetDate)) + ', eating in a calorie deficit.</p>';
    h += '<section class="card" aria-labelledby="wc-h"><h2 id="wc-h">Weight</h2>' + weightChart(d) + '</section>';
    h += '<section class="card" aria-labelledby="bn-h"><h2 id="bn-h">Numbers</h2><dl class="stats">' +
      '<div><dt>Latest weight</dt><dd>' + (b.latest ? ui.fmtNum(b.latest.weight, 1) + ' kg' : 'None yet') + '</dd></div>' +
      '<div><dt>Lost so far</dt><dd>' + (b.lost !== null ? ui.fmtNum(b.lost, 1) + ' kg' : 'None yet') + '</dd></div>' +
      '<div><dt>To go</dt><dd>' + (b.toGo !== null ? ui.fmtNum(Math.max(0, b.toGo), 1) + ' kg' : ui.fmtNum(g.body.startWeight - g.body.targetWeight, 1) + ' kg') + '</dd></div>' +
      '<div><dt>Your average change per week</dt><dd>' + (b.perWeek !== null ? ui.fmtNum(b.perWeek, 2) + ' kg' : 'After 1 week of weights') + '</dd></div>' +
      '<div><dt>Pace needed</dt><dd>' + (b.needed !== null ? ui.fmtNum(b.needed, 2) + ' kg a week' : 'None') + '</dd></div>' +
      '<div><dt>Date at your current pace</dt><dd>' + (b.reached ? 'Target reached' : b.projected ? esc(D.fmt(b.projected)) : 'After 1 week of weights') + '</dd></div></dl>';
    if (b.late) h += '<p class="note">At your current pace the target would be reached after ' + esc(D.fmt(g.body.targetDate)) + '. That is only a projection from your weights so far, and it changes as you log more.</p>';
    if (b.proteinNote) h += '<p class="note">Your weight has dropped by more than 1 kg a week for two weeks in a row. Eating enough protein helps keep muscle.</p>';
    if (b.reached) h += '<p class="note">Your logged weight is at or below the target. Well done.</p>';
    h += '<button type="button" class="btn" data-act="openTodayLog">Log a weight on Today</button></section>';

    if (d.settings.foodLog) {
      var r = d.days[today] || {};
      h += '<section class="card" aria-labelledby="fl-h"><h2 id="fl-h">Food log, today</h2><dl class="stats"><div><dt>Calories</dt><dd>' + (typeof r.calories === 'number' ? ui.fmtNum(r.calories) : 'None yet') + (d.settings.calorieTarget ? ' of ' + ui.fmtNum(d.settings.calorieTarget) : '') + '</dd></div>' +
        '<div><dt>Protein</dt><dd>' + (typeof r.protein === 'number' ? r.protein + ' g' : 'None yet') + ' of ' + d.settings.proteinTarget + ' g</dd></div></dl><p class="muted small">Targets are set in Settings.</p></section>';
    }
    h += '<section class="card" aria-labelledby="gs-h"><h2 id="gs-h">Goal settings</h2>' + errLine() + '<div class="grid2">' +
      inp('Start weight (kg)', 'body.startWeight', 'weight') + inp('Start date', 'body.startDate', 'date') +
      inp('Target weight (kg)', 'body.targetWeight', 'weight') + inp('Target date', 'body.targetDate', 'date') + '</div></section>';

    /* optional helper: never pre-filled */
    var est = null, wForCalc = b.latest ? b.latest.weight : g.body.startWeight;
    if (g.height && g.age && g.sex && g.activity) est = L.maintenanceKcal(wForCalc, g.height, g.age, g.sex, g.activity);
    h += '<section class="card" aria-labelledby="mn-h"><h2 id="mn-h">My numbers (optional)</h2><p class="muted">A rough estimate from the Mifflin-St Jeor formula. It is not medical advice. Nothing here is filled in for you, and it stays on this phone.</p>' + errLine() + '<div class="grid2">' +
      inp('Height (cm)', 'height', 'height') + inp('Age (years)', 'age', 'age') + '</div><div class="grid2">' +
      '<label class="field"><span>Sex used in the formula</span><select data-chg="goalf" data-path="sex" data-type="text"><option value=""' + (!g.sex ? ' selected' : '') + '>Choose</option><option value="male"' + (g.sex === 'male' ? ' selected' : '') + '>Male</option><option value="female"' + (g.sex === 'female' ? ' selected' : '') + '>Female</option></select></label>' +
      '<label class="field"><span>Activity level</span><select data-chg="goalf" data-path="activity" data-type="text"><option value=""' + (!g.activity ? ' selected' : '') + '>Choose</option>' +
      [['sedentary', 'Little or no exercise'], ['light', 'Light, 1 to 3 days a week'], ['moderate', 'Moderate, 3 to 5 days a week'], ['active', 'Hard, 6 to 7 days a week']].map(function (o) { return '<option value="' + o[0] + '"' + (g.activity === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label></div>';
    if (est) h += '<p>Estimated maintenance: <strong>' + ui.fmtNum(est.maintenance) + ' kcal a day</strong> (using ' + ui.fmtNum(wForCalc, 1) + ' kg). A deficit of 300 to 500 kcal gives about <strong>' + ui.fmtNum(est.targetLow) + ' to ' + ui.fmtNum(est.targetHigh) + ' kcal a day</strong>.</p>';
    else h += '<p class="muted">Fill in all four fields to see the estimate.</p>';
    return h + '</section>';
  }

  /* ---------- reading ---------- */
  function mentalPage() {
    var d = S.data, g = d.goals, today = ui.today(), bk = L.bookStats(d, today);
    var h = back() + '<h1>Mentally</h1><p class="muted">Read ' + esc(g.book.title) + ' by ' + esc(D.fmt(g.book.deadline)) + ', at least 1 page every day. Distraction is tracked by the screen time habit and your notes.</p>';
    if (bk.finished) {
      h += '<section class="card"><h2>Finished</h2><p>You reached page ' + bk.page + ' of ' + g.book.totalPages + (bk.finishedOn ? ' on ' + esc(D.fmt(bk.finishedOn)) : '') + '.</p>' + errLine() +
        '<h3>Add the next book</h3><div class="grid2"><label class="field"><span>Title</span><input type="text" id="nb-title" maxlength="120"></label><label class="field"><span>Total pages</span><input type="text" inputmode="numeric" id="nb-pages"></label></div>' +
        '<label class="field"><span>Deadline</span><input type="date" id="nb-deadline" value="' + g.book.deadline + '"></label><button type="button" class="btn primary" data-act="nextBook">Start the next book</button></section>';
    } else {
      var diffTxt = bk.diff > 0 ? 'Ahead of schedule by ' + bk.diff + (bk.diff === 1 ? ' page.' : ' pages.') : bk.diff === 0 ? 'On schedule.' : 'Behind schedule by ' + (-bk.diff) + (bk.diff === -1 ? ' page.' : ' pages.');
      h += '<section class="card" aria-labelledby="rp-h"><h2 id="rp-h">Reading plan</h2>' + ui.bar(Math.round(100 * bk.page / g.book.totalPages), 'Pages read') + '<dl class="stats">' +
        '<div><dt>Pages read</dt><dd>' + bk.page + '</dd></div><div><dt>Pages left</dt><dd>' + bk.left + '</dd></div><div><dt>Days left</dt><dd>' + bk.daysLeft + '</dd></div>' +
        '<div><dt>Pages a day needed</dt><dd>' + ui.fmtNum(bk.need, 1) + '</dd></div></dl><p>' + diffTxt + ' Your own minimum is 1 page every day, with a target of 2 to 3.</p>' +
        '<button type="button" class="btn" data-act="openTodayLog">Log a page on Today</button></section>';
    }
    var met = 0;
    Object.keys(d.days).forEach(function (k) { if (L.minimumMet(d, k)) met++; });
    h += '<section class="card"><h2>Minimum met</h2><p>' + met + (met === 1 ? ' day' : ' days') + ' with at least 1 new page.</p></section>';
    h += '<section class="card" aria-labelledby="bs-h"><h2 id="bs-h">Book settings</h2>' + errLine() + inp('Title', 'book.title', 'title') + '<div class="grid2">' + inp('Total pages (editions differ)', 'book.totalPages', 'pages') + inp('Deadline', 'book.deadline', 'date') + '</div></section>';
    if (g.booksDone.length) {
      h += '<section class="card"><h2>Finished books</h2><ul class="plain">' + g.booksDone.map(function (b) { return '<li>' + esc(b.title) + ' (' + b.totalPages + ' pages), finished ' + esc(D.fmt(b.finishedOn)) + '</li>'; }).join('') + '</ul></section>';
    }
    return h;
  }
  ui.acts.nextBook = function () {
    var d = S.data, g = d.goals, bk = L.bookStats(d, ui.today());
    var title = doc.getElementById('nb-title').value.trim(), pages = Number(doc.getElementById('nb-pages').value), dl = doc.getElementById('nb-deadline').value;
    delete S.errors.goal;
    if (!title) S.errors.goal = 'Enter the title of the next book.';
    else if (!isFinite(pages) || pages % 1 !== 0 || pages < 1 || pages > 5000) S.errors.goal = 'Total pages must be a whole number from 1 to 5,000.';
    else if (!D.isValid(dl)) S.errors.goal = 'Enter a valid deadline.';
    var start = D.addDays(bk.finishedOn || ui.today(), 1);
    if (!S.errors.goal && dl <= start) S.errors.goal = 'The deadline must be after ' + D.fmt(start) + '.';
    if (S.errors.goal) { ui.render(); return; }
    g.booksDone.push({ title: g.book.title, totalPages: g.book.totalPages, finishedOn: bk.finishedOn || ui.today() });
    g.book = { title: title, totalPages: pages, startDate: start, deadline: dl };
    ui.saveGoals(); ui.render();
  };

  /* ---------- skills ---------- */
  var STATUS = [['notstarted', 'Not started'], ['inprogress', 'In progress'], ['done', 'Done']];
  function skillsPage() {
    var d = S.data, g = d.goals, today = ui.today(), c = activeCycle(d);
    var h = back() + '<h1>Skills</h1><p class="muted">Build one skill within 30 days, and work through the four goals from your notebook.</p>';
    h += '<section class="card" aria-labelledby="cy-h"><h2 id="cy-h">30-day skill cycle</h2>' + errLine();
    if (c) {
      var st = L.cycleStats(d, c, today);
      if (st.notStarted) h += '<p>' + esc(c.name) + ' starts on ' + esc(D.fmt(c.start)) + '.</p>';
      else {
        h += '<p class="big">' + esc(c.name) + ': day ' + Math.min(st.dayNo, 30) + ' of 30</p>' + ui.bar(Math.min(100, Math.round(100 * Math.min(st.dayNo, 30) / 30)), 'Cycle progress') +
          '<dl class="stats"><div><dt>Days practised</dt><dd>' + st.practised + '</dd></div><div><dt>Minutes logged</dt><dd>' + st.minutes + '</dd></div><div><dt>Cycle ends</dt><dd>' + esc(D.fmtShort(st.end)) + '</dd></div></dl>';
        var mv = c.minutes && typeof c.minutes[today] === 'number' ? c.minutes[today] : '';
        h += '<label class="field"><span>Minutes practised today (optional)</span><input type="text" inputmode="numeric" value="' + esc(S.drafts.cmin !== undefined ? S.drafts.cmin : mv) + '" data-chg="cycleMin" data-id="' + c.id + '"></label>' +
          '<button type="button" class="btn" data-act="openTodayLog">Tick Skill practice on Today</button>';
        if (st.due) {
          h += '<div class="review"><h3>Day 30 review</h3><label class="field"><span>What I learned</span><textarea id="review" rows="4" maxlength="2000">' + esc(c.review || '') + '</textarea></label>' +
            '<div class="btn-row"><button type="button" class="btn primary" data-act="finishCycle" data-mode="continue">Continue this skill for 30 more days</button><button type="button" class="btn" data-act="finishCycle" data-mode="new">Finish and start a new skill</button></div></div>';
        } else h += '<div class="btn-row"><button type="button" class="btn" data-act="finishCycle" data-mode="stop">Finish this cycle early</button></div>';
      }
    } else {
      h += '<p>No cycle is running. Name the skill and choose a start date.</p><label class="field"><span>Skill name</span><input type="text" id="cy-name" maxlength="80"></label>' +
        '<label class="field"><span>Start date</span><input type="date" id="cy-start" value="' + today + '"></label><button type="button" class="btn primary" data-act="startCycle">Start 30-day cycle</button>';
    }
    h += '</section>';
    var done = d.skillCycles.filter(function (x) { return x.done; });
    if (done.length) {
      h += '<section class="card" aria-labelledby="ch-h"><h2 id="ch-h">Finished cycles</h2><ul class="notes">' + done.slice().reverse().map(function (x) {
        var s2 = L.cycleStats(d, x, D.addDays(x.start, 29));
        return '<li><strong>' + esc(x.name) + '</strong><div class="muted small">' + esc(D.fmtShort(x.start)) + ' to ' + esc(D.fmtShort(s2.end)) + '. ' + s2.practised + ' days practised, ' + s2.minutes + ' minutes. ' + (x.result === 'continue' ? 'Continued.' : x.result === 'new' ? 'Moved to a new skill.' : 'Finished early.') + '</div>' + (x.review ? '<p>' + esc(x.review) + '</p>' : '') + '</li>';
      }).join('') + '</ul></section>';
    }
    h += '<section class="card" aria-labelledby="gl-h"><h2 id="gl-h">Goal checklist</h2>';
    g.skills.forEach(function (sk, i) {
      h += '<div class="skillgoal"><h3>' + esc(sk.text) + '</h3><label class="field"><span>Status</span><select data-chg="goalf" data-path="skills.' + i + '.status" data-type="text">' +
        STATUS.map(function (o) { return '<option value="' + o[0] + '"' + (sk.status === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
        inp('Target date (optional)', 'skills.' + i + '.target', 'date') +
        (sk.id === 'future' ? inp('Deadline to choose my first 30-day skill', 'skills.' + i + '.firstSkillDeadline', 'date') : '') +
        '<label class="field"><span>Note</span><textarea rows="3" maxlength="1000" data-chg="goalf" data-path="skills.' + i + '.note" data-type="text">' + esc(sk.note) + '</textarea></label></div>';
    });
    return h + '</section>';
  }
  ui.acts.startCycle = function () {
    var name = doc.getElementById('cy-name').value.trim(), start = doc.getElementById('cy-start').value;
    delete S.errors.goal;
    if (!name) S.errors.goal = 'Enter a name for the skill.';
    else if (!D.isValid(start)) S.errors.goal = 'Enter a valid start date.';
    if (S.errors.goal) { ui.render(); return; }
    var c = { id: 'c' + Date.now(), name: name, start: start, minutes: {}, review: '', result: '', done: false };
    S.data.skillCycles.push(c); RT.db.saveCycle(c); ui.render();
  };
  ui.changes.cycleMin = function (el) {
    var c = S.data.skillCycles.filter(function (x) { return x.id === el.getAttribute('data-id'); })[0];
    if (!c) return;
    var r = L.validate('sessionMinutes', el.value, S.data);
    delete S.errors.goal;
    if (!r.ok) { S.errors.goal = r.error; S.drafts.cmin = el.value; ui.render(); return; }
    delete S.drafts.cmin;
    if (!c.minutes) c.minutes = {};
    if (r.value === null) delete c.minutes[ui.today()]; else c.minutes[ui.today()] = r.value;
    RT.db.saveCycle(c); ui.render();
  };
  ui.acts.finishCycle = function (el) {
    var mode = el.getAttribute('data-mode'), c = activeCycle(S.data);
    if (!c) return;
    var rv = doc.getElementById('review');
    if (rv) c.review = rv.value.trim();
    c.done = true; c.result = mode === 'continue' ? 'continue' : mode === 'new' ? 'new' : 'stop';
    RT.db.saveCycle(c);
    if (mode === 'continue') {
      var next = D.max(D.addDays(c.start, 30), ui.today());
      var nc = { id: 'c' + Date.now(), name: c.name, start: next, minutes: {}, review: '', result: '', done: false };
      S.data.skillCycles.push(nc); RT.db.saveCycle(nc);
    }
    ui.render();
  };

  /* ---------- steps ---------- */
  function adventurePage() {
    var d = S.data, today = ui.today(), ss = L.stepsStats(d, today), r = d.days[today] || {}, goal = d.settings.stepGoal, sh = L.habitById(d, 'steps');
    var h = back() + '<h1>Adventure</h1><p class="muted">Walk ' + ui.fmtNum(goal) + ' steps every day until you reach your intended body weight. A web app cannot read the phone step counter, so you tick the habit or type the number on the Today screen.</p>';
    if (sh && !sh.enabled) h += '<p class="note">The steps habit is retired. You can turn it on again in Settings.</p>';
    h += '<section class="card" aria-labelledby="st-h"><h2 id="st-h">Today</h2><p class="big">' + (typeof r.steps === 'number' ? ui.fmtNum(r.steps) : 'No number typed') + ' of ' + ui.fmtNum(goal) + '</p>' + ui.bar(typeof r.steps === 'number' ? Math.min(100, Math.round(100 * r.steps / goal)) : 0, 'Steps today') +
      '<dl class="stats"><div><dt>Current streak</dt><dd>' + ss.streaks.current + (ss.streaks.current === 1 ? ' day' : ' days') + '</dd></div><div><dt>Best streak</dt><dd>' + ss.streaks.best + (ss.streaks.best === 1 ? ' day' : ' days') + '</dd></div>' +
      '<div><dt>Average of typed steps</dt><dd>' + (ss.average !== null ? ui.fmtNum(ss.average) : 'None yet') + '</dd></div></dl>' +
      '<button type="button" class="btn" data-act="openTodayLog">Type steps on Today</button></section>';
    h += '<section class="card" aria-labelledby="sm-h"><h2 id="sm-h">Days the goal was reached</h2><ul class="hl">';
    D.monthsBetween(d.settings.startDate, d.settings.endDate).forEach(function (m) {
      var n = ss.monthCount[m] || 0, len = D.daysInMonth(+m.slice(0, 4), +m.slice(5, 7));
      h += '<li><div class="hrow"><span>' + D.monthName(m) + ' ' + m.slice(0, 4) + '</span><span class="mono">' + n + ' of ' + len + ' days</span></div>' + ui.bar(Math.round(100 * n / len), D.monthName(m) + ' days reached') + '</li>';
    });
    return h + '</ul></section>';
  }

  ui.views.goals = function () {
    switch (S.goalsPage) {
      case 'body': return bodyPage();
      case 'skills': return skillsPage();
      case 'mental': return mentalPage();
      case 'adventure': return adventurePage();
    }
    return goalsIndex();
  };
})(typeof self !== 'undefined' ? self : globalThis);
