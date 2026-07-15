const LOG_SPREADSHEET_ID = '1rqFhATUWTrNo0zfsUkcAiIyGjWZtjqXuwHT-KZ4393k';
const LEGACY_LOG_SHEET_ID = 2119652301;
const LEGACY_LOG_SHEET_NAME = 'บันทึกประวัติขอเวร';
const REQUEST_SHEET_PREFIX = 'ปีงบ ';
const STAFF_SHEET_ID = 0;
const STAFF_SHEET_NAME = 'Staff';
const STAFF_START_COLUMN = 2;
const SCRIPT_VERSION = '2026-07-15-fiscal-year-sheets';
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
    const adminPassword = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD') || '';
    return createJsonpResponse_(params.callback, {
      ok: true,
      version: SCRIPT_VERSION,
      hasAdminPassword: Boolean(adminPassword),
      adminPasswordLength: String(adminPassword).trim().length,
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

  if (params.action !== 'verifyAdmin') {
    return createJsonpResponse_(params.callback, { ok: false });
  }

  const adminPassword = String(PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD') || '').trim();
  const submittedPassword = String(params.password || '').trim();
  const isValid = Boolean(adminPassword) && submittedPassword === adminPassword;
  return createJsonpResponse_(params.callback, { ok: isValid });
}

function doPost(e) {
  const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  const detail = payload.detail || {};

  if (payload.action === 'SAVE_STAFF') {
    saveStaff_(detail.users || []);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (REQUEST_ACTIONS.includes(payload.action)) {
    syncRequest_(payload.action, detail, payload.timestamp);
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
  const values = sheet.getRange(firstDataRow, STAFF_START_COLUMN, lastRow - firstDataRow + 1, STAFF_HEADERS.length).getValues();

  const users = values
    .map((row) => ({
      name: String(row[nameIndex >= 0 ? nameIndex : 0] || '').trim(),
      department: String(row[departmentIndex >= 0 ? departmentIndex : 1] || '').trim(),
      position: String(row[positionIndex >= 0 ? positionIndex : 2] || '').trim(),
      level: String(row[levelIndex >= 0 ? levelIndex : 3] || '').trim()
    }))
    .filter((user) => user.name && user.department && user.position && user.level)
    .map((user, index) => ({ id: index + 1, ...user }));

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
  sheet.getRange(1, STAFF_START_COLUMN, sheet.getMaxRows(), STAFF_HEADERS.length).clearContent();
  sheet.getRange(1, STAFF_START_COLUMN, 1, STAFF_HEADERS.length).setValues([STAFF_HEADERS]);

  const rows = (users || [])
    .map((user) => [
      String(user.name || '').trim(),
      String(user.department || '').trim(),
      String(user.position || '').trim(),
      String(user.level || '').trim()
    ])
    .filter((row) => row.every(Boolean));

  if (rows.length) {
    sheet.getRange(2, STAFF_START_COLUMN, rows.length, STAFF_HEADERS.length).setValues(rows);
  }
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
    const row = [
      detail.name || '',
      detail.department || '',
      detail.position || '',
      detail.level || '',
      detail.leaveType || '',
      detail.startDate || '',
      detail.endDate || '',
      action === 'DELETE_REQUEST' ? 'Cancel' : (detail.status || ''),
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
    sheet.getRange(1, STAFF_START_COLUMN, 1, STAFF_HEADERS.length).setValues([STAFF_HEADERS]);
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
