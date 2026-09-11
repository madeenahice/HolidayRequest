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
const SCRIPT_VERSION = '2026-09-11-admin-account-audit-log';
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

  if (params.action === 'getRequests') {
    return createJsonpResponse_(params.callback, getRequestData_());
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

  if (params.action === 'syncRequest') {
    try {
      const writeAction = String(params.writeAction || '').trim();
      if (!REQUEST_ACTIONS.includes(writeAction)) {
        return createJsonpResponse_(params.callback, { ok: false, message: 'Invalid request action' });
      }

      const detail = JSON.parse(params.detail || '{}');
      syncRequest_(writeAction, detail, params.timestamp || new Date().toISOString());
      return createJsonpResponse_(params.callback, {
        ok: true,
        action: writeAction,
        requestId: detail.requestId || '',
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
  const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  const detail = payload.detail || {};

  if (payload.action === 'SAVE_STAFF') {
    saveStaff_(detail.users || []);
    appendAdminAuditLog_(payload.action, { userCount: (detail.users || []).length }, payload);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (payload.action === 'SAVE_REQUEST_RULES') {
    saveRequestRules_(detail.rules || {});
    appendAdminAuditLog_(payload.action, detail, payload);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (REQUEST_ACTIONS.includes(payload.action)) {
    syncRequest_(payload.action, detail, payload.timestamp);
    appendAdminAuditLog_(payload.action, detail, payload);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
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
  const sheet = getStaffSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return {
      ok: true,
      users: [],
      departments: [],
      positions: [],
      levels: []
    };
  }

  const headers = sheet.getRange(1, STAFF_START_COLUMN, 1, STAFF_HEADERS.length).getValues()[0].map((value) => String(value || '').trim());
  const nameIndex = findHeaderIndex_(headers, ['Name', 'ชื่อ', 'รายชื่อ']);
  const departmentIndex = findHeaderIndex_(headers, ['Department', 'หน่วยงาน', 'หน่วย']);
  const positionIndex = findHeaderIndex_(headers, ['Position', 'ตำแหน่ง']);
  const levelIndex = findHeaderIndex_(headers, ['Level', 'ระดับ']);
  const hasHeader = [nameIndex, departmentIndex, positionIndex, levelIndex].some((index) => index >= 0);
  const firstDataRow = hasHeader ? 2 : 1;
  const ids = sheet.getRange(firstDataRow, STAFF_ID_COLUMN, lastRow - firstDataRow + 1, 1).getValues();
  const values = sheet.getRange(firstDataRow, STAFF_START_COLUMN, lastRow - firstDataRow + 1, STAFF_HEADERS.length).getValues();

  const users = values
    .map((row, index) => ({
      id: String(ids[index][0] || '').trim(),
      name: String(row[nameIndex >= 0 ? nameIndex : 0] || '').trim(),
      department: String(row[departmentIndex >= 0 ? departmentIndex : 1] || '').trim(),
      position: String(row[positionIndex >= 0 ? positionIndex : 2] || '').trim(),
      level: String(row[levelIndex >= 0 ? levelIndex : 3] || '').trim()
    }))
    .filter((user) => user.id && user.name && user.department && user.position && user.level);

  return {
    ok: true,
    users,
    departments: uniqueValues_(users.map((user) => user.department)),
    positions: uniqueValues_(users.map((user) => user.position)),
    levels: uniqueValues_(users.map((user) => user.level))
  };
}

function saveStaff_(users) {
  const sheet = getStaffSheet_();
  sheet.getRange(1, STAFF_ID_COLUMN, sheet.getMaxRows(), STAFF_HEADERS.length + 1).clearContent();
  sheet.getRange(1, STAFF_ID_COLUMN, 1, STAFF_HEADERS.length + 1).setValues([['User ID', ...STAFF_HEADERS]]);

  const rows = (users || [])
    .map((user) => [
      String(user.id || '').trim(),
      String(user.name || '').trim(),
      String(user.department || '').trim(),
      String(user.position || '').trim(),
      String(user.level || '').trim()
    ])
    .filter((row) => row.every(Boolean));

  if (rows.length) {
    sheet.getRange(2, STAFF_ID_COLUMN, rows.length, STAFF_HEADERS.length + 1).setValues(rows);
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

function getRequestData_() {
  const spreadsheet = getSpreadsheet_();
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
    .sort((a, b) => getTimestampValue_(a.timestamp) - getTimestampValue_(b.timestamp));

  return {
    ok: true,
    requests,
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

function syncRequest_(action, detail, clientTimestamp) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const spreadsheet = getSpreadsheet_();
    const requestId = String(detail.requestId || '').trim();
    if (!requestId) return;

    const sheet = getRequestSheet_(spreadsheet, detail.startDate || detail.endDate || clientTimestamp);
    const matchingRows = findRequestRows_(spreadsheet, requestId);
    if (isDuplicateCreateRequest_(spreadsheet, action, detail, requestId)) {
      throw new Error('มีคำขอเวรวันที่เลือกอยู่แล้ว ยกเว้นคำขอยกเลิก');
    }
    const row = [
      detail.name || '',
      detail.department || '',
      detail.position || '',
      detail.level || '',
      detail.leaveType || '',
      detail.startDate || '',
      detail.endDate || '',
      action === 'DELETE_REQUEST' ? 'cancle' : (detail.status || ''),
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

function isSameUserForDuplicate_(request, detail) {
  const requestUserId = String(request.userId || '').trim();
  const detailUserId = String(detail.userId || '').trim();
  if (requestUserId && detailUserId) return requestUserId === detailUserId;

  const requestName = normalizeName_(request.name);
  const detailName = normalizeName_(detail.name);
  return Boolean(
    requestName
    && detailName
    && requestName === detailName
    && (!request.department || String(request.department || '') === String(detail.department || ''))
    && (!request.position || String(request.position || '') === String(detail.position || ''))
  );
}

function isDuplicateCreateRequest_(spreadsheet, action, detail, requestId) {
  if (!['CREATE_APPROVED_REQUEST', 'CREATE_PENDING_REQUEST'].includes(action)) return false;
  if (String(detail.leaveType || '').trim() === 'ยกเลิก') return false;

  const requestedDates = new Set(getDateRange_(detail.startDate, detail.endDate));
  if (!requestedDates.size) return false;

  return getAllRequestSheets_(spreadsheet).some((sheet) => getRequestRowsFromSheet_(sheet).some(({ request }) => (
    String(request.id || '').trim() !== String(requestId)
    && !['cancel', 'cancle'].includes(String(request.status || '').trim().toLowerCase())
    && String(request.leaveType || '').trim() !== 'ยกเลิก'
    && isSameUserForDuplicate_(request, detail)
    && getDateRange_(request.startDate, request.endDate).some((date) => requestedDates.has(date))
  )));
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
  return getAdminAccountRows_().filter((account) => account.status === 'Approved').length;
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
      message: existing.status === 'Approved'
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
  if (account && account.status !== 'Approved') {
    return { ok: false, message: 'บัญชี Admin นี้ยังไม่ได้รับอนุมัติหลังบ้าน' };
  }
  return { ok: false, message: 'UserID หรือ Password Admin ไม่ถูกต้อง' };
}

function isAdminLoginValid_(userId, password) {
  const normalizedUserId = normalizeAdminUserId_(userId);
  const rawPassword = String(password || '');
  if (!normalizedUserId || !rawPassword) return false;
  const account = getAdminAccountRows_().find((item) => item.userId === normalizedUserId);
  if (!account || account.status !== 'Approved' || !account.passwordHash || !account.salt) return false;
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
    'SAVE_STAFF',
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
  const safeDetail = detail || {};
  getAdminAuditLogSheet_().appendRow([
    new Date(),
    verifiedActor || actorUserId || 'unknown',
    action,
    safeDetail.requestId || '',
    safeDetail.userId || '',
    safeDetail.name || '',
    safeDetail.leaveType || '',
    safeDetail.startDate || '',
    safeDetail.endDate || '',
    safeDetail.status || '',
    verifiedActor ? 'Yes' : 'No',
    JSON.stringify(safeDetail)
  ]);
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
