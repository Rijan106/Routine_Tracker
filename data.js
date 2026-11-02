/* data.js: the 16 habits, the three day-type schedules, default settings and goals,
   and the schema migration chain. */
(function (root) {
  'use strict';
  var RT = root.RT = root.RT || {};

  var SCHEMA_VERSION = 2;
  var DAY_TYPES = ['office', 'sat', 'hol'];
  var DAY_TYPE_LABELS = { office: 'Office day', sat: 'Saturday holiday', hol: 'Other holiday' };
  var ALL = ['office', 'sat', 'hol'];

  function H(id, name, types, note) {
    return { id: id, name: name, enabled: true, hidden: false, order: 0, types: types.slice(), note: note, custom: false };
  }
  function defaultHabits() {
    var list = [
      H('wake', 'Wake up on time', ALL, 'I am up between 5:30 and 5:45 am, never later.'),
      H('water', '1 L of water', ALL, 'I drank 1 litre of mild (not cold) water in the morning.'),
      H('walk', 'Walk', ['office', 'sat', 'hol'], 'I walked at the scheduled time (6:00 am exactly on office days).'),
      H('shower', 'Cold shower', ALL, 'I took the shower with cold water.'),
      H('skincare', 'Skincare and hair care', ALL, 'I did my skincare and hair care after the shower.'),
      H('meals', 'Meals and snack on time', ALL, 'Every scheduled meal was eaten at its time.'),
      H('steps', '10K steps', ALL, 'I reached 10,000 steps (I may type the real number).'),
      H('screen', 'Screen time under 2 hours', ALL, 'Total phone screen time was under 2 hours (I may type the real number).'),
      H('workout', 'Gym or futsal', ALL, 'I did the gym (futsal on Saturday).'),
      H('plants', 'Water the plants', ALL, 'I watered the plants.'),
      H('skill', 'Skill practice', ALL, 'I did the skill block or the skill slot.'),
      H('read', 'Read', ALL, 'I read at least 1 page of The 48 Laws of Power (target 2 to 3).'),
      H('sleep', 'Asleep by 10:00 pm', ALL, 'Phone down and asleep by 10:00 pm.'),
      H('chores', 'Finish chores', ALL, 'I finished my chores in the dinner slot.'),
      H('grooming', 'Evening grooming', ALL, 'I finished grooming of face and hair in the 9:00 slot.'),
      H('meditate', 'Meditate', ['sat', 'hol'], 'I meditated in the rest block.')
    ];
    list.forEach(function (h, i) { h.order = i + 1; });
    return list;
  }

  function t(h, m) { return h * 60 + (m || 0); }
  function item(habit, meal, label) {
    var o = { habit: habit };
    if (meal) { o.meal = meal; o.label = label || (meal.charAt(0).toUpperCase() + meal.slice(1)); }
    else if (label) o.label = label;
    return o;
  }
  function row(id, start, end, text, items, src, group, extra) {
    var r = { id: id, t: start, t2: end, text: text, items: items || [], src: src, on: true, group: group };
    if (extra) for (var k in extra) r[k] = extra[k];
    return r;
  }

  function officeRows() {
    return [
      row('o01', t(5, 30), t(5, 45), 'Get up. A must.', [item('wake')], 'notebook', 'morning', { hint: 'wake' }),
      row('o02', null, null, 'Drink 1 L of water, mild', [item('water')], 'notebook', 'morning'),
      row('o03', null, null, 'Morning rule: if I go to the bathroom, be out within 15 minutes', [], 'notebook', 'morning', { timer: true }),
      row('o04', t(6), null, 'Go for a walk, exactly at 6:00', [item('walk')], 'notebook', 'morning'),
      row('o05', t(7), t(7, 15), 'Back at home', [], 'notebook', 'morning'),
      row('o06', null, null, 'Shower with cold water', [item('shower')], 'notebook', 'morning'),
      row('o07', null, null, 'Get ready with skincare and hair care', [item('skincare')], 'notebook', 'morning'),
      row('o08', t(8), null, 'Breakfast before leaving for work', [item('meals', 'breakfast')], 'suggested', 'morning'),
      row('o09', t(9), null, 'Go to work', [], 'notebook', 'morning'),
      row('o10', t(13), null, 'Lunch', [item('meals', 'lunch')], 'suggested', 'day'),
      row('o11', t(16, 30), null, 'Small snack before the gym (a fruit or curd)', [item('meals', 'snack')], 'suggested', 'day'),
      row('o12', t(17), null, 'Out of work', [], 'notebook', 'day'),
      row('o13', t(18), null, 'Get ready and go to the gym', [item('workout')], 'notebook', 'evening'),
      row('o14', t(19), t(19, 15), 'Back at home', [], 'notebook', 'evening'),
      row('o15', null, null, 'Freshen up, then go and water the plants', [item('plants')], 'notebook', 'evening'),
      row('o16', t(20), t(20, 30), 'Get your dinner and finish chores', [item('meals', 'dinner'), item('chores')], 'notebook', 'evening'),
      row('o17', t(20, 30), t(21), 'Skill practice, 20 to 30 minutes: learn to invest, or practise talking to people', [item('skill')], 'suggested', 'evening'),
      row('o18', t(21), t(21, 30), 'Finish your grooming (face and hair)', [item('grooming')], 'notebook', 'evening'),
      row('o19', t(21, 30), t(22), 'Read 2 to 3 pages of The 48 Laws of Power (1 page is the minimum)', [item('read')], 'suggested', 'evening'),
      row('o20', t(22), null, 'Go to sleep. Phone down.', [item('sleep')], 'notebook', 'evening'),
      row('o21', null, null, 'Reach 10,000 steps', [item('steps')], 'notebook', 'all'),
      row('o22', null, null, 'Keep phone screen time under 2 hours', [item('screen')], 'changed', 'all')
    ];
  }
  function satRows() {
    return [
      row('s01', t(5, 30), t(5, 45), 'Get up', [item('wake')], 'assumed', 'morning', { hint: 'wake' }),
      row('s02', null, null, 'Drink 1 L of water, mild. Bathroom rule applies: be out within 15 minutes.', [item('water')], 'assumed', 'morning', { timer: true }),
      row('s03', t(7), t(8), 'Futsal', [item('workout')], 'notebook', 'morning'),
      row('s04', t(9), null, 'Shower and freshen up (cold shower, skincare and hair care)', [item('shower'), item('skincare')], 'notebook', 'morning'),
      row('s05', t(10), null, 'Have breakfast', [item('meals', 'breakfast')], 'notebook', 'morning'),
      row('s06', t(11), t(14), 'Build a skill. One skill, built within 30 days.', [item('skill')], 'notebook', 'day'),
      row('s07', t(14), null, 'Lunch', [item('meals', 'lunch')], 'suggested', 'day'),
      row('s08', t(14), t(18), 'Freshen up and rest (meditate)', [item('meditate')], 'notebook', 'day'),
      row('s09', t(18), t(19, 15), 'Go for a walk', [item('walk')], 'notebook', 'evening'),
      row('s10', t(19, 15), t(20), 'Back to the previous page: the office-day evening routine. Freshen up, water the plants.', [item('plants')], 'notebook', 'evening'),
      row('s11', t(20), t(20, 30), 'Dinner and chores', [item('meals', 'dinner'), item('chores')], 'notebook', 'evening'),
      row('s12', t(21), t(21, 30), 'Finish your grooming (face and hair)', [item('grooming')], 'notebook', 'evening'),
      row('s13', t(21, 30), t(22), 'Read 2 to 3 pages', [item('read')], 'suggested', 'evening'),
      row('s14', t(22), null, 'Go to sleep. Phone down.', [item('sleep')], 'notebook', 'evening'),
      row('s15', null, null, '10,000 steps, and screen time under 2 hours', [item('steps'), item('screen')], 'notebook', 'all')
    ];
  }
  function holRowsV1() {
    return [
      row('h01', t(5, 30), t(5, 45), 'Regular morning: get up', [item('wake')], 'notebook', 'morning', { hint: 'wake' }),
      row('h02', null, null, 'Drink 1 L of water, mild. Bathroom rule applies: be out within 15 minutes.', [item('water')], 'notebook', 'morning', { timer: true }),
      row('h03', t(6), t(7, 15), 'Gym', [item('workout')], 'notebook', 'morning'),
      row('h04', null, null, 'Cold shower, then skincare and hair care', [item('shower'), item('skincare')], 'suggested', 'morning'),
      row('h05', t(8, 30), null, 'Breakfast', [item('meals', 'breakfast')], 'suggested', 'morning'),
      row('h06', t(11), t(14), 'Skill', [item('skill')], 'notebook', 'day'),
      row('h07', t(14), null, 'Lunch', [item('meals', 'lunch')], 'suggested', 'day'),
      row('h08', t(14), t(18), 'Rest (meditate)', [item('meditate')], 'notebook', 'day'),
      row('h09', t(18), null, 'Follow the office-day evening routine: water the plants, dinner and chores at 8:00, grooming at 9:00, reading at 9:30, sleep at 10:00', [], 'suggested', 'evening'),
      row('h10', null, null, 'Water the plants', [item('plants')], 'suggested', 'evening'),
      row('h11', t(20), t(20, 30), 'Dinner and chores', [item('meals', 'dinner'), item('chores')], 'suggested', 'evening'),
      row('h12', t(21), t(21, 30), 'Finish your grooming (face and hair)', [item('grooming')], 'suggested', 'evening'),
      row('h13', t(21, 30), t(22), 'Read 2 to 3 pages', [item('read')], 'suggested', 'evening'),
      row('h14', t(22), null, 'Go to sleep. Phone down.', [item('sleep')], 'suggested', 'evening'),
      row('h15', null, null, '10,000 steps, and screen time under 2 hours', [item('steps'), item('screen')], 'notebook', 'all')
    ];
  }
  function holRows() {
    return [
      row('h01', t(5, 30), t(5, 45), 'Regular morning: get up', [item('wake')], 'notebook', 'morning', { hint: 'wake' }),
      row('h02', null, null, 'Drink 1 L of water, mild. Bathroom rule applies: be out within 15 minutes.', [item('water')], 'notebook', 'morning', { timer: true }),
      row('h03', t(6), null, 'Go for a walk, exactly at 6:00', [item('walk')], 'assumed', 'morning'),
      row('h04', t(7), t(7, 15), 'Back at home', [], 'assumed', 'morning'),
      row('h05', null, null, 'Cold shower, then skincare and hair care', [item('shower'), item('skincare')], 'assumed', 'morning'),
      row('h06', null, null, 'Gym', [item('workout')], 'assumed', 'morning'),
      row('h07', t(8, 30), null, 'Breakfast', [item('meals', 'breakfast')], 'suggested', 'morning'),
      row('h08', t(11), t(14), 'Skill', [item('skill')], 'notebook', 'day'),
      row('h09', t(14), null, 'Lunch', [item('meals', 'lunch')], 'suggested', 'day'),
      row('h10', t(14), t(18), 'Rest (meditate)', [item('meditate')], 'notebook', 'day'),
      row('h11', t(18), null, 'Follow the office-day evening routine: water the plants, dinner and chores at 8:00, grooming at 9:00, reading at 9:30, sleep at 10:00', [], 'suggested', 'evening'),
      row('h12', null, null, 'Water the plants', [item('plants')], 'suggested', 'evening'),
      row('h13', t(20), t(20, 30), 'Dinner and chores', [item('meals', 'dinner'), item('chores')], 'suggested', 'evening'),
      row('h14', t(21), t(21, 30), 'Finish your grooming (face and hair)', [item('grooming')], 'suggested', 'evening'),
      row('h15', t(21, 30), t(22), 'Read 2 to 3 pages', [item('read')], 'suggested', 'evening'),
      row('h16', t(22), null, 'Go to sleep. Phone down.', [item('sleep')], 'suggested', 'evening'),
      row('h17', null, null, '10,000 steps, and screen time under 2 hours', [item('steps'), item('screen')], 'notebook', 'all')
    ];
  }
  function defaultSchedule() { return { office: officeRows(), sat: satRows(), hol: holRows() }; }

  function defaultSettings() {
    return {
      startDate: '2026-11-01', dayOne: '2026-11-02', endDate: '2027-05-31',
      stepGoal: 10000, screenLimitMin: 120, wakeStart: t(5, 30), wakeEnd: t(5, 45),
      weighInDay: 0, theme: 'system', timeFormat: '12', weekStart: 1,
      defaultTypes: { 0: 'hol', 1: 'office', 2: 'office', 3: 'office', 4: 'office', 5: 'office', 6: 'sat' },
      allowFuture: false, haptics: false, foodLog: false, calorieTarget: null, proteinTarget: 120,
      backupReminderDays: 14, lastBackup: null,
      alarms: { on: false, lead: 30, atTime: true, sound: true, vibrate: true, icsDays: 14 },
      holidayNote: 'If office is from 6:00: be at the office by 6:00, going there on foot (that is the walk). Then follow the regular office day until 5:00 pm. To do this, switch this day to Weekdays at the top.',
      weighInDismissed: null, stepsDecision: null,
      schemaVersion: SCHEMA_VERSION
    };
  }
  function defaultGoals() {
    return {
      body: { startWeight: 82, startDate: '2026-11-01', targetWeight: 70, targetDate: '2027-05-31' },
      book: { title: 'The 48 Laws of Power', totalPages: 450, startDate: '2026-11-01', deadline: '2027-05-31' },
      booksDone: [],
      skills: [
        { id: 'future', text: 'Learn what is best for my future', status: 'notstarted', note: '', target: '', firstSkillDeadline: '' },
        { id: 'plans', text: 'Get investment plans', status: 'notstarted', note: '', target: '' },
        { id: 'invest', text: 'Learn how to invest', status: 'notstarted', note: '', target: '' },
        { id: 'talk', text: 'Learn how to talk to people', status: 'notstarted', note: '', target: '' }
      ],
      height: null, age: null, sex: '', activity: ''
    };
  }
  function makeDefaultData() {
    return {
      schemaVersion: SCHEMA_VERSION, settings: defaultSettings(), habits: defaultHabits(),
      schedule: defaultSchedule(), days: {}, goals: defaultGoals(), skillCycles: []
    };
  }

  function copy(x) { return JSON.parse(JSON.stringify(x)); }

  /* Fill anything missing with defaults, never overwrite what is there. */
  function fill(target, defaults) {
    Object.keys(defaults).forEach(function (k) {
      if (target[k] === undefined) target[k] = copy(defaults[k]);
      else if (defaults[k] && typeof defaults[k] === 'object' && !Array.isArray(defaults[k]) &&
        target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) fill(target[k], defaults[k]);
    });
    return target;
  }
  function normalize(data) {
    var def = makeDefaultData();
    data.settings = fill(data.settings || {}, def.settings);
    data.goals = fill(data.goals || {}, def.goals);
    if (!Array.isArray(data.habits) || !data.habits.length) data.habits = def.habits;
    data.habits.forEach(function (h, i) {
      if (typeof h.enabled !== 'boolean') h.enabled = true;
      if (typeof h.hidden !== 'boolean') h.hidden = false;
      if (typeof h.order !== 'number') h.order = i + 1;
      if (!Array.isArray(h.types)) h.types = ALL.slice();
    });
    data.schedule = data.schedule || {};
    DAY_TYPES.forEach(function (k) { if (!Array.isArray(data.schedule[k])) data.schedule[k] = def.schedule[k]; });
    data.days = data.days || {};
    Object.keys(data.days).forEach(function (k) {
      var r = data.days[k];
      r.date = k;
      if (!r.status || typeof r.status !== 'object') r.status = {};
      if (!r.meals || typeof r.meals !== 'object') r.meals = {};
    });
    if (!Array.isArray(data.skillCycles)) data.skillCycles = [];
    data.schemaVersion = data.schemaVersion || SCHEMA_VERSION;
    return data;
  }

  /* Migrations. MIGRATIONS[n] upgrades a data object from version n to n + 1.
     Add one function here whenever the stored shape changes, and raise SCHEMA_VERSION.
     Version 0 was a simple early format (days as a list of done / skipped ids). */
  var OLD_NOTE_V1 = 'If office is from 6:00, go by walk, and continue.';
  var MIGRATIONS = {
    0: function (d) {
      var out = makeDefaultData();
      out.schemaVersion = 0;
      if (d.settings && typeof d.settings === 'object') {
        Object.keys(d.settings).forEach(function (k) { out.settings[k] = d.settings[k]; });
      }
      if (d.goals && typeof d.goals === 'object') {
        Object.keys(d.goals).forEach(function (k) {
          if (k === 'startWeight') out.goals.body.startWeight = d.goals[k];
          else out.goals[k] = d.goals[k];
        });
      }
      var list = Array.isArray(d.days) ? d.days : [];
      list.forEach(function (e) {
        if (!e || !RT.dates.isValid(e.date)) return;
        var r = { date: e.date, status: {}, meals: {}, changed: e.changed || 0 };
        (e.done || []).forEach(function (id) { r.status[id] = 'done'; });
        (e.skipped || []).forEach(function (id) { r.status[id] = 'skipped'; });
        ['weight', 'note', 'steps', 'page'].forEach(function (k) { if (e[k] !== undefined) r[k] = e[k]; });
        out.days[e.date] = r;
      });
      if (Array.isArray(d.skillCycles)) out.skillCycles = d.skillCycles;
      return out;
    },
    /* Version 1 to 2: Sunday morning follows the work-day morning (walk at 6:00 included),
       and the 6:00 office note says what it means. Anything you edited yourself is left alone. */
    1: function (d) {
      var sig = function (rows) { return JSON.stringify((rows || []).map(function (r) { return [r.id, r.t, r.t2, r.text, r.on, r.src]; })); };
      if (d.schedule && sig(d.schedule.hol) === sig(holRowsV1())) d.schedule.hol = holRows();
      if (d.settings && d.settings.holidayNote === OLD_NOTE_V1) d.settings.holidayNote = defaultSettings().holidayNote;
      (d.habits || []).forEach(function (h) {
        if (h.id === 'walk' && Array.isArray(h.types) && h.types.slice().sort().join(',') === 'office,sat') h.types.push('hol');
      });
      return d;
    }
  };

  function migrate(data) {
    var v = typeof data.schemaVersion === 'number' ? data.schemaVersion : 0;
    if (v > SCHEMA_VERSION) throw new Error('newer');
    while (v < SCHEMA_VERSION) {
      if (!MIGRATIONS[v]) throw new Error('no migration from ' + v);
      data = MIGRATIONS[v](data);
      v += 1;
      data.schemaVersion = v;
    }
    return normalize(data);
  }

  RT.data = {
    SCHEMA_VERSION: SCHEMA_VERSION, DAY_TYPES: DAY_TYPES, DAY_TYPE_LABELS: DAY_TYPE_LABELS,
    defaultHabits: defaultHabits, defaultSchedule: defaultSchedule, defaultSettings: defaultSettings,
    defaultGoals: defaultGoals, makeDefaultData: makeDefaultData, normalize: normalize,
    migrate: migrate, MIGRATIONS: MIGRATIONS, copy: copy,
    _v1: { holRows: holRowsV1, note: OLD_NOTE_V1 }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = RT.data;
})(typeof self !== 'undefined' ? self : globalThis);
