const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const backendSource = fs.readFileSync('google-apps-script-log.gs', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(script[1]);

function makeSheet(id, name, rows = []) {
  return {
    rows: rows.map((row) => [...row]),
    getSheetId: () => id,
    getName: () => name,
    getLastRow() {
      return this.rows.findLastIndex((row) => row?.some((value) => value !== '' && value !== undefined)) + 1;
    },
    getLastColumn() { return Math.max(1, ...this.rows.map((row) => row?.length || 0)); },
    getMaxRows: () => 1000,
    getMaxColumns: () => 30,
    getRange(startRow, startColumn, count = 1, width = 1) {
      const sheet = this;
      return {
        getValues() {
          return Array.from({ length: count }, (_, row) =>
            Array.from({ length: width }, (_, col) =>
              sheet.rows[startRow + row - 1]?.[startColumn + col - 1] ?? ''));
        },
        setValues(values) {
          if (sheet.failNextWrite) {
            sheet.failNextWrite = false;
            throw new Error('Simulated write failure');
          }
          values.forEach((valuesRow, row) => {
            const target = sheet.rows[startRow + row - 1] ||= [];
            valuesRow.forEach((value, column) => { target[startColumn + column - 1] = value; });
          });
        }
      };
    },
    appendRow(values) { this.getRange(this.getLastRow() + 1, 1, 1, values.length).setValues([values]); }
  };
}

const sheets = [];
const spreadsheet = {
  getSheets: () => sheets,
  getSheetByName: (name) => sheets.find((sheet) => sheet.getName() === name),
  insertSheet(name) {
    const sheet = makeSheet(sheets.length, name);
    sheets.push(sheet);
    return sheet;
  }
};
let locked = false;
const context = vm.createContext({
  SpreadsheetApp: { openById: () => spreadsheet, flush() { assert.ok(locked); } },
  LockService: { getScriptLock: () => ({
    waitLock() { assert.equal(locked, false); locked = true; },
    releaseLock() { assert.equal(locked, true); locked = false; }
  }) },
  CacheService: { getScriptCache: () => ({ get: (key) => key === 'admin-session:valid' ? 'admin' : '' }) },
  Utilities: { formatDate: () => '2026-11-18', getUuid: () => 'new-staff-id' },
  console
});
vm.runInContext(backendSource, context);
const scriptValue = (expression) => vm.runInContext(expression, context);
const userName = 'Staff "A"';
const staffSheet = spreadsheet.insertSheet('Staff');
staffSheet.appendRow(['User ID', 'Name', 'Department', 'Position', 'Level', 'Other column']);
staffSheet.appendRow(['7', userName, 'ER', 'RN', 'Level 2', 'keep']);
staffSheet.appendRow(['7', 'Staff B', 'Other', 'RN', 'Level 2', 'other']);
const fiscalSheet = spreadsheet.insertSheet(scriptValue("getRequestSheetName_('2027-01-01')"));
fiscalSheet.appendRow(scriptValue('REQUEST_HEADERS'));
function addRequest(id, start, end, { name = userName, department = 'ER', status = 'Approved' } = {}) {
  fiscalSheet.appendRow([name, department, 'RN', 'Level 2', 'Off', start, end, status, id, '7', 'note', '2026-09-20T00:00:00Z']);
}
addRequest('101', '2026-12-06', '2026-12-07');
addRequest('102', '2026-12-30', '2027-01-03');
addRequest('103', '2027-01-06', '2027-01-07', { status: 'Pending' });
addRequest('104', '2027-01-06', '2027-01-07', { name: 'Staff B', department: 'Other' });
addRequest('105', '2027-01-08', '2027-01-08', { status: 'cancle' });
const session = { actorUserId: 'admin', adminSessionToken: 'valid' };
const mutate = (change) => context.manageStaff_(change, session);
const target = { userId: '7', userName };
const requests = () => context.getRequestData_().requests;
const audit = () => spreadsheet.getSheetByName('AdminAuditLog');

const levelChange = { action: 'updateStaff', ...target, field: 'level', oldValue: 'Level 2', value: 'Level 3', effectiveDate: '2027-01-01' };
assert.throws(() => context.manageStaff_(levelChange, { ...session, adminSessionToken: 'expired' }), /Admin/);
assert.equal(staffSheet.rows[1][4], 'Level 2');
assert.throws(() => mutate({ ...levelChange, effectiveDate: '2026-12-01' }), /Level/);
const levelResult = mutate(levelChange);
assert.equal(levelResult.requestCount, 2);
assert.equal(levelResult.requests.length, 3);
assert.equal(staffSheet.rows[1][4], 'Level 3');
assert.equal(staffSheet.rows[1][5], 'keep');
assert.equal(requests().find((request) => request.id === '101').level, 'Level 2');
assert.equal(requests().find((request) => request.id === '102').endDate, '2026-12-31');
const split = requests().find((request) => request.startDate === '2027-01-01');
assert.equal(split.level, 'Level 3');
assert.equal(split.endDate, '2027-01-03');
assert.equal(split.trainingNote, 'note');
assert.equal(requests().find((request) => request.id === '103').level, 'Level 3');
assert.equal(requests().find((request) => request.id === '103').status, 'Pending');
assert.equal(requests().find((request) => request.id === '104').level, 'Level 2');
assert.equal(requests().find((request) => request.id === '105').level, 'Level 2');
assert.equal(audit().rows[1][1], 'admin');
assert.equal(audit().rows[1][2], 'UPDATE_STAFF');
assert.equal(audit().rows[1][7], '2027-01-01');
assert.equal(audit().rows[1][10], 'Yes');
assert.equal(JSON.parse(audit().rows[1][11]).before.level, 'Level 2');
assert.equal(JSON.parse(audit().rows[1][11]).after.level, 'Level 3');

mutate({ action: 'addGroup', field: 'department', value: 'EMS team' });
assert.ok(context.getStaffData_().departments.includes('EMS team'));
const move = { action: 'updateStaff', ...target, field: 'department', oldValue: 'ER', value: 'EMS team' };
fiscalSheet.failNextWrite = true;
assert.throws(() => mutate(move), /Simulated write failure/);
assert.equal(staffSheet.rows[1][2], 'ER');
assert.equal(audit().getLastRow(), 3);
assert.equal(mutate(move).requestCount, 4);
assert.equal(requests().find((request) => request.id === '103').department, 'EMS team');
mutate({ action: 'renameGroup', field: 'department', oldValue: 'EMS team', value: 'Service' });
assert.equal(staffSheet.rows[1][2], 'Service');
assert.equal(requests().find((request) => request.id === '101').department, 'Service');
assert.equal(mutate({ action: 'deleteStaff', ...target }).requestCount, 4);
assert.equal(staffSheet.rows[1][5], 'keep');
assert.deepEqual(staffSheet.rows[1].slice(0, 5), ['', '', '', '', '']);
assert.equal(requests().find((request) => request.id === '103').status, 'cancle');
assert.equal(requests().find((request) => request.id === '104').status, 'Approved');
assert.equal(audit().rows.at(-1)[2], 'DELETE_STAFF');
mutate({ action: 'deleteGroup', field: 'department', oldValue: 'Other' });
assert.equal(requests().find((request) => request.id === '104').status, 'cancle');
assert.equal(audit().rows.at(-1)[2], 'DELETE_STAFF_GROUP');
mutate({ action: 'addStaff', user: { name: 'Replacement', department: 'Service', position: 'RN', level: 'Level 3' } });
assert.equal(context.getStaffData_().users[0].id, 'new-staff-id');
context.saveRequestRules_({ earlyCloseRules: [{ requestMonth: '2027-01', closeDate: '2026-11-17' }] });
assert.equal(context.getStaffLevelEffectiveDate_(), '2027-02-01');

const user = { id: '7', name: userName, department: 'ER', position: 'RN', level: 'Level 2' };
const otherUser = { id: '8', name: 'Staff B', department: 'ER', position: 'PN', level: 'Level 2' };
const elements = {
  'admin-user-table': {}, 'admin-position-filter': { value: '' },
  'admin-staff-search': { value: '' }, 'admin-user-table-count': {}
};
const clientChanges = [];
const client = vm.createContext({
  users: [user, otherUser], departments: ['ER'], levels: ['Level 2', 'Level 3'], positions: ['RN', 'PN'],
  document: { getElementById: (id) => elements[id] }, renderAdminPositionFilter() {},
  staffChangeInFlight: false, confirm: () => true, formatDisplayDate: String,
  getFirstAllowedMonthStartDate: () => '2027-01-01',
  saveStaffChange: (change) => clientChanges.push(change)
});
const functionNames = [
  'normalizeName', 'normalizeUserId', 'makeUserSelectValue', 'parseUserSelectValue', 'escapeExcelCell',
  'renderStaffOptions', 'renderAdminTable', 'confirmStaffLevelChange', 'handleStaffTableAction', 'handleStaffGroupAction'
];
vm.runInContext(functionNames.map((name) => {
  const begin = html.indexOf('        function ' + name + '(');
  assert.ok(begin >= 0, name);
  return html.slice(begin, html.indexOf('\n        }', begin) + '\n        }'.length);
}).join('\n'), client);
client.renderAdminTable();
const rowHtml = elements['admin-user-table'].innerHTML;
assert.ok(rowHtml.includes('Staff &quot;A&quot;'));
assert.ok(!/on(change|click)=/.test(rowHtml));
elements['admin-staff-search'].value = '  STAFFb ';
client.renderAdminTable();
assert.ok(elements['admin-user-table'].innerHTML.includes('Staff B'));
assert.ok(!elements['admin-user-table'].innerHTML.includes('Staff &quot;A&quot;'));
assert.match(elements['admin-user-table-count'].innerText, /1.*2/);
elements['admin-position-filter'].value = 'RN';
client.renderAdminTable();
assert.ok(!elements['admin-user-table'].innerHTML.includes('data-staff='));
elements['admin-staff-search'].value = '';
client.renderAdminTable();
assert.ok(elements['admin-user-table'].innerHTML.includes('Staff &quot;A&quot;'));
assert.ok(!elements['admin-user-table'].innerHTML.includes('Staff B'));
const row = { dataset: { staff: client.makeUserSelectValue(user) }, querySelector: () => ({ value: 'Level 3' }) };
function checkTableAction(staffAction, event, value) {
  const control = { dataset: { staffAction, event }, closest: () => row, value };
  client.handleStaffTableAction({ type: event, target: { closest: () => control } });
}
checkTableAction('level', 'click');
checkTableAction('department', 'change', 'Service');
checkTableAction('delete', 'click');
const groupControl = {
  dataset: { staffGroupAction: 'rename', event: 'change' },
  value: 'Service',
  closest: () => ({ dataset: { staffField: 'department', staffValue: 'ER' } })
};
client.handleStaffGroupAction({ type: 'change', target: { closest: () => groupControl } });
assert.equal(clientChanges[0].effectiveDate, '2027-01-01');
assert.equal(clientChanges[0].userName, userName);
assert.equal(clientChanges[1].field, 'department');
assert.equal(clientChanges[2].action, 'deleteStaff');
assert.equal(clientChanges[3].action, 'renameGroup');
console.log('PASS: Manage Staff controls, effective Level updates, shifts across month boundary, audited moves/deletions, and rollback.');
