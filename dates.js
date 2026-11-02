/* dates.js: local calendar dates stored as 'YYYY-MM-DD' strings.
   Never uses UTC to decide what "today" is. All day arithmetic goes through
   whole-day numbers, so a +05:45 offset or a DST change cannot shift a date. */
(function (root) {
  'use strict';
  var RT = root.RT = root.RT || {};

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function make(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

  function parse(s) {
    if (typeof s !== 'string') return null;
    var p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!p) return null;
    var y = +p[1], m = +p[2], d = +p[3];
    if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
    return { y: y, m: m, d: d };
  }
  function isValid(s) { return parse(s) !== null; }

  function dayNum(s) { var p = parse(s); return Math.round(Date.UTC(p.y, p.m - 1, p.d) / 86400000); }
  function fromDayNum(n) {
    var dt = new Date(n * 86400000);
    return make(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  function addDays(s, n) { return fromDayNum(dayNum(s) + n); }
  function diffDays(a, b) { return dayNum(b) - dayNum(a); }
  function dow(s) { var p = parse(s); return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); }
  function max(a, b) { return a > b ? a : b; }
  function min(a, b) { return a < b ? a : b; }

  /* Local calendar date of a Date object, using local getters only. */
  function todayStr(now) {
    now = now || new Date();
    return make(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }
  function minutesNow(now) {
    now = now || new Date();
    return now.getHours() * 60 + now.getMinutes();
  }

  function range(a, b) {
    var out = [];
    if (a > b) return out;
    var n = dayNum(a), e = dayNum(b);
    for (; n <= e; n++) out.push(fromDayNum(n));
    return out;
  }

  /* First day of the week containing s. startsOn: 1 = Monday, 0 = Sunday. */
  function weekStart(s, startsOn) {
    var back = (dow(s) - startsOn + 7) % 7;
    return addDays(s, -back);
  }

  function monthKey(s) { return s.slice(0, 7); }
  function monthFirst(ym) { return ym + '-01'; }
  function monthLast(ym) {
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7);
    return make(y, m, daysInMonth(y, m));
  }
  function addMonths(ym, n) {
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return y + '-' + pad(m + 1);
  }
  function monthsBetween(a, b) {
    var out = [], k = monthKey(a), last = monthKey(b);
    while (k <= last) { out.push(k); k = addMonths(k, 1); }
    return out;
  }

  function monthName(ym, short) {
    var n = MONTHS[+ym.slice(5, 7) - 1];
    return short ? n.slice(0, 3) : n;
  }
  function weekdayName(s, short) { var n = DAYS[dow(s)]; return short ? n.slice(0, 3) : n; }
  /* 'Mon, 2 Nov 2026' (short) or 'Monday, 2 November 2026' (long) */
  function fmt(s, long) {
    var p = parse(s);
    if (!p) return String(s);
    var mn = MONTHS[p.m - 1];
    return weekdayName(s, !long) + ', ' + p.d + ' ' + (long ? mn : mn.slice(0, 3)) + ' ' + p.y;
  }
  /* 'Mon 2 Nov' */
  function fmtShort(s) {
    var p = parse(s);
    return weekdayName(s, true) + ' ' + p.d + ' ' + MONTHS[p.m - 1].slice(0, 3);
  }

  /* Minutes after midnight -> '5:30 am' or '05:30' */
  function fmtTime(min, use24) {
    if (min === null || min === undefined) return '';
    var h = Math.floor(min / 60), m = min % 60;
    if (use24) return pad(h) + ':' + pad(m);
    var suffix = h >= 12 ? 'pm' : 'am';
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + ':' + pad(m) + ' ' + suffix;
  }
  /* 'HH:MM' from a time input -> minutes, or null */
  function parseTime(s) {
    var p = /^(\d{1,2}):(\d{2})$/.exec(s || '');
    if (!p) return null;
    var h = +p[1], m = +p[2];
    if (h > 23 || m > 59) return null;
    return h * 60 + m;
  }
  function toInputTime(min) {
    if (min === null || min === undefined) return '';
    return pad(Math.floor(min / 60)) + ':' + pad(min % 60);
  }
  /* '5:30 to 5:45 am' style range text */
  function fmtRange(t, t2, use24) {
    if (t === null || t === undefined) return '';
    if (t2 === null || t2 === undefined) return fmtTime(t, use24);
    if (use24) return fmtTime(t, true) + ' to ' + fmtTime(t2, true);
    var a = fmtTime(t, false), b = fmtTime(t2, false);
    if (a.slice(-2) === b.slice(-2)) a = a.slice(0, -3);
    return a + ' to ' + b;
  }

  RT.dates = {
    MONTHS: MONTHS, DAYS: DAYS, pad: pad, make: make, parse: parse, isValid: isValid,
    daysInMonth: daysInMonth, dayNum: dayNum, addDays: addDays, diffDays: diffDays, dow: dow,
    max: max, min: min, todayStr: todayStr, minutesNow: minutesNow, range: range,
    weekStart: weekStart, monthKey: monthKey, monthFirst: monthFirst, monthLast: monthLast,
    addMonths: addMonths, monthsBetween: monthsBetween, monthName: monthName,
    weekdayName: weekdayName, fmt: fmt, fmtShort: fmtShort, fmtTime: fmtTime,
    parseTime: parseTime, toInputTime: toInputTime, fmtRange: fmtRange
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = RT.dates;
})(typeof self !== 'undefined' ? self : globalThis);
