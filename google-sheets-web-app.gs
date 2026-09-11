// Deploy this script as a new version of the existing Web App.
const SPREADSHEET_ID = "13b74zWOyP5WgnAF1HdrCE2IY6pFXifhcm5N27iq-pgY";
const STATE_PROPERTY_KEY = "MED_STOCK_STATE";
const TELEGRAM_BOT_TOKEN = "8660403364:AAEVmKd7JFb2sIMrQD5QD4x_x6nS-b4d2JA";
const TELEGRAM_CHAT_ID = "-5176019871";
const UNITS = ["CPR Box", "Emer medicine", "Emer cart Adult", "Emer cart PED", "Med Stock", "IV Fluid", "Equipment"];
const ALIASES = { "ยารถ Emer": "Emer medicine", "รถ EMER adult": "Emer cart Adult", "รถ EMER ped": "Emer cart PED" };
const SHIFTS = ["เวรดึก", "เวรเช้า", "เวรบ่าย"];
const INSPECTION_LOG_HEADERS = ["วันที่ตรวจเช็ค", "ช่วงเวลา", "ปีงบประมาณ", "ชื่อผู้ตรวจ", "หน่วย", "Log ID", "เวลาบันทึก"];

function spreadsheet() { return SpreadsheetApp.openById(SPREADSHEET_ID); }
function fiscalYear(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid inspection date");
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) throw new Error("Invalid inspection date");
  return year + (month >= 10 ? 1 : 0) + 543;
}
function getOrCreateSheet(book, name, headers) {
  const sheet = book.getSheetByName(name) || book.insertSheet(name);
  if (!sheet.getLastRow()) { sheet.appendRow(headers); sheet.setFrozenRows(1); }
  return sheet;
}
function safeCell(value) {
  return typeof value === "string" && /^[=+@-]/.test(value) ? "'" + value : value;
}
function appendRows(sheet, rows) {
  if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows.map(row => row.map(safeCell)));
}
function hasLog(sheet, id) {
  return Boolean(sheet && sheet.getLastRow() > 1 && sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).createTextFinder(id).matchEntireCell(true).useRegularExpression(false).findNext());
}
function doGet(e) {
  try {
    const p = e.parameter || {};
    if (p.action === "loadState") return response(e, { ok: true, state: loadState() });
    if (p.action === "inspectionReceipt") {
      if (!/^\d{4}$/.test(p.fiscalYear || "") || !p.id) throw new Error("Invalid receipt");
      return response(e, { ok: true, saved: hasLog(spreadsheet().getSheetByName("Inspection Logs " + p.fiscalYear), p.id) });
    }
    return response(e, { ok: true, version: 2, spreadsheetId: SPREADSHEET_ID });
  } catch (error) { return response(e, { ok: false, error: error.message }); }
}
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const payload = JSON.parse(e.postData.contents || "{}");
    if (payload.action === "sendTelegram") return jsonResponse(sendTelegram(payload));
    lock.waitLock(30000);
    if (payload.action === "clearState") { clearState(); return jsonResponse({ ok: true }); }
    if (payload.action === "saveState") { saveState(payload); return jsonResponse({ ok: true }); }
    return jsonResponse(saveInspection(payload));
  } catch (error) { return jsonResponse({ ok: false, error: error.message }); }
  finally { if (lock.hasLock()) lock.releaseLock(); }
}
function saveInspection(payload) {
  const log = payload.log || {};
  const unit = ALIASES[log.unit || payload.unit] || log.unit || payload.unit;
  if (!UNITS.includes(unit)) throw new Error("Unknown unit");
  const inspectionDate = log.inspectionDate;
  const year = fiscalYear(inspectionDate || "");
  if (!SHIFTS.includes(log.shift) || !String(log.inspector || "").trim() || !log.id) throw new Error("Missing inspection details");
  const book = spreadsheet();
  const summary = getOrCreateSheet(book, "Inspection Logs " + year, ["Log ID", "Checked At", "Inspection Date", "Shift", "Fiscal Year (BE)", "Unit", "Inspector", "Total Items", "Short Count", "Expiring Count", "Expired Count"]);
  if (hasLog(summary, log.id)) return { ok: true, logId: log.id, fiscalYear: year };
  const items = log.items || [];
  const details = getWideInspectionSheet(book, unit + " " + year, items);
  const summaryPrefix = [log.id, log.checkedAt || "", inspectionDate, log.shift, year, unit, log.inspector];
  appendRows(details, [wideInspectionRow(items, log, unit, year)]);
  appendRows(summary, [[...summaryPrefix, log.totalItems ?? 0, log.shortCount ?? 0, log.expiringCount ?? 0, log.expiredCount ?? 0]]);
  SpreadsheetApp.flush();
  return { ok: true, logId: log.id, fiscalYear: year };
}

function itemHeaders(items) {
  return (items || []).flatMap(item => {
    const name = item.name || "รายการ";
    return [name + " จำนวน", name + " วันหมดอายุ"];
  });
}

function getWideInspectionSheet(book, name, items) {
  const headers = [...itemHeaders(items), ...INSPECTION_LOG_HEADERS];
  const sheet = book.getSheetByName(name) || book.insertSheet(name);
  if (!sheet.getLastRow()) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  } else {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function wideInspectionRow(items, log, unit, year) {
  const itemValues = (items || []).flatMap(item => [item.countedQty ?? 0, item.expiryDate || ""]);
  return [...itemValues, log.inspectionDate, log.shift, year, log.inspector, unit, log.id, log.checkedAt || ""];
}
// Store snapshots in cells, avoiding the size limit of one document property.
// Current stock is shared across fiscal years; inspection history is archived above.
function saveState(payload) {
  const sheet = getOrCreateSheet(spreadsheet(), "App State", ["Snapshot chunk"]);
  const state = JSON.stringify({ sourceVersion: payload.sourceVersion || "", updatedAt: payload.updatedAt || new Date().toISOString(), data: payload.data || {}, checkLogs: payload.checkLogs || [], inspectors: payload.inspectors || [] });
  const chunks = state.match(/[\s\S]{1,40000}/g) || ["{}"];
  const rows = Math.max(chunks.length, sheet.getLastRow() - 1);
  if (sheet.getMaxRows() < rows + 1) sheet.insertRowsAfter(sheet.getMaxRows(), rows + 1 - sheet.getMaxRows());
  sheet.getRange(2, 1, rows, 1).setValues(Array.from({ length: rows }, (_, i) => [chunks[i] || ""]));
}
function clearState() {
  const sheet = spreadsheet().getSheetByName("App State");
  if (sheet && sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).clearContent();
  PropertiesService.getDocumentProperties()?.deleteProperty(STATE_PROPERTY_KEY);
}
function loadState() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = spreadsheet().getSheetByName("App State");
    if (sheet && sheet.getLastRow() > 1) return JSON.parse(sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat().join(""));
    const raw = PropertiesService.getDocumentProperties()?.getProperty(STATE_PROPERTY_KEY);
    return raw ? JSON.parse(raw) : null;
  } finally { lock.releaseLock(); }
}
function sendTelegram(payload) {
  const token = payload.token || TELEGRAM_BOT_TOKEN;
  const chatId = payload.chatId || TELEGRAM_CHAT_ID;
  const message = payload.message || "";
  if (!token || !chatId || !message) {
    return { ok: false, error: "Missing Telegram token, chatId, or message." };
  }

  const response = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "post",
    contentType: "application/json",
    muteHttpExceptions: true,
    payload: JSON.stringify({
      chat_id: chatId,
      text: message,
    }),
  });
  const code = response.getResponseCode();
  return { ok: code >= 200 && code < 300, status: code, body: response.getContentText() };
}

function testTelegram() {
  const result = sendTelegram({ message: "ทดสอบ Telegram จาก Med Stock" });
  Logger.log(JSON.stringify(result));
  return result;
}

function response(e, value) {
  const callback = e?.parameter?.callback;
  if (callback && /^[A-Za-z_$][\w$]*$/.test(callback)) {
    return ContentService.createTextOutput(`${callback}(${JSON.stringify(value)});`).setMimeType(
      ContentService.MimeType.JAVASCRIPT
    );
  }
  return jsonResponse(value);
}

function jsonResponse(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
