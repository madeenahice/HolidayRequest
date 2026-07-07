const LOG_SPREADSHEET_ID = '18G-U9ZZpJum1cO8F7YuxdZPALU5pLwyTqNZc4y_SReY';
const LOG_SHEET_ID = 2119652301;
const LOG_SHEET_NAME = 'ShiftRequests';
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

function doGet(e) {
  const params = e.parameter || {};
  if (params.action !== 'verifyAdmin') {
    return createJsonpResponse_(params.callback, { ok: false });
  }

  const adminPassword = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD') || '';
  const isValid = Boolean(adminPassword) && params.password === adminPassword;
  return createJsonpResponse_(params.callback, { ok: isValid });
}

function doPost(e) {
  const sheet = getLogSheet_();
  const payload = JSON.parse(e.postData.contents || '{}');
  const detail = payload.detail || {};

  sheet.appendRow([
    detail.name || '',
    detail.department || '',
    detail.position || '',
    detail.level || '',
    detail.leaveType || '',
    detail.startDate || '',
    detail.endDate || '',
    detail.status || ''
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getLogSheet_() {
  const spreadsheet = SpreadsheetApp.openById(LOG_SPREADSHEET_ID);
  let sheet = spreadsheet.getSheets().find((item) => item.getSheetId() === LOG_SHEET_ID);
  if (!sheet) {
    sheet = spreadsheet.getSheetByName(LOG_SHEET_NAME);
  }
  if (!sheet) {
    sheet = spreadsheet.insertSheet(LOG_SHEET_NAME);
  }
  ensureHeader_(sheet);
  return sheet;
}

function ensureHeader_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(LOG_HEADERS);
    return;
  }

  const headerRange = sheet.getRange(1, 1, 1, LOG_HEADERS.length);
  const currentHeaders = headerRange.getValues()[0];
  const needsHeaderUpdate = LOG_HEADERS.some((header, index) => currentHeaders[index] !== header);
  if (needsHeaderUpdate) {
    sheet.getRange(1, 1, 1, sheet.getMaxColumns()).clearContent();
    headerRange.setValues([LOG_HEADERS]);
  }
}

function createJsonpResponse_(callback, data) {
  const safeCallback = /^[A-Za-z_$][\w$]*$/.test(callback || '') ? callback : 'callback';
  return ContentService
    .createTextOutput(`${safeCallback}(${JSON.stringify(data)});`)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
