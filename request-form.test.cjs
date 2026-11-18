const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const html = fs.readFileSync('index.html', 'utf8');
const fields = Object.fromEntries(['form-user-select', 'form-start-date', 'form-end-date', 'form-leave-type', 'form-request-note', 'form-request-note-label', 'form-request-note-section'].map(id => [id, {
    value: '', classList: { toggle(name, hidden) { this.hidden = hidden; } }
}]));
const departmentSelect = fields['form-department-select'] = { value: '' };
const positionSelect = fields['form-position-select'] = { value: '' };
const userSelect = fields['form-user-select'];
const user = { id: 'TEST', name: 'Test', level: 'Level 2', department: 'ER', position: 'RN' };
const alerts = [];
const writes = [];
const ctx = {
    document: { getElementById: id => fields[id] },
    departments: ['ER', 'EMS', 'Empty'], positions: ['RN', 'PN', 'General'],
    users: [user, { id: 'OTHER', name: 'Other', level: 'Level 2', department: 'EMS', position: 'PN' }],
    makeUserSelectValue: user => user.id,
    renderRequestSummaryFilters() {}, renderRequestSummary() {},
    getSummaryFilterState: () => ({ isActive: false }),
    prompt: () => { throw Error('prompt() is not supported.'); },
    alert: message => alerts.push(message),
    parseUserSelectValue: () => ({ id: user.id }), findUserById: () => user,
    getDateRange: () => ['2027-01-21'], canRequestMoreThanNineDays: () => false,
    getMaxConsecutiveRequestDays: () => 1, currentRole: 'admin', shiftRequests: [],
    getTrainingBlockedDate: () => null, findDuplicateRequestDate: () => null,
    getQuotaLimit: () => 2, getApprovedCount: () => 0, createUniqueRequestId: () => 1,
    cloneShiftRequestsSnapshot: () => [], getRequestLogDetail: request => request,
    logAction: async (action, detail) => { writes.push({ action, detail }); return true; },
    showCalendarMonth() {}, renderCalendar() {}, renderAdminReserveQueue() {},
    getApprovedRequestsForCancel: () => [{}], isSameRequestUser: () => false
};
vm.createContext(ctx);
for (const name of [
    'updateRequestNoteField', 'handleShiftRequest', 'renderPositionDropdowns', 'renderUserDropdowns',
    'getCalendarFilterState', 'matchesCalendarRequestFilter', 'renderStaffOptions', 'escapeExcelCell'
]) {
    const match = new RegExp(`        (?:async )?function ${name}\\(`).exec(html);
    assert(match, name);
    const start = match.index;
    const end = html.slice(start + 1).search(/\n        (?:async function |function |window\.)/);
    vm.runInContext(html.slice(start, start + 1 + end), ctx);
}

ctx.renderPositionDropdowns();
ctx.renderUserDropdowns();
assert.equal(departmentSelect.value, '');
assert.equal(positionSelect.value, '');
assert.equal(positionSelect.disabled, true);
assert.equal(userSelect.disabled, true);
assert.equal(ctx.getCalendarFilterState().department, '');
assert.equal(ctx.matchesCalendarRequestFilter(user), false);
departmentSelect.value = 'ER';
ctx.renderPositionDropdowns({ resetPosition: true });
ctx.renderUserDropdowns();
assert.equal(positionSelect.value, '');
assert.equal(positionSelect.disabled, false);
assert.match(positionSelect.innerHTML, /value="RN"/);
assert.doesNotMatch(positionSelect.innerHTML, /value="PN"/);
assert.equal(userSelect.disabled, true);
positionSelect.value = 'RN';
ctx.renderUserDropdowns();
assert.equal(userSelect.value, '');
assert.equal(userSelect.disabled, false);
assert.match(userSelect.innerHTML, /value="TEST"/);
assert.equal(ctx.matchesCalendarRequestFilter(user), true);
userSelect.value = 'TEST';
ctx.renderPositionDropdowns();
ctx.renderUserDropdowns();
assert.equal(positionSelect.value, 'RN');
assert.equal(userSelect.value, 'TEST');
departmentSelect.value = 'EMS';
ctx.renderPositionDropdowns({ resetPosition: true });
ctx.renderUserDropdowns();
assert.equal(positionSelect.value, '');
assert.equal(userSelect.value, '');
assert.equal(userSelect.disabled, true);
departmentSelect.value = 'Empty';
ctx.renderPositionDropdowns({ resetPosition: true });
assert.equal(positionSelect.disabled, true);

(async () => {
    fields['form-start-date'].value = fields['form-end-date'].value = '2027-01-21';
    for (const leaveType of ['ลากิจ', 'อบรม', 'ลาป่วย', 'ยกเลิก']) {
        ctx.shiftRequests = [];
        fields['form-leave-type'].value = leaveType;
        ctx.updateRequestNoteField();
        assert.equal(fields['form-request-note'].required, true);
        assert.equal(fields['form-request-note'].disabled, false);
        fields['form-request-note'].value = '  Test note  ';
        await ctx.handleShiftRequest();
        assert.equal(writes.at(-1).detail.trainingNote, 'Test note');
        const count = writes.length;
        fields['form-request-note'].value = '   ';
        await ctx.handleShiftRequest();
        assert.equal(writes.length, count, 'blank notes must not save');
    }
    fields['form-leave-type'].value = 'Off';
    ctx.updateRequestNoteField();
    assert.equal(fields['form-request-note'].required, false);
    assert.equal(fields['form-request-note'].disabled, true);
    assert.equal(fields['form-request-note-section'].classList.hidden, true);
    console.log('PASS: personal/training/sick/cancellation notes save without prompt; blank notes rejected; Off note disabled.');
})().catch(error => { console.error(error); process.exitCode = 1; });
