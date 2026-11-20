const LOG_SPREADSHEET_ID = '1rqFhATUWTrNo0zfsUkcAiIyGjWZtjqXuwHT-KZ4393k';
const LEGACY_LOG_SHEET_ID = 2119652301;
const LEGACY_LOG_SHEET_NAME = 'บันทึกประวัติขอเวร';
const REQUEST_SHEET_PREFIX = 'ปีงบ ';
const STAFF_SHEET_ID = 0;
const STAFF_SHEET_NAME = 'Staff';
const STAFF_ID_COLUMN = 1;
const STAFF_START_COLUMN = 2;
const PUBLIC_HOLIDAY_SHEET_ID = 581119647;
const PUBLIC_HOLIDAY_SHEET_NAME = 'วันหยุด รพ.';
const REQUEST_SETTINGS_SHEET_NAME = 'RequestSettings';
const REQUEST_SETTINGS_KEY = 'requestRules';
const ADMIN_ACCOUNTS_SHEET_NAME = 'AdminAccounts';
const ADMIN_ACCOUNT_HEADERS = [
  'User ID',
  'Password Hash',
  'Salt',
  'Status',
  'Registered At',
  'Approved At',
  'Note'
];
const ADMIN_AUDIT_LOG_SHEET_NAME = 'AdminAuditLog';
const ADMIN_AUDIT_LOG_HEADERS = [
  'Timestamp',
  'Actor User ID',
  'Action',
  'Request ID',
  'Target User ID',
  'Target Name',
  'Leave Type',
  'Start Date',
  'End Date',
  'Status',
  'Verified Session',
  'Detail JSON'
];
const STAFF_CATALOG_KEY = 'staffCatalog';
const STAFF_CATALOG_DEFAULTS = {
  department: ['หน่วยบริการทางการแพทย์ฉุกเฉิน', 'รับ-ส่งต่อ'],
  position: ['พนักงานทั่วไป'],
  level: []
};
const SCRIPT_VERSION = '2026-11-20-request-quota';
const THAI_MONTH_INDEX = {
  'มกราคม': 0,
  'ม.ค.': 0,
  'ม.ค': 0,
  'กุมภาพันธ์': 1,
  'ก.พ.': 1,
  'ก.พ': 1,
  'มีนาคม': 2,
  'มี.ค.': 2,
  'มี.ค': 2,
  'เมษายน': 3,
  'เม.ย.': 3,
  'เม.ย': 3,
  'พฤษภาคม': 4,
  'พ.ค.': 4,
  'พ.ค': 4,
  'มิถุนายน': 5,
  'มิ.ย.': 5,
  'มิ.ย': 5,
  'กรกฎาคม': 6,
  'ก.ค.': 6,
  'ก.ค': 6,
  'สิงหาคม': 7,
  'ส.ค.': 7,
  'ส.ค': 7,
  'กันยายน': 8,
  'ก.ย.': 8,
  'ก.ย': 8,
  'ตุลาคม': 9,
  'ต.ค.': 9,
  'ต.ค': 9,
  'พฤศจิกายน': 10,
  'พ.ย.': 10,
  'พ.ย': 10,
  'ธันวาคม': 11,
  'ธ.ค.': 11,
  'ธ.ค': 11
};
const LOG_HEADERS = [
  'Name',
  'Department',
  'Position',
  'Level',
  'Leave Type',
  'Start Date',
  'End Date',
  'Status'
];
const STAFF_HEADERS = [
  'Name',
  'Department',
  'Position',
  'Level'
];
const REQUEST_HEADERS = [
  'Name',
  'Department',
  'Position',
  'Level',
  'Leave Type',
  'Start Date',
  'End Date',
  'Status',
  'Request ID',
  'User ID',
  'Note',
  'Timestamp'
];
const REQUEST_ACTIONS = [
  'CREATE_APPROVED_REQUEST',
  'CREATE_PENDING_REQUEST',
  'APPROVE_PENDING_REQUEST',
  'PROMOTE_PENDING_REQUEST',
  'EDIT_REQUEST_DATES',
  'DELETE_REQUEST'
];

function doGet(e) {
  const params = (e && e.parameter) || {};
  if (params.action === 'status') {
    return createJsonpResponse_(params.callback, {
      ok: true,
      version: SCRIPT_VERSION,
      hasAdminAccounts: getApprovedAdminAccountCount_() > 0,
      sheetId: LEGACY_LOG_SHEET_ID,
      requestSheetPrefix: REQUEST_SHEET_PREFIX,
      currentFiscalSheetName: getRequestSheetName_(new Date())
    });
  }

  if (params.action === 'getStaff') {
    return createJsonpResponse_(params.callback, getStaffData_());
  }

  if (params.action === 'bootstrap') {
    return createJsonpResponse_(params.callback, getBootstrapData_(params.scope === 'open'));
  }

  if (params.action === 'getRequests') {
    const window = params.scope === 'open' ? getOpenRequestWindow_(getRequestRulesData_().rules) : null;
    return createJsonpResponse_(params.callback, getRequestData_(window));
  }

  if (params.action === 'getPublicHolidays') {
    return createJsonpResponse_(params.callback, getPublicHolidayData_());
  }

  if (params.action === 'getRequestRules') {
    return createJsonpResponse_(params.callback, getRequestRulesData_());
  }

  if (params.action === 'saveRequestRules') {
    try {
      const rules = JSON.parse(params.rules || '{}');
      return createJsonpResponse_(params.callback, saveRequestRules_(rules));
    } catch (error) {
      return createJsonpResponse_(params.callback, {
        ok: false,
        message: error && error.message ? error.message : String(error)
      });
    }
  }

  if (params.action === 'manageStaff') {
    try {
      return createJsonpResponse_(params.callback, manageStaff_(JSON.parse(params.change || '{}'), params));
    } catch (error) {
      return createJsonpResponse_(params.callback, {
        ok: false,
        message: error && error.message ? error.message : String(error)
      });
    }
  }

  if (params.action === 'syncRequest') {
    try {
      const writeAction = String(params.writeAction || '').trim();
      if (!REQUEST_ACTIONS.includes(writeAction)) {
        return createJsonpResponse_(params.callback, { ok: false, message: 'Invalid request action' });
      }

      const detail = JSON.parse(params.detail || '{}');
      const result = syncRequest_(writeAction, detail, params.timestamp, params);
      if (!result.ok) return createJsonpResponse_(params.callback, result);
      return createJsonpResponse_(params.callback, {
        ...result,
        action: writeAction,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return createJsonpResponse_(params.callback, {
        ok: false,
        message: error && error.message ? error.message : String(error)
      });
    }
  }

  if (params.action === 'previewUserIds') {
    if (!isAdminLoginValid_(params.userId, params.password)) {
      return createJsonpResponse_(params.callback, { ok: false, message: 'UserID หรือ Password Admin ไม่ถูกต้อง หรือยังไม่ได้รับอนุมัติ' });
    }
    appendAdminAuditLog_('PREVIEW_USER_IDS', {}, {
      actorUserId: params.userId,
      sessionToken: params.adminSessionToken
    });
    return createJsonpResponse_(params.callback, auditRequestUserIdsFromStaff_(true));
  }

  if (params.action === 'repairUserIds') {
    if (!isAdminLoginValid_(params.userId, params.password)) {
      return createJsonpResponse_(params.callback, { ok: false, message: 'UserID หรือ Password Admin ไม่ถูกต้อง หรือยังไม่ได้รับอนุมัติ' });
    }
    const result = auditRequestUserIdsFromStaff_(false);
    appendAdminAuditLog_('REPAIR_USER_IDS', { updated: result.updated, checked: result.checked }, {
      actorUserId: params.userId,
      sessionToken: params.adminSessionToken
    });
    return createJsonpResponse_(params.callback, result);
  }

  if (params.action === 'registerAdmin') {
    return createJsonpResponse_(params.callback, registerAdminAccount_(params.userId, params.password));
  }

  if (params.action !== 'verifyAdmin') {
    return createJsonpResponse_(params.callback, { ok: false });
  }

  return createJsonpResponse_(params.callback, verifyAdminAccount_(params.userId, params.password));
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const detail = payload.detail || {};
    let result;
    if (payload.action === 'SAVE_REQUEST_RULES') {
      result = saveRequestRules_(detail.rules || {});
    } else if (REQUEST_ACTIONS.includes(payload.action)) {
      result = syncRequest_(payload.action, detail, detail.timestamp || payload.timestamp, payload);
    } else {
      return createJsonResponse_({ ok: false, message: 'Invalid request action' });
    }
    if (result.ok) appendAdminAuditLog_(payload.action, detail, payload);
    return createJsonResponse_(result);
  } catch (error) {
    return createJsonResponse_({ ok: false, message: error && error.message ? error.message : String(error) });
  }
}

function createJsonResponse_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(LOG_SPREADSHEET_ID);
}

function getLegacyLogSheet_(spreadsheet, createIfMissing) {
  let sheet = spreadsheet.getSheets().find((item) => item.getSheetId() === LEGACY_LOG_SHEET_ID);
  if (!sheet) {
    sheet = spreadsheet.getSheetByName(LEGACY_LOG_SHEET_NAME);
  }
  if (!sheet && createIfMissing) {
    sheet = spreadsheet.insertSheet(LEGACY_LOG_SHEET_NAME);
  }
  if (sheet) {
    ensureRequestHeader_(sheet);
  }
  return sheet;
}

function getRequestSheet_(spreadsheet, dateValue) {
  const sheetName = getRequestSheetName_(dateValue);
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }
  ensureRequestHeader_(sheet);
  return sheet;
}

function getRequestSheetName_(dateValue) {
  return `${REQUEST_SHEET_PREFIX}${getShortThaiFiscalYear_(dateValue)}`;
}

function getShortThaiFiscalYear_(dateValue) {
  const date = parseRequestDate_(dateValue);
  const fiscalYear = date.getMonth() >= 9 ? date.getFullYear() + 1 : date.getFullYear();
  return String(fiscalYear + 543).slice(-2);
}

function parseRequestDate_(value) {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  const parsedDate = new Date(text);
  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate;
  }

  return new Date();
}

function isFiscalRequestSheet_(sheet) {
  return new RegExp(`^${REQUEST_SHEET_PREFIX}\\d{2}$`).test(sheet.getName());
}

function getAllRequestSheets_(spreadsheet) {
  const fiscalSheets = spreadsheet
    .getSheets()
    .filter(isFiscalRequestSheet_)
    .sort((a, b) => a.getName().localeCompare(b.getName(), 'th'));
  const legacySheet = getLegacyLogSheet_(spreadsheet, false);
  return legacySheet ? [legacySheet, ...fiscalSheets] : fiscalSheets;
}

function getStaffSheet_() {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheets().find((item) => item.getSheetId() === STAFF_SHEET_ID);
  if (!sheet) {
    sheet = spreadsheet.getSheetByName(STAFF_SHEET_NAME);
  }
  if (!sheet) {
    sheet = spreadsheet.insertSheet(STAFF_SHEET_NAME);
  }
  ensureStaffHeader_(sheet);
  return sheet;
}

function getStaffData_() {
  const users = getStaffRecords_(getStaffSheet_()).map(({ user }) => user);
  return makeStaffData_(users, getStaffCatalog_().catalog);
}

function canonicalStaffDepartment_(value) {
  const text = String(value || '').trim();
  const compact = text.replace(/\s+/g, '');
  if (/บริการ.*แพทย์ฉุกเฉิน/.test(compact)) return 'หน่วยบริการทางการแพทย์ฉุกเฉิน';
  if (/รับ-?ส่งต่อ/.test(compact)) return 'รับ-ส่งต่อ';
  return text;
}

function getStaffColumns_(sheet) {
  const headers = sheet.getRange(1, STAFF_START_COLUMN, 1, STAFF_HEADERS.length).getValues()[0].map((value) => String(value || '').trim());
  const nameIndex = findHeaderIndex_(headers, ['Name', 'ชื่อ', 'รายชื่อ']);
  const departmentIndex = findHeaderIndex_(headers, ['Department', 'หน่วยงาน', 'หน่วย']);
  const positionIndex = findHeaderIndex_(headers, ['Position', 'ตำแหน่ง']);
  const levelIndex = findHeaderIndex_(headers, ['Level', 'ระดับ']);
  const hasHeader = [nameIndex, departmentIndex, positionIndex, levelIndex].some((index) => index >= 0);
  return {
    firstDataRow: hasHeader ? 2 : 1,
    columns: {
      id: 0,
      name: (nameIndex < 0 ? 0 : nameIndex) + 1,
      department: (departmentIndex < 0 ? 1 : departmentIndex) + 1,
      position: (positionIndex < 0 ? 2 : positionIndex) + 1,
      level: (levelIndex < 0 ? 3 : levelIndex) + 1
    }
  };
}

function getStaffRecords_(sheet) {
  const lastRow = sheet.getLastRow();
  const { firstDataRow, columns } = getStaffColumns_(sheet);
  if (lastRow < firstDataRow) return [];
  const values = sheet.getRange(firstDataRow, STAFF_ID_COLUMN, lastRow - firstDataRow + 1, STAFF_HEADERS.length + 1).getValues();
  return values.map((row, index) => {
    const user = Object.fromEntries(Object.entries(columns).map(([field, column]) => [field, String(row[column] || '').trim()]));
    user.department = canonicalStaffDepartment_(user.department);
    return { row, rowIndex: firstDataRow + index, columns, user };
  }).filter(({ user }) => Object.values(user).every(Boolean));
}

function makeStaffData_(users, catalog) {
  return {
    ok: true,
    users,
    departments: uniqueValues_([...catalog.department, ...users.map((user) => user.department)]),
    positions: uniqueValues_([...catalog.position, ...users.map((user) => user.position)]),
    levels: uniqueValues_([...catalog.level, ...users.map((user) => user.level)])
  };
}

function getBootstrapData_(openOnly) {
  const requestRules = getRequestRulesData_();
  return {
    ok: true,
    version: SCRIPT_VERSION,
    staff: getStaffData_(),
    requests: getRequestData_(openOnly ? getOpenRequestWindow_(requestRules.rules) : null),
    holidays: getPublicHolidayData_(),
    requestRules
  };
}

function getStaffCatalog_() {
  const sheet = getRequestSettingsSheet_();
  const lastRow = sheet.getLastRow();
  const rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 3).getValues() : [];
  const index = rows.findIndex((row) => row[0] === STAFF_CATALOG_KEY);
  const row = index < 0 ? null : rows[index];
  const stored = row ? JSON.parse(row[1] || '{}') : {};
  const catalog = Object.fromEntries(Object.entries(STAFF_CATALOG_DEFAULTS).map(([field, defaults]) =>
    [field, Array.isArray(stored[field]) ? stored[field] : defaults.slice()]));
  return { sheet, catalog, row, rowIndex: index + 2 };
}

function getStaffLevelEffectiveDate_() {
  return getFirstOpenRequestMonth_(getRequestRulesData_().rules.earlyCloseRules);
}

function getOpenRequestWindow_(rules) {
  const startDate = getFirstOpenRequestMonth_(rules.earlyCloseRules);
  const [year, month] = startDate.split('-').map(Number);
  const endDate = new Date(Date.UTC(year, month + 5, 0)).toISOString().slice(0, 10);
  return { startDate, endDate };
}

function getFirstOpenRequestMonth_(earlyCloseRules) {
  const today = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
  const [year, month] = today.split('-').map(Number);
  for (let offset = 0; ; offset += 1) {
    const monthKey = new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7);
    const standardDeadline = new Date(Date.UTC(year, month - 3 + offset, 25)).toISOString().slice(0, 10);
    const deadline = earlyCloseRules.filter((rule) => rule.requestMonth === monthKey)
      .reduce((earliest, rule) => rule.closeDate < earliest ? rule.closeDate : earliest, standardDeadline);
    if (today <= deadline) return monthKey + '-01';
  }
}

function manageStaff_(change, params) {
  const actor = getVerifiedAdminUserId_(params.actorUserId, params.adminSessionToken);
  if (!actor) throw new Error('เซสชัน Admin หมดอายุ กรุณาเข้าสู่ระบบใหม่');
  return withSpreadsheetWriteLock_(() => applyStaffChange_(change, actor));
}

function withSpreadsheetWriteLock_(write) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return write();
  } finally {
    lock.releaseLock();
  }
}

function applyStaffChange_(change, actor) {
  const { action, field } = change;
  const isGroup = ['addGroup', 'renameGroup', 'deleteGroup'].includes(action);
  const isEdit = ['updateStaff', 'renameGroup'].includes(action);
  const isDelete = ['deleteStaff', 'deleteGroup'].includes(action);
  if (!isEdit && !isDelete && !['addStaff', 'addGroup'].includes(action)) throw new Error('ไม่รู้จักรายการแก้ไข');
  const editableFields = isGroup ? ['department', 'position', 'level'] : ['name', 'department', 'position', 'level'];
  if ((isGroup || isEdit) && !editableFields.includes(field)) throw new Error('ไม่รู้จักข้อมูลที่ต้องแก้ไข');

  const staffSheet = getStaffSheet_();
  const records = getStaffRecords_(staffSheet);
  const users = records.map(({ user }) => user);
  const catalogRecord = getStaffCatalog_();
  const catalog = catalogRecord.catalog;
  const staff = makeStaffData_(users, catalog);
  const listKey = { department: 'departments', position: 'positions', level: 'levels' }[field];
  const oldValue = isEdit || action === 'deleteGroup' ? staffValue_(field, change.oldValue) : '';
  const newValue = isEdit || action === 'addGroup' ? staffValue_(field, change.value) : '';
  let effectiveDate = '';
  if (isEdit && oldValue === newValue) throw new Error('ค่าใหม่ตรงกับค่าเดิม');
  if (isEdit && field === 'level') {
    effectiveDate = getStaffLevelEffectiveDate_();
    if (change.effectiveDate !== effectiveDate) {
      throw new Error('เดือนที่เปิดรับคำขอมีการเปลี่ยนแปลง กรุณารีเฟรชก่อนบันทึก Level');
    }
  }

  let selected = [];
  if (isGroup) {
    const options = staff[listKey];
    if (action !== 'addGroup' && !options.includes(oldValue)) throw new Error('ไม่พบรายการเดิม กรุณารีเฟรช');
    if (newValue && options.includes(newValue)) throw new Error('มีรายการนี้อยู่แล้ว');
    if (action !== 'addGroup') selected = records.filter(({ user }) => user[field] === oldValue);
    catalog[field] = catalog[field].filter((value) => value !== oldValue);
    if (newValue) catalog[field].push(newValue);
  } else if (action !== 'addStaff') {
    selected = records.filter(({ user }) => user.id === change.userId && user.name === change.userName);
    if (selected.length !== 1 || isEdit && selected[0].user[field] !== oldValue) {
      throw new Error('ข้อมูลเจ้าหน้าที่เปลี่ยนแปลงหรือซ้ำกัน กรุณารีเฟรชก่อนทำรายการ');
    }
  }

  const writes = [];
  const appendRows = new Map();
  let addedUser = null;
  if (action === 'addStaff') {
    const { columns } = getStaffColumns_(staffSheet);
    const row = Array(STAFF_HEADERS.length + 1).fill('');
    addedUser = { id: Utilities.getUuid() };
    Object.keys(columns).filter((key) => key !== 'id').forEach((key) => {
      addedUser[key] = staffValue_(key, change.user && change.user[key]);
    });
    Object.entries(columns).forEach(([key, column]) => { row[column] = addedUser[key]; });
    queueStaffAppend_(writes, appendRows, staffSheet, row);
  }
  if (isGroup) {
    const row = [STAFF_CATALOG_KEY, JSON.stringify(catalog), new Date()];
    if (catalogRecord.row) {
      queueStaffRow_(writes, catalogRecord.sheet, catalogRecord.rowIndex, catalogRecord.row, row);
    } else {
      queueStaffAppend_(writes, appendRows, catalogRecord.sheet, row);
    }
  }

  const staffChanges = new Map();
  selected.forEach(({ user, row, rowIndex, columns }) => {
    if (isDelete) {
      staffChanges.set(user, null);
      queueStaffRow_(writes, staffSheet, rowIndex, row, row.map(() => ''));
      return;
    }
    if (field === 'name' && users.some((other) => other !== user && other.id === user.id && other.name === newValue)) {
      throw new Error('ชื่อและ User ID ซ้ำกับเจ้าหน้าที่อีกราย');
    }
    staffChanges.set(user, { ...user, [field]: newValue });
    const column = columns[field];
    writes.push({ range: staffSheet.getRange(rowIndex, column + 1), before: [[row[column]]], after: [[newValue]] });
  });

  const changedRequests = planStaffRequestChanges_(
    writes, appendRows, users, staffChanges, field, effectiveDate, action === 'renameGroup' ? oldValue : ''
  );
  const singleUser = !isGroup && selected.length ? selected[0].user : null;
  const detail = {
    userId: (singleUser || addedUser || {}).id || '',
    name: (singleUser || addedUser || {}).name || '',
    field, effectiveDate, startDate: effectiveDate,
    before: isGroup ? oldValue : singleUser,
    after: isGroup ? newValue : (singleUser ? staffChanges.get(singleUser) : addedUser),
    staffCount: selected.length + Number(Boolean(addedUser)),
    requestCount: changedRequests.filter((item) => !item.split).length,
    splitCount: changedRequests.filter((item) => item.split).length
  };
  const auditActions = {
    addStaff: 'ADD_STAFF', updateStaff: 'UPDATE_STAFF', deleteStaff: 'DELETE_STAFF',
    addGroup: 'ADD_STAFF_GROUP', renameGroup: 'RENAME_STAFF_GROUP', deleteGroup: 'DELETE_STAFF_GROUP'
  };
  queueStaffAppend_(writes, appendRows, getAdminAuditLogSheet_(), makeAdminAuditLogRow_(auditActions[action], detail, actor, true));
  commitStaffWrites_(writes);

  const nextUsers = users.map((user) => staffChanges.has(user) ? staffChanges.get(user) : user).filter(Boolean);
  if (addedUser) nextUsers.push(addedUser);
  return {
    ok: true,
    staff: makeStaffData_(nextUsers, catalog),
    requests: changedRequests.map((item) => item.request),
    requestCount: detail.requestCount
  };
}

function staffValue_(field, value) {
  const text = field === 'department' ? canonicalStaffDepartment_(value) : String(value || '').trim();
  if (!text || text.startsWith('=') || text.length > 250) throw new Error('ข้อมูลเจ้าหน้าที่ไม่ถูกต้อง');
  return text;
}

function planStaffRequestChanges_(writes, appendRows, users, staffChanges, field, effectiveDate, oldGroupValue) {
  if (!staffChanges.size) return [];
  const spreadsheet = getSpreadsheet_();
  const byId = new Map();
  getAllRequestSheets_(spreadsheet).forEach((sheet) => {
    getRequestRowsFromSheet_(sheet).forEach((record) => {
      const id = String(record.request.id);
      const existing = byId.get(id) || [];
      existing.push({ ...record, sheet });
      byId.set(id, existing);
    });
  });
  let nextId = Date.now() * 100;
  const changes = [];
  const isActive = (request) => ['Approved', 'Pending'].includes(String(request.status || '').trim());
  const requestColumn = { name: 0, department: 1, position: 2, level: 3 }[field];
  byId.forEach((copies) => {
    const latest = copies.reduce((a, b) => getTimestampValue_(a.request.timestamp) > getTimestampValue_(b.request.timestamp) ? a : b);
    const { request } = latest;
    if (!isActive(request)) return;
    const requestValue = field === 'department' ? canonicalStaffDepartment_(request.department) : String(request[field] || '').trim();
    if (oldGroupValue && requestValue !== oldGroupValue) return;
    const idMatches = users.filter((user) => user.id === String(request.userId || '').trim());
    const user = idMatches.length === 1 ? idMatches[0] : findStaffUserForRequest_(request, users);
    if (!staffChanges.has(user)) return;
    const nextUser = staffChanges.get(user);
    if (!nextUser) {
      copies.filter((record) => isActive(record.request)).forEach((record) => {
        writes.push({ range: record.sheet.getRange(record.rowIndex, 8), before: [[record.row[7]]], after: [['cancle']] });
      });
      changes.push({ request: { ...request, status: 'cancle' } });
    } else if (!effectiveDate || request.startDate >= effectiveDate) {
      if (String(latest.row[requestColumn]) === nextUser[field]) return;
      const range = latest.sheet.getRange(latest.rowIndex, requestColumn + 1);
      writes.push({ range, before: [[latest.row[requestColumn]]], after: [[nextUser[field]]] });
      changes.push({ request: { ...request, [field]: nextUser[field] } });
    } else if (request.endDate >= effectiveDate && String(latest.row[requestColumn]) !== nextUser[field]) {
      while (byId.has(String(nextId))) nextId += 1;
      const priorDate = new Date(effectiveDate + 'T00:00:00Z');
      priorDate.setUTCDate(priorDate.getUTCDate() - 1);
      const previousEnd = priorDate.toISOString().slice(0, 10);
      const endRange = latest.sheet.getRange(latest.rowIndex, 7);
      writes.push({ range: endRange, before: [[latest.row[6]]], after: [[previousEnd]] });
      const splitRow = latest.row.slice();
      splitRow[requestColumn] = nextUser[field];
      splitRow[5] = effectiveDate;
      splitRow[8] = String(nextId++);
      const sheet = getRequestSheet_(spreadsheet, effectiveDate);
      queueStaffAppend_(writes, appendRows, sheet, splitRow);
      changes.push(
        { request: { ...request, endDate: previousEnd } },
        { request: { ...request, id: splitRow[8], startDate: effectiveDate, [field]: nextUser[field], sourceSheet: sheet.getName() }, split: true }
      );
    }
  });
  return changes;
}

function queueStaffRow_(writes, sheet, index, before, after) {
  writes.push({ range: sheet.getRange(index, 1, 1, after.length), before: [before], after: [after] });
}

function queueStaffAppend_(writes, appendRows, sheet, row) {
  const id = sheet.getSheetId();
  const index = (appendRows.get(id) || sheet.getLastRow()) + 1;
  appendRows.set(id, index);
  if (index > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), index - sheet.getMaxRows());
  if (row.length > sheet.getMaxColumns()) sheet.insertColumnsAfter(sheet.getMaxColumns(), row.length - sheet.getMaxColumns());
  queueStaffRow_(writes, sheet, index, row.map(() => ''), row);
}

function commitStaffWrites_(writes) {
  const applied = [];
  try {
    writes.forEach((write) => {
      applied.push(write);
      write.range.setValues(write.after);
    });
    SpreadsheetApp.flush();
  } catch (error) {
    let rollbackFailed = false;
    applied.reverse().forEach((write) => {
      try {
        write.range.setValues(write.before);
      } catch (rollbackError) {
        rollbackFailed = true;
        console.error(rollbackError);
      }
    });
    SpreadsheetApp.flush();
    if (rollbackFailed) throw new Error('บันทึกไม่ครบ กรุณาตรวจข้อมูลใน Google Sheet ก่อนทำรายการซ้ำ');
    throw error;
  }
}

function getRequestSettingsSheet_() {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(REQUEST_SETTINGS_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(REQUEST_SETTINGS_SHEET_NAME);
  }
  ensureRequestSettingsHeader_(sheet);
  return sheet;
}

function ensureRequestSettingsHeader_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Key', 'Value', 'Updated At']);
    return;
  }

  const headers = sheet.getRange(1, 1, 1, 3).getValues()[0];
  if (headers[0] !== 'Key' || headers[1] !== 'Value' || headers[2] !== 'Updated At') {
    sheet.getRange(1, 1, 1, 3).setValues([['Key', 'Value', 'Updated At']]);
  }
}

function normalizeRequestRules_(rules) {
  const earlyCloseRules = ((rules && rules.earlyCloseRules) || [])
    .map((rule) => ({
      id: String(rule.id || rule.requestMonth || '').trim(),
      requestMonth: String(rule.requestMonth || '').trim(),
      closeDate: String(rule.closeDate || '').trim(),
      reason: String(rule.reason || '').trim()
    }))
    .filter((rule) => /^\d{4}-\d{2}$/.test(rule.requestMonth) && /^\d{4}-\d{2}-\d{2}$/.test(rule.closeDate))
    .sort((a, b) => a.requestMonth.localeCompare(b.requestMonth) || a.closeDate.localeCompare(b.closeDate));

  const blockedDates = ((rules && rules.blockedDates) || [])
    .map((rule) => ({
      id: String(rule.id || rule.date || '').trim(),
      date: String(rule.date || '').trim(),
      reason: String(rule.reason || '').trim()
    }))
    .filter((rule) => /^\d{4}-\d{2}-\d{2}$/.test(rule.date))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    earlyCloseRules,
    blockedDates
  };
}

function getRequestRulesData_() {
  const sheet = getRequestSettingsSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return {
      ok: true,
      rules: normalizeRequestRules_({})
    };
  }

  const rows = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  const record = rows.find((row) => String(row[0] || '').trim() === REQUEST_SETTINGS_KEY);
  if (!record || !String(record[1] || '').trim()) {
    return {
      ok: true,
      rules: normalizeRequestRules_({})
    };
  }

  try {
    return {
      ok: true,
      rules: normalizeRequestRules_(JSON.parse(String(record[1]))),
      updatedAt: record[2] || ''
    };
  } catch (error) {
    return {
      ok: true,
      rules: normalizeRequestRules_({}),
      updatedAt: record[2] || '',
      message: 'RequestSettings JSON ไม่ถูกต้อง ระบบใช้ค่าเริ่มต้น'
    };
  }
}

function saveRequestRules_(rules) {
  return withSpreadsheetWriteLock_(() => {
    const result = writeRequestRules_(rules);
    SpreadsheetApp.flush();
    return result;
  });
}

function writeRequestRules_(rules) {
  const sheet = getRequestSettingsSheet_();
  const normalizedRules = normalizeRequestRules_(rules);
  const payload = JSON.stringify(normalizedRules);
  const lastRow = sheet.getLastRow();
  let targetRow = 0;

  if (lastRow >= 2) {
    const keys = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    const index = keys.findIndex((row) => String(row[0] || '').trim() === REQUEST_SETTINGS_KEY);
    if (index >= 0) targetRow = index + 2;
  }

  const row = [REQUEST_SETTINGS_KEY, payload, new Date().toISOString()];
  if (targetRow) {
    sheet.getRange(targetRow, 1, 1, 3).setValues([row]);
  } else {
    sheet.appendRow(row);
  }

  return {
    ok: true,
    rules: normalizedRules
  };
}

function getPublicHolidaySheet_() {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheets().find((item) => item.getSheetId() === PUBLIC_HOLIDAY_SHEET_ID);
  if (!sheet) {
    sheet = spreadsheet.getSheetByName(PUBLIC_HOLIDAY_SHEET_NAME);
  }
  return sheet;
}

function getPublicHolidayData_() {
  const sheet = getPublicHolidaySheet_();
  if (!sheet) {
    return {
      ok: false,
      message: 'ไม่พบชีทวันหยุด รพ.'
    };
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 1) {
    return {
      ok: true,
      holidays: {},
      holidayRows: [],
      count: 0
    };
  }

  const columnCount = Math.max(3, Math.min(4, sheet.getLastColumn()));
  const values = sheet.getRange(1, 1, lastRow, columnCount).getValues();
  const holidays = {};
  const holidayRows = [];

  values.forEach((row, index) => {
    const date = parsePublicHolidayDate_(row[1]);
    const name = String(row[2] || '').trim();
    if (!date || !name) return;

    holidays[date] = name;
    holidayRows.push({
      rowIndex: index + 1,
      date,
      name,
      month: String(row[0] || '').trim(),
      note: String(row[3] || '').trim()
    });
  });

  return {
    ok: true,
    holidays,
    holidayRows,
    count: holidayRows.length,
    sourceSheet: sheet.getName(),
    updatedAt: new Date().toISOString()
  };
}

function parsePublicHolidayDate_(value) {
  if (value instanceof Date) {
    return formatSheetDate_(value);
  }

  const text = String(value || '').trim();
  if (!text || text.indexOf('รอประกาศ') >= 0) return '';

  const isoMatch = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]) - 1;
    const day = Number(isoMatch[3]);
    return formatDateParts_(year, month, day);
  }

  const thaiMatch = text.match(/(\d{1,2})\s*([^\s\d]+)\s*(\d{4})/);
  if (!thaiMatch) return '';

  const day = Number(thaiMatch[1]);
  const month = THAI_MONTH_INDEX[thaiMatch[2]];
  let year = Number(thaiMatch[3]);
  if (month === undefined || Number.isNaN(day) || Number.isNaN(year)) return '';
  if (year > 2400) year -= 543;

  return formatDateParts_(year, month, day);
}

function formatDateParts_(year, month, day) {
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return '';
  const date = new Date(year, month, day);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return '';
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function getRequestData_(window = null, spreadsheet = getSpreadsheet_()) {
  const sheets = getAllRequestSheets_(spreadsheet);
  const requestById = {};

  sheets.forEach((sheet) => {
    getRequestRowsFromSheet_(sheet).forEach(({ request }) => {
      const key = String(request.id);
      const existing = requestById[key];
      if (!existing || getTimestampValue_(request.timestamp) >= getTimestampValue_(existing.timestamp)) {
        requestById[key] = request;
      }
    });
  });

  const requests = Object.values(requestById)
    .filter((request) => request.id && request.name && request.startDate && request.endDate && request.status)
    .filter((request) => !window || (request.startDate <= window.endDate && request.endDate >= window.startDate))
    .sort((a, b) => getTimestampValue_(a.timestamp) - getTimestampValue_(b.timestamp));

  return {
    ok: true,
    requests,
    ...(window ? { requestWindow: window } : {}),
    requestSheets: sheets.map((sheet) => sheet.getName())
  };
}

function getRequestRowsFromSheet_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastColumn = Math.max(REQUEST_HEADERS.length, sheet.getLastColumn());
  if (lastRow < 2) {
    return [];
  }

  const rows = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  return rows
    .map((row, index) => ({
      rowIndex: index + 2,
      row,
      request: {
        id: row[8] || `${sheet.getName()}-row-${index + 2}`,
        userId: row[9],
        name: row[0],
        department: row[1],
        position: row[2],
        level: row[3],
        leaveType: row[4],
        trainingNote: row[10],
        startDate: formatSheetDate_(row[5]),
        endDate: formatSheetDate_(row[6]),
        status: row[7],
        timestamp: row[11],
        sourceSheet: sheet.getName()
      }
    }))
    .filter((item) => item.request.id && item.request.name && item.request.startDate && item.request.endDate && item.request.status);
}

function syncRequest_(action, detail, clientTimestamp, actor = {}) {
  const requestId = String(detail.requestId || '').trim();
  if (!requestId) throw new Error('ไม่พบรหัสคำขอเวร');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const spreadsheet = getSpreadsheet_();
    if (['CREATE_APPROVED_REQUEST', 'CREATE_PENDING_REQUEST'].includes(action)) {
      const requests = getRequestData_(null, spreadsheet).requests;
      let hasSharedUserId;
      const matchesUser = (request) => isSameUserForDuplicate_(request, detail, (userId) => {
        if (hasSharedUserId === undefined) {
          hasSharedUserId = getStaffRecords_(getStaffSheet_()).filter(({ user }) => String(user.id).trim() === userId).length > 1;
        }
        return hasSharedUserId;
      });
      if (action === 'CREATE_PENDING_REQUEST') {
        const existing = requests.find((request) => String(request.id).trim() === requestId);
        if (existing) {
          const sameRequest = matchesUser(existing)
            && existing.startDate === detail.startDate
            && existing.endDate === detail.endDate
            && existing.leaveType === detail.leaveType;
          if (sameRequest && ['Pending', 'Approved'].includes(existing.status)) {
            return { ok: true, requestId: detail.requestId };
          }
          return { ok: false, message: 'รหัสคำขอนี้ถูกใช้แล้ว กรุณาตรวจสอบรายการล่าสุด' };
        }
      }
      if (isDuplicateCreateRequest_(requests, detail, requestId, matchesUser)) {
        throw new Error('มีคำขอเวรวันที่เลือกอยู่แล้ว ยกเว้นคำขอยกเลิก');
      }
      const standardApproval = action === 'CREATE_APPROVED_REQUEST'
        && !getVerifiedAdminUserId_(actor.actorUserId, actor.adminSessionToken);
      if (standardApproval && !hasApprovedRequestQuota_(requests, detail, requestId)) {
        return { ok: false, code: 'QUOTA_FULL', message: 'โควต้าเต็ม สามารถยื่นเป็นตัวสำรองได้' };
      }
    }
    const matchingRows = findRequestRows_(spreadsheet, requestId);
    const sheet = getRequestSheet_(spreadsheet, detail.startDate || detail.endDate || clientTimestamp);
    const status = {
      CREATE_APPROVED_REQUEST: 'Approved',
      CREATE_PENDING_REQUEST: 'Pending',
      DELETE_REQUEST: 'cancle'
    }[action] || detail.status || '';
    const row = [
      detail.name || '',
      detail.department || '',
      detail.position || '',
      detail.level || '',
      detail.leaveType || '',
      detail.startDate || '',
      detail.endDate || '',
      status,
      requestId,
      detail.userId || '',
      detail.trainingNote || '',
      clientTimestamp || new Date().toISOString()
    ];

    if (
      matchingRows.length === 1
      && matchingRows[0].sheet.getSheetId() === sheet.getSheetId()
    ) {
      sheet.getRange(matchingRows[0].rowIndex, 1, 1, REQUEST_HEADERS.length).setValues([row]);
    } else {
      deleteRequestRows_(matchingRows);
      sheet.appendRow(row);
    }
    SpreadsheetApp.flush();
    return { ok: true, requestId: detail.requestId };
  } finally {
    lock.releaseLock();
  }
}

function getDateRange_(startDate, endDate) {
  const dates = [];
  const current = parseRequestDate_(startDate);
  const end = parseRequestDate_(endDate || startDate);
  while (current <= end) {
    dates.push(formatSheetDate_(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function isSameUserForDuplicate_(request, detail, hasSharedUserId) {
  const requestUserId = String(request.userId || '').trim();
  const detailUserId = String(detail.userId || '').trim();

  const requestName = normalizeName_(request.name);
  const detailName = normalizeName_(detail.name);
  if (requestUserId && detailUserId) {
    return requestUserId === detailUserId
      && (requestName === detailName || !hasSharedUserId(detailUserId));
  }
  return Boolean(
    requestName
    && detailName
    && requestName === detailName
    && (!request.department || String(request.department || '') === String(detail.department || ''))
    && (!request.position || String(request.position || '') === String(detail.position || ''))
  );
}

function isDuplicateCreateRequest_(requests, detail, requestId, matchesUser) {
  if (String(detail.leaveType || '').trim() === 'ยกเลิก') return false;

  const endDate = detail.endDate || detail.startDate;
  return requests.some((request) => (
    String(request.id || '').trim() !== String(requestId)
    && !['cancel', 'cancle'].includes(String(request.status || '').trim().toLowerCase())
    && String(request.leaveType || '').trim() !== 'ยกเลิก'
    && request.startDate <= endDate && request.endDate >= detail.startDate
    && matchesUser(request)
  ));
}

function hasApprovedRequestQuota_(requests, detail, requestId) {
  const limit = detail.level === 'Level 5' ? 3 : 2;
  const approved = requests.filter((request) => (
    String(request.id).trim() !== requestId
    && request.status === 'Approved'
    && request.department === detail.department
    && request.position === detail.position
    && request.level === detail.level
  ));
  return getDateRange_(detail.startDate, detail.endDate).every((date) => (
    approved.filter((request) => request.startDate <= date && request.endDate >= date).length < limit
  ));
}

function migrateLegacyRequestsToFiscalSheets() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const spreadsheet = getSpreadsheet_();
    const legacySheet = getLegacyLogSheet_(spreadsheet, false);
    if (!legacySheet) {
      return { ok: true, migrated: 0 };
    }

    const records = getRequestRowsFromSheet_(legacySheet)
      .filter(({ row }) => String(row[8] || '').trim());

    records.forEach(({ row, request }) => {
      const sheet = getRequestSheet_(spreadsheet, request.startDate);
      const matchingRows = findRequestRows_(spreadsheet, request.id);
      const normalizedRow = REQUEST_HEADERS.map((_, index) => row[index] || '');

      if (
        matchingRows.length === 1
        && matchingRows[0].sheet.getSheetId() === sheet.getSheetId()
      ) {
        sheet.getRange(matchingRows[0].rowIndex, 1, 1, REQUEST_HEADERS.length).setValues([normalizedRow]);
      } else {
        deleteRequestRows_(matchingRows);
        sheet.appendRow(normalizedRow);
      }
    });

    return {
      ok: true,
      migrated: records.length
    };
  } finally {
    lock.releaseLock();
  }
}

function ensureStaffHeader_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, STAFF_ID_COLUMN, 1, STAFF_HEADERS.length + 1).setValues([['User ID', ...STAFF_HEADERS]]);
  }
}

function ensureRequestHeader_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(REQUEST_HEADERS);
    return;
  }

  const headerRange = sheet.getRange(1, 1, 1, REQUEST_HEADERS.length);
  const currentHeaders = headerRange.getValues()[0];
  const needsHeaderUpdate = REQUEST_HEADERS.some((header, index) => currentHeaders[index] !== header);
  if (needsHeaderUpdate) {
    headerRange.setValues([REQUEST_HEADERS]);
  }
}

function findHeaderIndex_(headers, names) {
  const loweredNames = names.map((name) => String(name).toLowerCase());
  return headers.findIndex((header) => loweredNames.includes(String(header).toLowerCase()));
}

function uniqueValues_(values) {
  return [...new Set(values.filter(Boolean))];
}

function findRequestRows_(spreadsheet, requestId) {
  return getAllRequestSheets_(spreadsheet)
    .flatMap((sheet) => {
      const lastRow = sheet.getLastRow();
      if (lastRow < 2) return [];
      const values = sheet.getRange(2, 9, lastRow - 1, 1).getValues();
      return values
        .map((row, index) => ({
          sheet,
          rowIndex: index + 2,
          requestId: String(row[0] || '').trim()
        }))
        .filter((record) => record.requestId === String(requestId));
    });
}

function deleteRequestRows_(records) {
  records
    .slice()
    .sort((a, b) => {
      const sheetOrder = a.sheet.getSheetId() - b.sheet.getSheetId();
      return sheetOrder || b.rowIndex - a.rowIndex;
    })
    .forEach((record) => {
      record.sheet.deleteRow(record.rowIndex);
    });
}

function previewRequestUserIdsFromStaff() {
  return auditRequestUserIdsFromStaff_(true);
}

function repairRequestUserIdsFromStaff() {
  return auditRequestUserIdsFromStaff_(false);
}

function auditRequestUserIdsFromStaff_(dryRun) {
  const spreadsheet = getSpreadsheet_();
  const staffUsers = getStaffData_().users || [];
  const sheets = getAllRequestSheets_(spreadsheet);
  const changes = [];
  let checked = 0;
  let updated = 0;
  let skipped = 0;

  sheets.forEach((sheet) => {
    getRequestRowsFromSheet_(sheet).forEach(({ request, rowIndex }) => {
      checked += 1;
      const staffUser = findStaffUserForRequest_(request, staffUsers);
      const nextUserId = String((staffUser && staffUser.id) || '').trim();
      const currentUserId = String(request.userId || '').trim();

      if (!nextUserId) {
        skipped += 1;
        if (changes.length < 50) {
          changes.push({
            sheet: sheet.getName(),
            row: rowIndex,
            name: request.name || '',
            currentUserId,
            nextUserId: '',
            status: 'ไม่พบรายชื่อที่ตรงกัน'
          });
        }
        return;
      }

      if (currentUserId !== nextUserId) {
        updated += 1;
        if (!dryRun) {
          sheet.getRange(rowIndex, 10).setValue(nextUserId);
        }
        if (changes.length < 50) {
          changes.push({
            sheet: sheet.getName(),
            row: rowIndex,
            name: request.name || '',
            currentUserId,
            nextUserId,
            status: dryRun ? 'ต้องแก้ไข' : 'แก้ไขแล้ว'
          });
        }
      }
    });
  });

  return {
    ok: true,
    dryRun: Boolean(dryRun),
    checked,
    updated,
    skipped,
    changedSample: changes
  };
}

function findStaffUserForRequest_(request, staffUsers) {
  const requestName = normalizeName_(request.name);
  const currentUserId = String(request.userId || '').trim();

  if (requestName) {
    const exactMatch = staffUsers.find((user) => (
      normalizeName_(user.name) === requestName
      && String(user.department || '') === String(request.department || '')
      && String(user.position || '') === String(request.position || '')
      && String(user.level || '') === String(request.level || '')
    ));
    if (exactMatch) return exactMatch;

    const samePositionMatch = staffUsers.find((user) => (
      normalizeName_(user.name) === requestName
      && String(user.department || '') === String(request.department || '')
      && String(user.position || '') === String(request.position || '')
    ));
    if (samePositionMatch) return samePositionMatch;

    const nameMatches = staffUsers.filter((user) => normalizeName_(user.name) === requestName);
    if (nameMatches.length === 1) return nameMatches[0];

    if (nameMatches.length > 1 && currentUserId) {
      const sameIdAndName = nameMatches.find((user) => String(user.id || '').trim() === currentUserId);
      if (sameIdAndName) return sameIdAndName;
    }
  }

  if (!currentUserId) return null;
  const idMatches = staffUsers.filter((user) => String(user.id || '').trim() === currentUserId);
  return idMatches.length === 1 ? idMatches[0] : null;
}

function normalizeName_(value) {
  return String(value || '').replace(/\s+/g, '').trim();
}

function getAdminAccountsSheet_() {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(ADMIN_ACCOUNTS_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(ADMIN_ACCOUNTS_SHEET_NAME);
  }
  ensureAdminAccountsHeader_(sheet);
  return sheet;
}

function ensureAdminAccountsHeader_(sheet) {
  const headerRange = sheet.getRange(1, 1, 1, ADMIN_ACCOUNT_HEADERS.length);
  const headers = headerRange.getValues()[0];
  const hasHeader = ADMIN_ACCOUNT_HEADERS.every((header, index) => headers[index] === header);
  if (!hasHeader) {
    headerRange.setValues([ADMIN_ACCOUNT_HEADERS]);
  }
}

function normalizeAdminUserId_(userId) {
  return String(userId || '').trim().toLowerCase();
}

function makeAdminSalt_() {
  return Utilities.getUuid().replace(/-/g, '') + String(Date.now());
}

function hashAdminPassword_(password, salt) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    `${salt}:${String(password || '')}`,
    Utilities.Charset.UTF_8
  );
  return digest.map((byte) => {
    const value = byte < 0 ? byte + 256 : byte;
    return value.toString(16).padStart(2, '0');
  }).join('');
}

function getAdminAccountRows_() {
  const sheet = getAdminAccountsSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, ADMIN_ACCOUNT_HEADERS.length)
    .getValues()
    .map((row, index) => ({
      rowIndex: index + 2,
      userId: normalizeAdminUserId_(row[0]),
      passwordHash: String(row[1] || '').trim(),
      salt: String(row[2] || '').trim(),
      status: String(row[3] || '').trim(),
      registeredAt: row[4],
      approvedAt: row[5],
      note: row[6]
    }))
    .filter((account) => account.userId);
}

function getApprovedAdminAccountCount_() {
  return getAdminAccountRows_().filter((account) => isAdminAccountApproved_(account.status)).length;
}

function registerAdminAccount_(userId, password) {
  const normalizedUserId = normalizeAdminUserId_(userId);
  const rawPassword = String(password || '');

  if (!/^[a-z0-9._@-]{3,64}$/.test(normalizedUserId)) {
    return { ok: false, message: 'UserID ต้องมี 3-64 ตัวอักษร และใช้ได้เฉพาะ a-z, 0-9, จุด, ขีดกลาง, ขีดล่าง หรือ @' };
  }

  if (rawPassword.length < 8) {
    return { ok: false, message: 'Password ต้องมีอย่างน้อย 8 ตัวอักษร' };
  }

  const sheet = getAdminAccountsSheet_();
  const existing = getAdminAccountRows_().find((account) => account.userId === normalizedUserId);
  if (existing) {
    return {
      ok: false,
      message: isAdminAccountApproved_(existing.status)
        ? 'UserID นี้ได้รับอนุมัติแล้ว กรุณาเข้าสู่ระบบ'
        : 'UserID นี้ลงทะเบียนแล้วและรออนุมัติหลังบ้าน'
    };
  }

  const salt = makeAdminSalt_();
  sheet.appendRow([
    normalizedUserId,
    hashAdminPassword_(rawPassword, salt),
    salt,
    'Pending',
    new Date(),
    '',
    'Approve by changing Status to Approved'
  ]);

  return {
    ok: true,
    pendingApproval: true,
    message: 'ลงทะเบียน Admin แล้ว กรุณารอผู้ดูแลหลังบ้านอนุมัติในชีท AdminAccounts'
  };
}

function verifyAdminAccount_(userId, password) {
  if (isAdminLoginValid_(userId, password)) {
    const normalizedUserId = normalizeAdminUserId_(userId);
    const sessionToken = createAdminSession_(normalizedUserId);
    return { ok: true, message: '', userId: normalizedUserId, sessionToken };
  }
  const normalizedUserId = normalizeAdminUserId_(userId);
  const account = getAdminAccountRows_().find((item) => item.userId === normalizedUserId);
  if (account && !isAdminAccountApproved_(account.status)) {
    return { ok: false, message: 'บัญชี Admin นี้ยังไม่ได้รับอนุมัติหลังบ้าน' };
  }
  return { ok: false, message: 'UserID หรือ Password Admin ไม่ถูกต้อง' };
}

function isAdminAccountApproved_(status) {
  return ['approved', 'approve'].includes(String(status || '').trim().toLowerCase());
}

function isAdminLoginValid_(userId, password) {
  const normalizedUserId = normalizeAdminUserId_(userId);
  const rawPassword = String(password || '');
  if (!normalizedUserId || !rawPassword) return false;
  const account = getAdminAccountRows_().find((item) => item.userId === normalizedUserId);
  if (!account || !isAdminAccountApproved_(account.status) || !account.passwordHash || !account.salt) return false;
  return hashAdminPassword_(rawPassword, account.salt) === account.passwordHash;
}

function createAdminSession_(userId) {
  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put(`admin-session:${token}`, normalizeAdminUserId_(userId), 21600);
  return token;
}

function getVerifiedAdminUserId_(actorUserId, sessionToken) {
  const normalizedActor = normalizeAdminUserId_(actorUserId);
  const token = String(sessionToken || '').trim();
  if (!normalizedActor || !token) return '';
  const cachedUserId = CacheService.getScriptCache().get(`admin-session:${token}`);
  return cachedUserId === normalizedActor ? normalizedActor : '';
}

function getAdminAuditLogSheet_() {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(ADMIN_AUDIT_LOG_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(ADMIN_AUDIT_LOG_SHEET_NAME);
  }
  ensureAdminAuditLogHeader_(sheet);
  return sheet;
}

function ensureAdminAuditLogHeader_(sheet) {
  const headerRange = sheet.getRange(1, 1, 1, ADMIN_AUDIT_LOG_HEADERS.length);
  const headers = headerRange.getValues()[0];
  const hasHeader = ADMIN_AUDIT_LOG_HEADERS.every((header, index) => headers[index] === header);
  if (!hasHeader) {
    headerRange.setValues([ADMIN_AUDIT_LOG_HEADERS]);
  }
}

function shouldAuditAdminAction_(action, payload) {
  if (String(payload.role || '') !== 'admin' && !String(payload.actorUserId || '').trim()) {
    return false;
  }
  return [
    'SAVE_REQUEST_RULES',
    'APPROVE_PENDING_REQUEST',
    'PROMOTE_PENDING_REQUEST',
    'EDIT_REQUEST_DATES',
    'DELETE_REQUEST',
    'PREVIEW_USER_IDS',
    'REPAIR_USER_IDS'
  ].includes(action);
}

function appendAdminAuditLog_(action, detail, payload) {
  if (!shouldAuditAdminAction_(action, payload || {})) return;
  const actorUserId = normalizeAdminUserId_((payload && payload.actorUserId) || (payload && payload.userId));
  const sessionToken = payload && (payload.sessionToken || payload.adminSessionToken);
  const verifiedActor = getVerifiedAdminUserId_(actorUserId, sessionToken);
  const row = makeAdminAuditLogRow_(action, detail, verifiedActor || actorUserId || 'unknown', Boolean(verifiedActor));
  withSpreadsheetWriteLock_(() => {
    getAdminAuditLogSheet_().appendRow(row);
    SpreadsheetApp.flush();
  });
}

function makeAdminAuditLogRow_(action, detail, actor, verified) {
  const safeDetail = detail || {};
  return [
    new Date(),
    actor,
    action,
    safeDetail.requestId || '',
    safeDetail.userId || '',
    safeDetail.name || '',
    safeDetail.leaveType || '',
    safeDetail.startDate || '',
    safeDetail.endDate || '',
    safeDetail.status || '',
    verified ? 'Yes' : 'No',
    JSON.stringify(safeDetail)
  ];
}

function getTimestampValue_(value) {
  if (value instanceof Date) {
    return value.getTime();
  }
  const timestamp = new Date(value || 0).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatSheetDate_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(value || '').trim();
}

function createJsonpResponse_(callback, data) {
  const safeCallback = /^[A-Za-z_$][\w$]*$/.test(callback || '') ? callback : 'callback';
  return ContentService
    .createTextOutput(`${safeCallback}(${JSON.stringify(data)});`)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
