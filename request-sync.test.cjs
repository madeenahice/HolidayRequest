const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync('index.html', 'utf8');
const appSource = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .find((match) => match[1].includes('const GOOGLE_SHEET_LOG_URL'))[1];
const serverSource = fs.readFileSync('google-apps-script-log.gs', 'utf8');

function loadApp(overrides = {}) {
  const app = vm.createContext({
    window: {},
    document: { addEventListener() {}, getElementById: () => ({ classList: { contains: () => true } }) },
    AbortController,
    setTimeout,
    clearTimeout,
    ...overrides
  });
  vm.runInContext(appSource, app);
  return app;
}

function loadServer() {
  const server = vm.createContext({
    Utilities: { formatDate: () => '2026-11-20' },
    ContentService: {
      MimeType: { JSON: 'json', JAVASCRIPT: 'js' },
      createTextOutput(body) { return { body, setMimeType() { return this; } }; }
    }
  });
  vm.runInContext(serverSource, server);
  return server;
}

const request = (id, startDate, endDate = startDate, timestamp = '2026-11-01') => ({
  id, name: 'Test Staff', status: 'Approved', startDate, endDate, timestamp
});

test('open bootstrap uses saved deadlines and includes requests overlapping either boundary', () => {
  const server = loadServer();
  server.getRequestRulesData_ = () => ({
    ok: true,
    rules: { earlyCloseRules: [{ requestMonth: '2027-01', closeDate: '2026-11-19' }] }
  });
  server.getStaffData_ = () => ({ ok: true, users: [] });
  server.getPublicHolidayData_ = () => ({ ok: true, holidays: {} });

  const tabs = ['prior', 'current'];
  const records = {
    prior: [
      request('older', '2026-09-01'),
      request('carryover', '2026-09-30', '2027-02-01'),
      request('moved', '2026-09-30', '2027-02-01')
    ],
    current: [
      request('before', '2027-01-31'),
      request('first-day', '2027-02-01'),
      request('last-day', '2027-07-31', '2027-08-02'),
      request('after', '2027-08-01'),
      request('moved', '2027-08-02', '2027-08-02', '2026-11-02')
    ]
  };
  server.getSpreadsheet_ = () => ({});
  server.getAllRequestSheets_ = () => tabs.map((name) => ({ getName: () => name }));
  server.getRequestRowsFromSheet_ = (sheet) => records[sheet.getName()].map((entry) => ({ request: entry }));
  const get = (action, scope) => {
    const output = server.doGet({ parameter: { action, scope } }).body;
    return JSON.parse(output.slice('callback('.length, -2));
  };

  const scoped = get('bootstrap', 'open').requests;
  assert.deepEqual(scoped.requestWindow, { startDate: '2027-02-01', endDate: '2027-07-31' });
  assert.deepEqual(scoped.requests.map(({ id }) => id), ['carryover', 'first-day', 'last-day']);
  assert.deepEqual(get('getRequests', 'open'), scoped);
  assert.equal(get('getRequests').requests.length, 7);
});

test('server responds with a failure when the Sheet rejects a write', () => {
  const server = loadServer();
  const audit = [];
  server.appendAdminAuditLog_ = (...args) => audit.push(args);
  const detail = { requestId: 'test-id', timestamp: '2026-11-20T00:00:00.000Z' };
  const post = () => JSON.parse(server.doPost({
    postData: { contents: JSON.stringify({ action: 'CREATE_APPROVED_REQUEST', detail }) }
  }).body);
  server.syncRequest_ = () => { throw new Error('Sheet rejected write'); };
  assert.deepEqual(post(), { ok: false, message: 'Sheet rejected write' });
  assert.equal(audit.length, 0);

  server.syncRequest_ = (action, written, timestamp) => {
    assert.equal(action, 'CREATE_APPROVED_REQUEST');
    assert.equal(written.requestId, detail.requestId);
    assert.equal(timestamp, detail.timestamp);
    return { ok: true, requestId: written.requestId };
  };
  assert.deepEqual(post(), { ok: true, requestId: detail.requestId });
  assert.equal(audit.length, 1);
});

function makeQuotaServer(staff = []) {
  const server = loadServer();
  const records = [];
  let locked = false;
  server.getSpreadsheet_ = () => ({});
  server.getRequestData_ = () => ({ ok: true, requests: records });
  server.getStaffSheet_ = () => ({});
  server.getStaffRecords_ = () => staff.map((user) => ({ user }));
  server.getAllRequestSheets_ = () => [];
  server.Session = { getScriptTimeZone: () => 'Asia/Bangkok' };
  server.Utilities.formatDate = (date) => [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
  server.LockService = {
    getScriptLock: () => ({
      waitLock() { assert.equal(locked, false); locked = true; },
      releaseLock() { assert.equal(locked, true); locked = false; }
    })
  };
  server.SpreadsheetApp = { flush() { assert.ok(locked); } };
  server.getRequestSheet_ = () => ({
    appendRow(row) {
      assert.ok(locked);
      const [name, department, position, level, leaveType, startDate, endDate, status, id, userId] = row;
      records.push({ name, department, position, level, leaveType, startDate, endDate, status, id, userId });
    }
  });
  const post = (payload) => JSON.parse(server.doPost({
    postData: { contents: JSON.stringify(payload) }
  }).body);
  return { records, post };
}

const quotaRequest = (id, overrides = {}) => ({
  requestId: id, userId: id, name: id, department: 'ER', position: 'RN', level: 'Level 2',
  startDate: '2027-02-02', endDate: '2027-02-02', leaveType: 'Off', ...overrides
});

test('server enforces only approved quota per day and accepts an unlimited reserve queue', () => {
  const { records, post } = makeQuotaServer();
  const approve = (detail) => post({ action: 'CREATE_APPROVED_REQUEST', detail });
  const reserve = (detail) => post({ action: 'CREATE_PENDING_REQUEST', detail });

  for (let index = 0; index < 15; index += 1) {
    assert.equal(reserve(quotaRequest('reserve-' + index, { status: 'Approved' })).ok, true);
  }
  assert.equal(approve(quotaRequest('first')).ok, true);
  assert.equal(approve(quotaRequest('second')).ok, true);
  assert.equal(approve(quotaRequest('third', { startDate: '2027-02-01' })).code, 'QUOTA_FULL');
  assert.equal(reserve(quotaRequest('third')).ok, true);
  assert.equal(reserve(quotaRequest('third')).ok, true);
  assert.equal(reserve(quotaRequest('duplicate', { userId: 'third' })).ok, false);
  assert.equal(records.filter(({ status }) => status === 'Pending').length, 16);
  records.find(({ id }) => id === 'third').status = 'Approved';
  assert.equal(reserve(quotaRequest('third')).ok, true);
  assert.equal(records.find(({ id }) => id === 'third').status, 'Approved');

  assert.equal(approve(quotaRequest('other-position', { position: 'PN' })).ok, true);
  assert.equal(approve(quotaRequest('other-department', { department: 'Clinic' })).ok, true);
  for (let index = 0; index < 3; index += 1) {
    assert.equal(approve(quotaRequest('senior-' + index, { level: 'Level 5' })).ok, true);
  }
  assert.equal(approve(quotaRequest('senior-4', { level: 'Level 5' })).code, 'QUOTA_FULL');
  assert.equal(reserve(quotaRequest('senior-4', { level: 'Level 5' })).ok, true);
});

test('different staff with the same legacy ID can both request the same full-quota date', () => {
  const { records, post } = makeQuotaServer([
    { id: 'staff-id', name: 'First Staff' },
    { id: 'staff-id', name: 'Second Staff' },
    { id: 'unique-id', name: 'Current Name' }
  ]);
  const first = quotaRequest('first', { userId: 'staff-id', name: 'First Staff' });
  const second = quotaRequest('second', { userId: 'staff-id', name: 'Second Staff' });
  assert.equal(post({ action: 'CREATE_APPROVED_REQUEST', detail: first }).ok, true);
  assert.equal(post({ action: 'CREATE_APPROVED_REQUEST', detail: quotaRequest('other') }).ok, true);
  assert.equal(post({ action: 'CREATE_APPROVED_REQUEST', detail: second }).code, 'QUOTA_FULL');
  assert.equal(post({ action: 'CREATE_PENDING_REQUEST', detail: second }).ok, true);
  assert.equal(post({
    action: 'CREATE_PENDING_REQUEST', detail: { ...second, requestId: 'duplicate-second' }
  }).ok, false);
  assert.equal(records.find(({ id }) => id === 'second').status, 'Pending');

  const beforeRename = quotaRequest('unique', { userId: 'unique-id', name: 'Previous Name' });
  assert.equal(post({ action: 'CREATE_PENDING_REQUEST', detail: beforeRename }).ok, true);
  assert.equal(post({
    action: 'CREATE_PENDING_REQUEST', detail: { ...beforeRename, requestId: 'renamed', name: 'Current Name' }
  }).ok, false);
});

test('form opens reserve confirmation for either full-quota path and retries with the same request', async () => {
  for (const locallyFull of [true, false]) {
    const { records, post } = makeQuotaServer();
    post({ action: 'CREATE_APPROVED_REQUEST', detail: quotaRequest('first') });
    post({ action: 'CREATE_APPROVED_REQUEST', detail: quotaRequest('second') });
    post({ action: 'CREATE_PENDING_REQUEST', detail: quotaRequest('already-reserved') });
    const fields = {
      'form-user-select': { value: 'new-user' },
      'form-start-date': { value: '2027-02-02' },
      'form-end-date': { value: '2027-02-02' },
      'form-leave-type': { value: 'Off' },
      'reserve-save-status': { hidden: true, textContent: '' },
      'reserve-modal': { classList: new Set(['hidden']) }
    };
    fields['reserve-modal'].classList.remove = fields['reserve-modal'].classList.delete;
    const reserveWrites = [];
    const user = { id: 'new-user', name: 'New user', department: 'ER', position: 'RN', level: 'Level 2' };
    const app = loadApp({
      console: { warn() {} },
      alert() {},
      document: { addEventListener() {}, getElementById: (id) => fields[id] },
      async fetch(url, options) {
        const payload = JSON.parse(options.body);
        const result = post(payload);
        if (payload.action === 'CREATE_PENDING_REQUEST') {
          reserveWrites.push(payload.detail);
          if (reserveWrites.length === 1) throw new Error('Lost confirmation after saving');
        }
        return { ok: true, json: async () => result };
      }
    });
    app.parseUserSelectValue = () => user;
    app.findUserById = () => user;
    app.showTransientStatus = () => {};
    app.scheduleRealtimeRefresh = () => {};
    app.renderCalendar = () => {};
    app.renderAdminReserveQueue = () => {};
    app.seed = locallyFull ? records.slice() : [];
    vm.runInContext('requestToday.setFullYear(2026, 10, 20); shiftRequests = seed;', app);

    await app.handleShiftRequest();
    assert.equal(fields['reserve-modal'].classList.has('hidden'), false);
    await app.saveReserveShift();
    assert.equal(fields['reserve-modal'].classList.has('hidden'), false);
    assert.equal(fields['reserve-save-status'].hidden, false);
    assert.match(fields['reserve-save-status'].textContent, /ยังไม่ได้รับผลยืนยัน/);
    await app.saveReserveShift();
    assert.equal(fields['reserve-modal'].classList.has('hidden'), true);
    assert.equal(reserveWrites[0].requestId, reserveWrites[1].requestId);
    assert.deepEqual(records.filter(({ userId }) => userId === user.id).map(({ status }) => status), ['Pending']);
  }
});

test('client waits for confirmation and sends a single POST per request', async () => {
  let confirmWrite;
  const writes = [];
  const status = [];
  const app = loadApp({
    console: { warn() {} },
    fetch: (url, options) => {
      writes.push(options);
      return new Promise((resolve) => { confirmWrite = resolve; });
    }
  });
  app.showTransientStatus = (message, style) => status.push({ message, style });
  app.scheduleRealtimeRefresh = () => {};
  app.requestAppsScriptJsonp = () => assert.fail('POST must be the only write');

  const write = () => app.logAction('CREATE_APPROVED_REQUEST', { requestId: 'test-id' });
  const first = write();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].method, 'POST');
  assert.notEqual(writes[0].mode, 'no-cors');
  assert.equal(status.length, 1);
  assert.match(status[0].style, /amber/);
  confirmWrite({ ok: true, json: async () => ({ ok: false, message: 'Duplicate request' }) });
  assert.equal(await first, false);
  assert.equal(status.at(-1).message, 'Duplicate request');
  assert.ok(status.every(({ style }) => !style.includes('emerald')));

  const second = write();
  confirmWrite({ ok: true, json: async () => ({ ok: true, requestId: 'test-id' }) });
  assert.equal(await second, true);
  assert.equal(writes.length, 2);
  assert.match(status.at(-1).style, /emerald/);

  const unconfirmed = write();
  confirmWrite({ ok: true, json: async () => { throw new SyntaxError('Invalid response'); } });
  assert.equal(await unconfirmed, false);
  assert.match(status.at(-1).style, /red/);
  assert.match(status.at(-1).message, /ยังไม่ได้รับผลยืนยัน/);
});

test('client loads the open window before starting a shared history read', async () => {
  const app = loadApp();
  const calls = [];
  const current = request('in-window', '2027-02-02');
  const prior = request('history', '2026-09-01');
  let finishBootstrap;
  app.requestAppsScriptJsonpWithRetry = (action, params) => {
    calls.push([action, params.scope]);
    if (action === 'bootstrap') return new Promise((resolve) => { finishBootstrap = resolve; });
    return Promise.resolve({ ok: true, requests: [current, prior] });
  };
  app.applyStaffData = () => {};
  app.normalizeShiftRequests = (requests) => requests;
  app.getRealtimeSignature = JSON.stringify;
  app.updateRealtimeStatus = () => {};
  app.renderCalendar = () => {};
  app.renderRequestSummary = () => {};
  app.renderAdminReserveQueue = () => {};

  const initial = vm.runInContext('initialDataPromise = loadInitialData()', app);
  assert.deepEqual(calls, [['bootstrap', 'open']]);
  finishBootstrap({
    ok: true, staff: {},
    requests: { ok: true, requests: [current], requestWindow: { startDate: '2027-02-01', endDate: '2027-07-31' } }
  });
  assert.equal(await initial, true);
  assert.deepEqual(vm.runInContext('shiftRequests', app), [current]);
  assert.deepEqual(calls, [['bootstrap', 'open']]);

  const results = await Promise.all([app.ensureFullRequestHistory(), app.ensureFullRequestHistory()]);
  assert.deepEqual(results, [true, true]);
  assert.deepEqual(calls, [['bootstrap', 'open'], ['getRequests', undefined]]);
  assert.deepEqual(vm.runInContext('shiftRequests', app), [current, prior]);
});

test('client filters the initial view when the deployed server still returns full history', async () => {
  const app = loadApp();
  const current = request('in-window', '2027-01-02');
  const prior = request('history', '2026-09-01');
  app.requestAppsScriptJsonpWithRetry = async () => ({
    ok: true, staff: {}, requests: { ok: true, requests: [prior, current] }
  });
  app.applyStaffData = () => {};
  app.normalizeShiftRequests = (requests) => requests;
  app.getRealtimeSignature = JSON.stringify;
  app.updateRealtimeStatus = () => {};
  vm.runInContext('requestToday.setFullYear(2026, 10, 20)', app);
  assert.equal(await app.loadInitialData(), true);
  assert.deepEqual(Array.from(vm.runInContext('shiftRequests', app)), [current]);
});
