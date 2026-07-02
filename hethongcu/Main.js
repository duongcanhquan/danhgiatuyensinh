// =======================================================
// CẤU HÌNH HỆ THỐNG
// =======================================================
const CONFIG = {
    SPREADSHEET_ID: "1Mi8Cq5or_4LdVF9uvC0PpFOsa_5AY35lw-mjJbDQBsA", 
    SHEET_NAMES: { 
      STUDENTS: "DU_LIEU_SINH_VIEN", 
      MAJORS: "NGANH_HOC", 
      COUNSELORS: "TU_VAN_VIEN", 
      KETOAN: "KE_TOAN",
      SCHOLARSHIPS: "HOC_BONG",
      TRAINING: "HE_DAO_TAO",
      STATUS: "TRANG_THAI"
    },
    IDS: { 
      FOLDER_ROOT: "1wXoWyfUVC8hva-7MEKJaaoV6p67BEhyG",
      FOLDER_INVITE_ROOT: "1efMVihgSpNqMCeIo1M8s2SHSbFo0WYoZ"
    },
    N8N_WEBHOOK: "https://apchn-host.lapage.vn/webhook/giaymoits", 
    N8N_WEBHOOK_CTSV: "https://apchn-host.lapage.vn/webhook/testctsv",
    N8N_WEBHOOK_DAILY_REPORT: "https://apchn-host.lapage.vn/webhook/baocao-ngay",
    N8N_WEBHOOK_MONTHLY_REPORT: "https://apchn-host.lapage.vn/webhook/baocao-thang",
    
    FIREBASE_URL: "https://tuyensinh-ea675-default-rtdb.asia-southeast1.firebasedatabase.app/",
    FIREBASE_SECRET: "axI2PDb5mb9HBg3kE15n3HxqQiHi74xRTKKUp8v1",
    
    // Thêm cấu hình Cột trạng thái đồng bộ
    SYNC_COL_INDEX: 70 // Cột BS - Cột 71 trên sheet, Array Index là 70 (Vì bạn đẩy 70 cột dữ liệu)
  };
  
  // =======================================================
  // FIREBASE HELPER FUNCTIONS
  // =======================================================
  function writeToFirebase(path, data) {
    try {
      const url = CONFIG.FIREBASE_URL + path + ".json?auth=" + CONFIG.FIREBASE_SECRET;
      const options = {
        method: "put",
        contentType: "application/json",
        payload: JSON.stringify(data),
        muteHttpExceptions: true
      };
      
      const response = UrlFetchApp.fetch(url, options);
      const responseCode = response.getResponseCode();
      
      if (responseCode >= 200 && responseCode < 300) {
        return true; 
      } else {
        console.error("Firebase Error Code " + responseCode + ":", response.getContentText());
        return false; 
      }
    } catch(e) { 
      console.error("Firebase Connection Error:", e); 
      return false; 
    }
  }
  
  function readFromFirebase(path) {
    try {
      const url = CONFIG.FIREBASE_URL + path + ".json?auth=" + CONFIG.FIREBASE_SECRET;
      const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      if (response.getResponseCode() === 200) {
        return JSON.parse(response.getContentText());
      }
    } catch(e) { console.error("Firebase Read Error:", e); }
    return null;
  }
  
  // =======================================================
  // TOOL: ĐỒNG BỘ DỮ LIỆU TỪ SHEET SANG FIREBASE (MANUAL)
  // =======================================================
  function DONG_BO_DATA_LEN_FIREBASE() {
    try {
      const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.STUDENTS);
      
      // Nới rộng Sheet để chứa thêm cột Sync Status nếu cần
      const requiredCols = CONFIG.SYNC_COL_INDEX + 1;
      if (sheet.getMaxColumns() < requiredCols) sheet.insertColumnsAfter(sheet.getMaxColumns(), requiredCols - sheet.getMaxColumns());
      
      const lastRow = sheet.getLastRow();
      if (lastRow < 3) return "Không có dữ liệu";
  
      const data = sheet.getRange(3, 1, lastRow - 2, 70).getDisplayValues();
      const moneyCols = [30, 31, 37, 44, 46, 48];
      let firebasePayload = {};
      let statusUpdates = []; // Mảng cập nhật trạng thái đồng bộ
      
      data.forEach((row, index) => {
          let id = String(row[1]).trim();
          if (id) {
              let cleanRow = row.map((cell, idx) => {
                  let val = String(cell).replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim();
                  if (moneyCols.includes(idx)) return val.replace(/\D/g, ""); 
                  return val;
              });
  
              while(cleanRow.length < 70) cleanRow.push("");
              firebasePayload[id] = cleanRow;
              statusUpdates.push(["ĐÃ ĐỒNG BỘ"]);
          } else {
              statusUpdates.push([""]);
          }
      });
  
      const url = CONFIG.FIREBASE_URL + "students.json?auth=" + CONFIG.FIREBASE_SECRET;
      const options = {
        method: "put",
        contentType: "application/json",
        payload: JSON.stringify(firebasePayload),
        muteHttpExceptions: true
      };
      
      const res = UrlFetchApp.fetch(url, options);
      if (res.getResponseCode() !== 200) { throw new Error(res.getContentText()); }
      
      // Cập nhật toàn bộ trạng thái ĐÃ ĐỒNG BỘ vào Sheet
      sheet.getRange(3, CONFIG.SYNC_COL_INDEX + 1, statusUpdates.length, 1).setValues(statusUpdates);
      
      return "✅ ĐỒNG BỘ THÀNH CÔNG " + Object.keys(firebasePayload).length + " HỒ SƠ!";
    } catch (err) {
      return "Lỗi: " + err.message;
    }
  }
  
  // =======================================================
  // HELPER FUNCTIONS & BỘ LỌC DỮ LIỆU
  // =======================================================
  function safe(val) { if (val === null || val === undefined) return ""; if (val instanceof Date) return Utilities.formatDate(val, "GMT+7", "dd/MM/yyyy"); return String(val).trim(); }
  function getScriptUrl() { return ScriptApp.getService().getUrl(); }
  function uploadToDrive(f, n) { try { const r = DriveApp.getFolderById(CONFIG.IDS.FOLDER_ROOT); let fo = r.getFoldersByName(n); let d = fo.hasNext() ? fo.next() : r.createFolder(n); const blob = Utilities.newBlob(Utilities.base64Decode(f.base64), f.type, f.name); return d.createFile(blob).getUrl(); } catch (e) { return ""; } }
  
  function isValidDate(d) {
      if (!d) return false;
      let str = String(d).trim();
      if (str.includes('-') && str.split('-')[0].length === 4) { let p = str.split('-'); str = p[2] + '/' + p[1] + '/' + p[0]; }
      let match = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (!match) return false;
      let day = parseInt(match[1], 10), month = parseInt(match[2], 10), year = parseInt(match[3], 10);
      if (year < 1900 || year > new Date().getFullYear() + 1 || month < 1 || month > 12) return false;
      let dim = [31, (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      return day > 0 && day <= dim[month - 1];
  }
  
  function formatStandardDate(d) {
      if (!d) return "";
      let str = String(d).trim();
      if (str.includes('-') && str.split('-')[0].length === 4) { let p = str.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
      return str;
  }
  
  function formatPhone(p) { 
      let str = String(p || "").trim();
      if (str.startsWith('+')) return '+' + str.replace(/\D/g, ''); 
      return str.replace(/\D/g, ''); 
  }
  
  function formatCCCD(c) { 
      let str = String(c || "").trim().toUpperCase();
      if (str === "CHƯA CÓ") return "CHƯA CÓ"; // Bỏ qua, không gọt chữ này
      return str.replace(/[^a-zA-Z0-9]/g, ''); 
  }
  
  function isValidPhone(p) {
      let str = formatPhone(p);
      return /^(0\d{9}|\+\d{9,15})$/.test(str); 
  }
  
  function isValidID(c) {
      let str = String(c || "").trim().toUpperCase();
      if (!str) return false;
      if (str === "CHƯA CÓ") return true;
      
      let cleanStr = str.replace(/[^a-zA-Z0-9]/g, '');
      if (/^\d+$/.test(cleanStr)) return cleanStr.length === 9 || cleanStr.length === 12; 
      return cleanStr.length === 7 || cleanStr.length === 8 || cleanStr.length === 9; 
  }
  
  // =======================================================
  // CONTROLLER
  // =======================================================
  function doGet(e) {
    if (e.parameter.action === 'getData') return ContentService.createTextOutput(JSON.stringify(getMetaDataPublic())).setMimeType(ContentService.MimeType.JSON);
    if (e.parameter.p === 'account') return HtmlService.createTemplateFromFile('Account').evaluate().setTitle('CỔNG KẾ TOÁN').addMetaTag('viewport', 'width=device-width, initial-scale=1').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    return HtmlService.createTemplateFromFile('Dashboard').evaluate().setTitle('Hệ thống Quản trị Việt Mỹ').addMetaTag('viewport', 'width=device-width, initial-scale=1').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  
  function doPost(e) {
    try { const data = JSON.parse(e.postData.contents); const res = savePublicForm(data); return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON); } catch (err) { return ContentService.createTextOutput(JSON.stringify({result: 'error', message: err.toString()})).setMimeType(ContentService.MimeType.JSON); }
  }
  
  // =======================================================
  // DATA HANDLER
  // =======================================================
  function getMetaDataPublic() {
    try {
      const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      
      const sNganh = ss.getSheetByName(CONFIG.SHEET_NAMES.MAJORS);
      let nganhList = [];
      if (sNganh) {
        const data = sNganh.getRange("A2:B" + Math.max(sNganh.getLastRow(), 2)).getValues();
        data.forEach(row => { if(safe(row[1])) nganhList.push({ name: safe(row[1]), isGroup: /^[IVX]+$/.test(String(row[0]).trim().toUpperCase()) }); });
      }
      
      const sTVV = ss.getSheetByName(CONFIG.SHEET_NAMES.COUNSELORS);
      let tvv = [];
      let departments = [];
      let tvvDeptMap = {};
  
      if (sTVV) {
          const tvvData = sTVV.getRange("A3:G" + Math.max(sTVV.getLastRow(), 3)).getValues();
          tvvData.forEach(row => {
              let name = safe(row[0]); 
              let dept = safe(row[6]); 
              if (name) {
                  tvv.push(name);
                  tvvDeptMap[name] = dept || "Chưa phân phòng";
                  if (dept && !departments.includes(dept)) departments.push(dept);
              }
          });
      }
  
      const sTraining = ss.getSheetByName(CONFIG.SHEET_NAMES.TRAINING);
      let systems = [], schoolYears = [];
      if (sTraining) {
          const tData = sTraining.getRange("A2:B" + Math.max(sTraining.getLastRow(), 2)).getValues();
          systems = tData.map(r => safe(r[0])).filter(String);
          schoolYears = tData.map(r => safe(r[1])).filter(String);
      }
      
      // ĐÃ SỬA: Ép cứng để luôn luôn có "Liên thông Trung Cấp Cao Đẳng" trong tùy chọn
      if (!systems.includes("Liên thông Trung Cấp Cao Đẳng")) {
          systems.push("Liên thông Trung Cấp Cao Đẳng");
      }
      
      const sStatus = ss.getSheetByName(CONFIG.SHEET_NAMES.STATUS);
      let statuses = [];
      if (sStatus) statuses = sStatus.getRange("A1:A" + Math.max(sStatus.getLastRow(), 1)).getValues().flat().map(safe).filter(String);
      if (statuses.length === 0) statuses = ["MỚI", "ĐÃ CỌC ĐỦ", "ĐANG HOÀN THIỆN", "CỌC THÀNH CÔNG", "KIỂM TRA LẠI"];
  
      return { 
          nganh: nganhList, 
          tuvan: tvv, 
          systems: [...new Set(systems)], 
          years: [...new Set(schoolYears)], 
          statuses: [...new Set(statuses)],
          departments: departments,
          tvvDeptMap: tvvDeptMap
      }; 
    } catch (e) { 
        return { nganh: [], tuvan: [], systems: [], years: [], statuses: [], departments: [], tvvDeptMap: {} }; 
    }
  }
  
  function getMetaData() {
    const publicData = getMetaDataPublic();
    let scholarships = [];
    try {
      const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      const sHB = ss.getSheetByName(CONFIG.SHEET_NAMES.SCHOLARSHIPS);
      if (sHB) {
        const data = sHB.getRange("A2:G" + Math.max(sHB.getLastRow(), 2)).getValues();
        let currentSystem = ""; 
        scholarships = data.map(r => {
          if (safe(r[0]) !== "") currentSystem = safe(r[0]);
          if (safe(r[1]) === "") return null;
          return { 
            system: currentSystem, 
            name: safe(r[1]),      
            value: safe(r[4]),     
            condition: safe(r[6])  
          };
        }).filter(s => s !== null); 
      }
    } catch(e) {}
    
    return { ...publicData, scholarships: scholarships };
  }
  
  // =======================================================
  // LOGIN & GET DATA
  // =======================================================
  function loginUser(email, password) {
    try {
      const emKey = encodeEmail(email);
      const pw = safe(password);
      
      // 1. Đọc dữ liệu từ Firebase nhánh users
      const allUsers = readFromFirebase("users");
      if (!allUsers || !allUsers[emKey]) return { status: "error", message: "Tài khoản không tồn tại trên hệ thống!" };
      
      const user = allUsers[emKey];
      
      // 2. Kiểm tra mật khẩu
      if (String(user.password) !== pw) return { status: "error", message: "Sai mật khẩu đăng nhập!" };
  
      // 3. Xử lý danh sách team (Tầm nhìn của user)
      let teamMembers = [];
      if (user.role === "admin") {
          // Admin thấy tất cả
          teamMembers = Object.values(allUsers).map(u => u.name).filter(String);
      } else if (user.role === "teamlead") {
          // Teamlead thấy mình và lính
          teamMembers = Object.values(allUsers)
              .filter(u => u.name === user.name || u.manager === user.name)
              .map(u => u.name);
      } else {
          // TVV hoặc Marketing chỉ thấy mình (Marketing sẽ bị khóa UI sau)
          teamMembers = [user.name];
      }
  
      return { 
        status: "success", 
        role: user.role, 
        name: user.name, 
        displayName: user.displayName, 
        teamMembers: teamMembers 
      };
    } catch (e) { 
      return { status: "error", message: "Lỗi kết nối Firebase: " + e.message }; 
    }
  }
  
  function loginAccountant(email, password) {
    try {
      const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.KETOAN);
      if (!sheet) return { status: "error", message: "Không tìm thấy sheet KE_TOAN" };
      
      const lastRow = sheet.getLastRow();
      if (lastRow < 2) return { status: "error", message: "Chưa có dữ liệu kế toán" };
      
      const data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
      const em = String(email || "").trim().toLowerCase();
      const pw = String(password || "").trim();
      
      for (let i = 0; i < data.length; i++) {
        const sheetUser = String(data[i][0] || "").trim().toLowerCase();
        const sheetPass = String(data[i][1] || "").trim(); 
        if (sheetUser === em && sheetPass === pw) {
          return { status: "success", name: "KẾ TOÁN" };
        }
      }
      return { status: "error", message: "Sai tài khoản hoặc mật khẩu!" };
    } catch (e) { 
      return { status: "error", message: "Lỗi hệ thống: " + e.message }; 
    }
  }
  
  // =======================================================
  function getStudentData(counselorName, role, teamMembers) { // Đã bổ sung tham số thứ 3
    try {
      const fbData = readFromFirebase("students");
      let stringData = [];
  
      if (fbData) {
          stringData = Object.values(fbData);
      } else {
          const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
          const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.STUDENTS);
          if (!sheet) return { status: "error", message: "Lỗi Sheet" };
          
          const reqCols = CONFIG.SYNC_COL_INDEX + 1;
          if (sheet.getMaxColumns() < reqCols) sheet.insertColumnsAfter(sheet.getMaxColumns(), reqCols - sheet.getMaxColumns());
          
          const lastRow = Math.max(sheet.getLastRow(), 3);
          if (lastRow < 3) return { status: "success", data: [] };
  
          const LIMIT = 3000;
          let startRow = 3; let numRows = lastRow - 2;
          if (numRows > LIMIT) { startRow = lastRow - LIMIT + 1; numRows = LIMIT; }
          const rawData = sheet.getRange(startRow, 1, numRows, 70).getValues(); 
          stringData = rawData.map(row => { while(row.length < 70) row.push(""); return row.map(cell => safe(cell)); });
      }
  
      stringData = stringData.map(row => { while(row.length < 70) row.push(""); return row.map(cell => safe(cell)); });
  
      let f = [];
      if (role === "admin" || role === "marketing") {  // <-- Mở khóa cho cả marketing lấy full data
          f = stringData;
      } else if (role === "teamlead" && teamMembers && teamMembers.length > 0) {
          // MỚI: Chỉ lấy hồ sơ của các TVV nằm trong danh sách team
          let membersLower = teamMembers.map(m => String(m).toLowerCase());
          f = stringData.filter(x => membersLower.includes(String(safe(x[18])).toLowerCase()));
      } else {
          f = stringData.filter(x => String(x[18]).toLowerCase().includes(String(safe(counselorName)).toLowerCase()));
      }
  
      f.sort((a, b) => {
          const parseDate = (dStr) => {
              if (!dStr) return 0;
              try {
                  const parts = dStr.split(' ');
                  const dateParts = parts[0].split('/');
                  if (dateParts.length !== 3) return 0;
                  let timeParts = [0, 0, 0];
                  if (parts[1]) timeParts = parts[1].split(':');
                  return new Date(dateParts[2], dateParts[1] - 1, dateParts[0], timeParts[0] || 0, timeParts[1] || 0, timeParts[2] || 0).getTime();
              } catch (e) { return 0; }
          };
          return parseDate(b[17]) - parseDate(a[17]);
      });
  
      return { status: "success", data: f };
    } catch (e) { 
        return { status: "error", message: e.message, data: [] }; 
    }
  }
  
  function getAccountantData() {
    try {
      const fbData = readFromFirebase("students");
      let stringData = [];
  
      if (fbData) {
          stringData = Object.values(fbData);
      } else {
          const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
          const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.STUDENTS);
          
          const reqCols = CONFIG.SYNC_COL_INDEX + 1;
          if (sheet.getMaxColumns() < reqCols) sheet.insertColumnsAfter(sheet.getMaxColumns(), reqCols - sheet.getMaxColumns());
          
          const lr = sheet.getLastRow();
          if (lr < 3) return { status: "success", data: [] };
  
          const LIMIT = 3000; 
          let startRow = 3; let numRows = lr - 2;
          if (numRows > LIMIT) { startRow = lr - LIMIT + 1; numRows = LIMIT; }
          stringData = sheet.getRange(startRow, 1, numRows, 70).getValues();
      }
  
      stringData = stringData.map(row => { while(row.length < 70) row.push(""); return row.map(cell => safe(cell)); });
      
      const f = stringData.filter(x => (parseInt(String(x[37]).replace(/\D/g, "")) || 0) > 10000);
      
      f.sort((a, b) => {
          const hasPending = (r) => {
              const st1 = String(r[50] || "").trim();
              const st2 = String(r[51] || "").trim();
              const st3 = String(r[52] || "").trim();
              const st4 = String(r[53] || "").trim();
              const st5 = String(r[54] || "").trim();
              const hasMoney = (idx) => parseInt(String(r[idx] || "0").replace(/\D/g, '')) > 0;
              
              if ((hasMoney(30) && !st1) || (hasMoney(31) && !st2) || (hasMoney(44) && !st3) || (hasMoney(46) && !st4) || (hasMoney(48) && !st5)) return true;
              if (String(r[65]).trim() === "YÊU CẦU FULL NE") return true;
              return false;
          };
  
          const pendingA = hasPending(a);
          const pendingB = hasPending(b);
  
          if (pendingA && !pendingB) return -1;
          if (!pendingA && pendingB) return 1;
  
          const parseDate = (dStr) => {
              if (!dStr) return 0;
              try {
                  const parts = String(dStr).split(' ');
                  const dateParts = parts[0].split('/');
                  if (dateParts.length !== 3) return 0;
                  let timeParts = [0, 0, 0];
                  if (parts[1]) timeParts = parts[1].split(':');
                  return new Date(dateParts[2], dateParts[1] - 1, dateParts[0], timeParts[0] || 0, timeParts[1] || 0, timeParts[2] || 0).getTime();
              } catch (e) { return 0; }
          };
          return parseDate(b[17]) - parseDate(a[17]);
      });
  
      return { status: "success", data: f };
    } catch (e) { 
      return { status: "error", message: e.message, data: [] }; 
    }
  }
  
  
  // =======================================================
  // LOGIC XỬ LÝ THANH TOÁN CỦA KẾ TOÁN
  // =======================================================
  function processPaymentDecision(payload) {
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);
      const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.STUDENTS);
      
      const reqCols = CONFIG.SYNC_COL_INDEX + 1;
      if (sheet.getMaxColumns() < reqCols) sheet.insertColumnsAfter(sheet.getMaxColumns(), reqCols - sheet.getMaxColumns());
  
      const ids = sheet.getRange("B3:B").getValues().flat().map(safe);
      let rowIndex = -1;
      for(let i=0; i<ids.length; i++) { if(ids[i] === safe(payload.studentId)) { rowIndex = i + 3; break; } }
      if (rowIndex === -1) return { status: "error", message: "Không tìm thấy SV" };
  
      const idx = payload.batch - 1;
      const moneyCols = [31, 32, 45, 47, 49]; 
      const billCols = [35, 36, 46, 48, 50]; 
      const confirmCol = 51 + idx;
      const dateCol = 61 + idx;
  
      const currentDecision = safe(sheet.getRange(rowIndex, confirmCol).getValue()).toUpperCase();
      if (currentDecision === payload.decision.toUpperCase()) return { status: "success" };
  
      if (payload.newFile) {
          const url = uploadToDrive(payload.newFile, payload.studentName + "_" + payload.studentId);
          sheet.getRange(rowIndex, billCols[idx]).setValue(url);
      }
      
      sheet.getRange(rowIndex, moneyCols[idx]).setValue(payload.amount);
      sheet.getRange(rowIndex, confirmCol).setValue(payload.decision);
      
      let ngayTvvBao = "";
      if (payload.paymentDate) {
          let dDate = payload.paymentDate;
          if(dDate.includes('-')) {
              const parts = dDate.split('-');
              dDate = `'${parts[2]}/${parts[1]}/${parts[0]}`;
              ngayTvvBao = `${parts[2]}/${parts[1]}/${parts[0]}`;
          } else {
              ngayTvvBao = dDate;
          }
          sheet.getRange(rowIndex, dateCol).setValue(dDate);
      } else {
          ngayTvvBao = safe(sheet.getRange(rowIndex, dateCol).getValue()).replace(/'/g, '');
      }
  
      const statusCell = sheet.getRange(rowIndex, 40); 
      if (payload.decision === "TỪ CHỐI") {
          statusCell.setValue("KIỂM TRA LẠI");
      } else {
          const row = sheet.getRange(rowIndex, 1, 1, 60).getValues()[0];
          const mIdx = [30, 31, 44, 46, 48]; const sIdx = [50, 51, 52, 53, 54];
          let totalApproved = 0;
          for (let k=0; k<5; k++) { if (safe(row[sIdx[k]]) === "ĐỒNG Ý") totalApproved += (parseInt(safe(row[mIdx[k]]).replace(/\D/g, "")) || 0); }
          
          const is9Plus = String(row[10]).toUpperCase().includes("9+");
          const cocThreshold = is9Plus ? 2000000 : 1000000;
  
          if (totalApproved >= cocThreshold) {
              statusCell.setValue("CỌC THÀNH CÔNG");
              const rowCheck = sheet.getRange(rowIndex, 1, 1, 30).getValues()[0];
              const requiredIndices = [0,1,2,3,4,5,6,8,10,12,14,15,16,17,20,21,22,23,26,27,28];
              let isFull = true; for (let idx of requiredIndices) if (!safe(rowCheck[idx])) { isFull = false; break; }
              if (isFull) sheet.getRange(rowIndex, 42).setValue("ĐÃ HOÀN THIỆN");
          } else if (totalApproved > 0) statusCell.setValue("ĐANG HOÀN THIỆN");
      }
  
      SpreadsheetApp.flush(); 
  
      const updatedRowForFirebase = sheet.getRange(rowIndex, 1, 1, 70).getValues()[0].map(safe);
      
      // -- CẬP NHẬT GHI TRẠNG THÁI ĐỒNG BỘ --
      const fbSuccess = writeToFirebase("students/" + payload.studentId, updatedRowForFirebase);
      if (fbSuccess) {
        sheet.getRange(rowIndex, CONFIG.SYNC_COL_INDEX + 1).setValue("ĐÃ ĐỒNG BỘ");
      } else {
        sheet.getRange(rowIndex, CONFIG.SYNC_COL_INDEX + 1).setValue("LỖI ĐỒNG BỘ");
      }
  
      if (payload.decision.toUpperCase() === "ĐỒNG Ý") {
        try {
          let dDate = payload.paymentDate || "";
          let ngayTvvBao = ""; 
          if(dDate.includes('-')) {
              const parts = dDate.split('-');
              ngayTvvBao = parts[2] + '/' + parts[1] + '/' + parts[0];
          } else if (dDate) {
              ngayTvvBao = dDate.replace(/'/g, '');
          } else {
              ngayTvvBao = String(sheet.getRange(rowIndex, dateCol).getValue() || "").replace(/'/g, '');
          }
  
          const ktSpreadsheet = SpreadsheetApp.openById("1NIMcFVjqLPcQxM7gx3Ddy9y7UNuUNKAwTcUPk6hdQOg");
          const ktSheet = ktSpreadsheet.getSheets()[0]; 
          const ngayDuyet = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy");
  
          let rowToInsert = new Array(13).fill("");
          rowToInsert[1] = payload.studentId;       
          rowToInsert[4] = ngayTvvBao;              
          rowToInsert[5] = ngayDuyet;               
          rowToInsert[6] = payload.studentName;     
          rowToInsert[12] = payload.amount;         
          rowToInsert[2] = payload.batch;           
          ktSheet.appendRow(rowToInsert);
        } catch (err) {}
      }

  try {
          // ĐÃ SỬA: Lấy an toàn 71 cột để mảng luôn thừa chỗ, không bao giờ bị lỗi index out of bounds khi gọi r[69]
          const r = sheet.getRange(rowIndex, 1, 1, 71).getValues()[0].map(safe);
          
          const fd = {
              row_index: rowIndex, id: r[1], fullName: r[2], gender: r[3], dob: r[4], phone: r[5], email: r[6], address: r[8], currentAddress: r[9], system: r[10], major: r[12], schoolYear: r[13], pob: r[14], ethnicity: r[15], cccd: r[16], created_at: r[17], counselor: r[18], campus: r[19], father: r[20], fatherPhone: r[21], mother: r[22], motherPhone: r[23], guardian: r[24], guardianPhone: r[25], school: r[26], province: r[27], area: r[28], 
              scholarship: r[29], scholarship2: r[69], source: r[56], source2: r[68], 
              deposit_money: r[30], deposit_link: r[34], l1_money: r[31], l1_link: r[35], bs3: r[44], bill3: r[45], bs4: r[46], bill4: r[47], bs5: r[48], bill5: r[49], valid1: r[50], valid2: r[51], valid3: r[52], valid4: r[53], valid5: r[54], n8n_status: r[55], date1: r[60], date2: r[61], date3: r[62], date4: r[63], date5: r[64], total_money: r[37], status: r[39], note: r[38], situation: r[42], score: r[43]
          };
          
          // Bổ sung thêm Quyết định và Số tiền Kế toán duyệt vào ngay vòng ngoài để N8N dễ lấy
         const pl = { event: "accountant_decision", decision: payload.decision, amount: payload.amount, batch: payload.batch, full_data: fd };
          const opt = { 'method': 'post', 'contentType': 'application/json', 'payload': JSON.stringify(pl), 'muteHttpExceptions': true };
          
          console.log("Chuẩn bị gửi N8N Kế toán duyệt - ID: " + r[1]);
  
          // ĐÃ XÓA BỎ 1 ĐƯỜNG LINK WEBHOOK DƯ THỪA ĐỂ CHỐNG SPAM 2 TIN NHẮN
          
          // Chỉ giữ lại 1 nòng súng này để bắn:
          if (CONFIG.N8N_WEBHOOK_CTSV && CONFIG.N8N_WEBHOOK_CTSV.startsWith("http")) {
              let res = UrlFetchApp.fetch(CONFIG.N8N_WEBHOOK_CTSV, opt);
              console.log("Phản hồi N8N Kế Toán: " + res.getContentText());
          }
      } catch (err) {
          console.error("Lỗi Webhook Kế toán: " + err.message);
      }
  
      // Trả kèm bản ghi vừa cập nhật — client patch trực tiếp vào bảng thay vì tải lại toàn bộ students.json
      return { status: "success", updatedRow: updatedRowForFirebase };
    } catch(e) { return { status: "error", message: e.message }; } finally { lock.releaseLock(); }
  }


  // =======================================================
  // LƯU HỒ SƠ TỪ TVV (BỘ LỌC CHỐNG SPAM MINH BẠCH TỐI ĐA)
  // =======================================================
  function saveOrUpdateStudent(payload) {
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(15000);
      
      const pfInput = payload.fields || {};
      const dobStr = safe(pfInput.dob);
      const phoneStr = formatPhone(pfInput.phone);
      const cccdStr = formatCCCD(pfInput.cccd);
  
      if (dobStr && !isValidDate(dobStr)) return { status: "error", message: "Lỗi Ngày Sinh: Định dạng DD/MM/YYYY không hợp lệ!" };
      if (safe(pfInput.phone) && !isValidPhone(pfInput.phone)) return { status: "error", message: "Lỗi SĐT: Không đúng định dạng." };
      if (safe(pfInput.cccd) && cccdStr.length > 0 && !isValidID(pfInput.cccd)) return { status: "error", message: "Lỗi CCCD: Không đúng định dạng." };
      
      const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.STUDENTS);
      
      const reqCols = CONFIG.SYNC_COL_INDEX + 1;
      if (sheet.getMaxColumns() < reqCols) sheet.insertColumnsAfter(sheet.getMaxColumns(), reqCols - sheet.getMaxColumns());
  
      let rowIndex = -1; let isNew = false; const sId = safe(payload.studentId);
      const lastRow = Math.max(sheet.getLastRow(), 3);
      const allData = sheet.getRange(3, 1, lastRow - 2, 17).getValues(); 
      
     if (sId) { 
          for(let i=0; i<allData.length; i++) { 
              let sheetId = String(allData[i][1]).replace(/'/g, '').trim();
              if(sheetId === String(sId).trim()) { rowIndex = i+3; break; } 
          } 
      }
      
    for (let i = 0; i < allData.length; i++) {
          if (rowIndex !== -1 && (i + 3) === rowIndex) continue; 
          const rowPhone = formatPhone(allData[i][5]);
          const rowCccd = formatCCCD(allData[i][16]);
          
          if (phoneStr && phoneStr === rowPhone) {
              return { status: "error", message: `SĐT trùng với học sinh ${safe(allData[i][2])}` };
          }
          
          // CHỈ SO SÁNH NẾU KHÁC "CHƯA CÓ"
          if (cccdStr && cccdStr !== "CHƯA CÓ" && cccdStr === rowCccd) {
              return { status: "error", message: `CCCD trùng với học sinh ${safe(allData[i][2])}` };
          }
      }
  
      if (rowIndex === -1) { 
          isNew = true; 
          rowIndex = sheet.getLastRow() + 1; 
          const prefix = Utilities.formatDate(new Date(), "GMT+7", "yyMMdd");
          let maxSeq = 0;
          for (let i = 0; i < allData.length; i++) {
              let existingId = String(safe(allData[i][1]));
              if (existingId.startsWith(prefix)) {
                  let seq = parseInt(existingId.slice(6), 10);
                  if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
              }
          }
          payload.studentId = prefix + ("0000" + (maxSeq + 1)).slice(-4); 
      }
  
      const upload = (f, n) => { if(!f) return ""; try { return uploadToDrive(f, n); } catch(e){ return ""; }};
      const f = payload.files || {}; const o = payload.old || {}; const fn = payload.folderName;
      const urls = { d1: f.d1 ? upload(f.d1, fn) : (o.d1||""), d2: f.d2 ? upload(f.d2, fn) : (o.d2||""), d3: f.d3 ? upload(f.d3, fn) : (o.d3||""), d4: f.d4 ? upload(f.d4, fn) : (o.d4||""), d5: f.d5 ? upload(f.d5, fn) : (o.d5||"") };
      
      const pf = payload.fields;
      const getM = (v) => parseInt(String(v || "0").replace(/\D/g, '')) || 0; 
      const total = getM(pf.m1)+getM(pf.m2)+getM(pf.m3)+getM(pf.m4)+getM(pf.m5);
      
      let r = isNew ? new Array(70).fill("") : sheet.getRange(rowIndex, 1, 1, 70).getValues()[0];
      while(r.length < 70) r.push("");
  
      let isMoneyOrFileChanged = false;
  
      if (!isNew) {
          const ck = (newVal, oldVal, fileObj, statusIdx, batchNum) => { 
              let n = parseInt(String(newVal || "0").replace(/\D/g,'')) || 0;
              let o = parseInt(String(oldVal || "0").replace(/\D/g,'')) || 0;
              let hasFile = (fileObj && fileObj.base64) ? true : false;
              
              if (n !== o || hasFile) { 
                  r[statusIdx] = ""; 
                  isMoneyOrFileChanged = true; 
                  if (r[55]) {
                      r[55] = String(r[55]).split(',').filter(t => t !== `ok${batchNum}` && t !== `confirm${batchNum}` && t !== `no${batchNum}`).join(',');
                  }
              } 
          };
          ck(pf.m1, r[30], f.d1, 50, 1); 
          ck(pf.m2, r[31], f.d2, 51, 2); 
          ck(pf.m3, r[44], f.d3, 52, 3); 
          ck(pf.m4, r[46], f.d4, 53, 4); 
          ck(pf.m5, r[48], f.d5, 54, 5);
      } else {
          let hasAnyFile = (f.d1 || f.d2 || f.d3 || f.d4 || f.d5) ? true : false;
          if (total > 0 || hasAnyFile) {
              isMoneyOrFileChanged = true;
          }
      }
  
      if(isNew) { r[0]=rowIndex-2; r[1]=payload.studentId; r[17]=Utilities.formatDate(new Date(),"GMT+7","dd/MM/yyyy HH:mm:ss"); r[39]="MỚI"; }
      r[18] = payload.counselorName; 
      r[2]=pf.fullName; r[3]=pf.gender; r[4] = dobStr ? "'" + formatStandardDate(dobStr) : ""; 
      r[5] = phoneStr ? "'" + phoneStr : ""; r[6]=pf.email; r[8]=pf.address; r[9]=pf.currentAddress; r[10]=pf.eduSystem; r[12]=pf.major; r[13]=pf.schoolYear; r[14]=pf.pob; r[15]=pf.ethnicity; 
      r[16] = cccdStr ? "'" + cccdStr : ""; r[19]=pf.campus; r[20]=pf.fatherName; r[21] = pf.fatherPhone ? "'" + formatPhone(pf.fatherPhone) : ""; 
      r[22]=pf.motherName; r[23] = pf.motherPhone ? "'" + formatPhone(pf.motherPhone) : ""; r[24]=pf.guardian; r[25] = pf.guardianPhone ? "'" + formatPhone(pf.guardianPhone) : ""; 
      r[26]=pf.school; r[27]=pf.schoolProvince; r[28]=pf.area; 
      
      r[29] = pf.scholarship || "";
      r[56] = pf.source || "";
      r[68] = pf.source2 || "";
      r[69] = pf.scholarship2 || "";
  
      r[30]=pf.m1; r[34]=urls.d1; r[31]=pf.m2; r[35]=urls.d2; r[44]=pf.m3; r[45]=urls.d3; r[46]=pf.m4; r[47]=urls.d4; r[48]=pf.m5; r[49]=urls.d5;
      r[37]=total; r[38]=pf.note; r[42]=pf.situation; r[43]=pf.score; 
  
      if(pf.d1) r[60] = "'" + pf.d1; if(pf.d2) r[61] = "'" + pf.d2; if(pf.d3) r[62] = "'" + pf.d3; if(pf.d4) r[63] = "'" + pf.d4; if(pf.d5) r[64] = "'" + pf.d5;
  
      let oldReqNe = String(r[65] || ""); 
  
      if (pf.reqFullNe) { if (r[65] !== "ĐÃ FULL NE") r[65] = "YÊU CẦU FULL NE"; } 
      else { if (r[65] === "YÊU CẦU FULL NE") r[65] = ""; }
  
      if(isNew) sheet.appendRow(r); else sheet.getRange(rowIndex, 1, 1, 70).setValues([r]);

      // -- CẬP NHẬT GHI TRẠNG THÁI ĐỒNG BỘ --
      const safeRow = r.map(safe);
      const fbSuccess = writeToFirebase("students/" + payload.studentId, safeRow);
      if (fbSuccess) {
        sheet.getRange(rowIndex, CONFIG.SYNC_COL_INDEX + 1).setValue("ĐÃ ĐỒNG BỘ");
      } else {
        sheet.getRange(rowIndex, CONFIG.SYNC_COL_INDEX + 1).setValue("LỖI ĐỒNG BỘ");
      }
  
      try {
          const fd = {
              row_index: rowIndex, id: r[1], fullName: r[2], gender: r[3], dob: r[4], phone: r[5], email: r[6], address: r[8], currentAddress: r[9], system: r[10], major: r[12], schoolYear: r[13], pob: r[14], ethnicity: r[15], cccd: r[16], created_at: r[17], counselor: r[18], campus: r[19], father: r[20], fatherPhone: r[21], mother: r[22], motherPhone: r[23], guardian: r[24], guardianPhone: r[25], school: r[26], province: r[27], area: r[28], 
              scholarship: r[29], scholarship2: r[69], source: r[56], source2: r[68], 
              deposit_money: r[30], deposit_link: r[34], l1_money: r[31], l1_link: r[35], bs3: r[44], bill3: r[45], bs4: r[46], bill4: r[47], bs5: r[48], bill5: r[49], valid1: r[50], valid2: r[51], valid3: r[52], valid4: r[53], valid5: r[54], n8n_status: r[55], date1: r[60], date2: r[61], date3: r[62], date4: r[63], date5: r[64], total_money: r[37], status: r[39], note: r[38], situation: r[42], score: r[43]
          };
  
          let triggerN8N = false;
          if (isMoneyOrFileChanged) triggerN8N = true;
          if (pf.reqFullNe && oldReqNe !== "YÊU CẦU FULL NE" && oldReqNe !== "ĐÃ FULL NE") triggerN8N = true;
  
          if (triggerN8N) {
              const pl = { 
                  event: isNew ? "create_profile" : "update_profile", 
                  is_money_changed: isMoneyOrFileChanged,
                  studentId: payload.studentId, 
                  counselor: payload.counselorName, 
                  updatedAt: Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd HH:mm:ss"), 
                  full_data: fd, 
                  totalMoney: total 
              };
              const opt = { 'method': 'post', 'contentType': 'application/json', 'payload': JSON.stringify(pl), 'muteHttpExceptions': true };
              
              if (CONFIG.N8N_WEBHOOK && CONFIG.N8N_WEBHOOK.startsWith("http")) {
                  UrlFetchApp.fetch(CONFIG.N8N_WEBHOOK, opt);
              }
              if (CONFIG.N8N_WEBHOOK_CTSV && CONFIG.N8N_WEBHOOK_CTSV.startsWith("http")) {
                  UrlFetchApp.fetch(CONFIG.N8N_WEBHOOK_CTSV, opt);
              }
          }
      } catch (e) {
          console.error("Lỗi Webhook TVV: " + e.message);
      }
  
      SpreadsheetApp.flush();
      // Trả kèm bản ghi vừa lưu — client patch trực tiếp vào bảng thay vì tải lại toàn bộ students.json
      return { status: "success", mode: isNew ? "create" : "update", id: payload.studentId, updatedRow: safeRow };
    } catch(e) { return {status:"error", message: e.message}; } finally { lock.releaseLock(); }
  }

  function savePublicForm(data) {
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);
      
      const dobStr = safe(data.dob);
      const phoneStr = formatPhone(data.phone);
      const cccdStr = formatCCCD(data.cccd);
      const isNoCCCD = String(data.cccd || "").trim().toUpperCase() === "CHƯA CÓ";
  
      if (dobStr && !isValidDate(dobStr)) return { result: "error", message: "Lỗi Ngày Sinh: Vui lòng nhập đúng định dạng DD/MM/YYYY hợp lệ." };
      if (safe(data.phone) && !isValidPhone(data.phone)) return { result: "error", message: "Lỗi SĐT: SĐT VN (10 số, bắt đầu 0) hoặc Quốc tế (bắt đầu +)." };
      if (safe(data.cccd) && !isValidID(data.cccd)) return { result: "error", message: "Lỗi CCCD/Passport: Định dạng không hợp lệ." };
      if (!data.eduSystem) return { result: "error", message: "Vui lòng Chọn Hệ Đào Tạo!" };
  
      const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.STUDENTS);
      
      const reqCols = CONFIG.SYNC_COL_INDEX + 1;
      if (sheet.getMaxColumns() < reqCols) sheet.insertColumnsAfter(sheet.getMaxColumns(), reqCols - sheet.getMaxColumns());
  
      const now = new Date();
      const prefix = Utilities.formatDate(now, "GMT+7", "yyMMdd");
      const lastRow = Math.max(sheet.getLastRow(), 3);
      const allData = sheet.getRange(3, 1, lastRow - 2, 17).getValues(); 
      
      let maxSeq = 0;
      for (let i = 0; i < allData.length; i++) {
          const rowPhone = formatPhone(allData[i][5]);
          const rowCccd = formatCCCD(allData[i][16]);
  
          if (phoneStr && phoneStr === rowPhone) return { result: "error", message: "Hồ sơ của bạn đã tồn tại trên hệ thống. Vui lòng liên hệ Hotline để được hỗ trợ!" };
          if (!isNoCCCD && cccdStr && cccdStr === rowCccd) return { result: "error", message: "Hồ sơ của bạn đã tồn tại trên hệ thống. Vui lòng liên hệ Hotline!" };
          
          let existingId = String(safe(allData[i][1]));
          if (existingId.startsWith(prefix)) {
              let seq = parseInt(existingId.slice(6), 10);
              if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
          }
      }
      
      const studentId = prefix + ("0000" + (maxSeq + 1)).slice(-4);
      
      let r = new Array(70).fill("");
      r[0] = sheet.getLastRow() - 1; r[1] = studentId; r[2] = data.fullName; r[3] = data.gender; r[4] = dobStr ? "'" + formatStandardDate(dobStr) : ""; r[5] = "'" + phoneStr; r[6] = data.email; r[8] = data.address; r[10] = data.eduSystem; r[12] = data.major; r[14] = data.pob; r[15] = data.ethnicity; 
      r[16] = isNoCCCD ? "CHƯA CÓ" : (cccdStr ? "'" + cccdStr : ""); 
      r[17] = Utilities.formatDate(now, "GMT+7", "dd/MM/yyyy HH:mm:ss"); r[18] = data.counselor; r[20] = data.fatherName; r[21] = data.fatherPhone ? "'" + formatPhone(data.fatherPhone) : ""; r[22] = data.motherName; r[23] = data.motherPhone ? "'" + formatPhone(data.motherPhone) : ""; r[26] = data.school; r[27] = data.schoolProvince; r[39] = "MỚI"; r[42] = data.situation; r[43] = data.score; r[56] = data.source || "Form Public"; 
  
      sheet.appendRow(r);
      const newRowIndex = sheet.getLastRow();
      SpreadsheetApp.flush(); 
      
      const safePayload = r.map(cell => String(cell || "").replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim());
      
      // -- CẬP NHẬT GHI TRẠNG THÁI ĐỒNG BỘ --
      const fbSuccess = writeToFirebase("students/" + studentId, safePayload);
      if (fbSuccess) {
        sheet.getRange(newRowIndex, CONFIG.SYNC_COL_INDEX + 1).setValue("ĐÃ ĐỒNG BỘ");
      } else {
        sheet.getRange(newRowIndex, CONFIG.SYNC_COL_INDEX + 1).setValue("LỖI ĐỒNG BỘ");
      }
  
      return { result: "success", id: studentId };
    } catch (e) { return { result: "error", message: e.toString() }; } finally { lock.releaseLock(); }
  }
  
  function triggerInvitation(payload) {
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);
      const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.STUDENTS);
      
      const ids = sheet.getRange("B3:B").getValues().flat().map(safe);
      let rowIndex = -1;
      for (let i = 0; i < ids.length; i++) { if (ids[i] === safe(payload.studentId)) { rowIndex = i + 3; break; } }
      if (rowIndex === -1) return { status: "error", message: "Không tìm thấy sinh viên" };
  
      const rowData = sheet.getRange(rowIndex, 1, 1, 70).getValues()[0];
      let folderUrl = safe(rowData[36]); let folderId = "";
  
      if (!folderUrl || !folderUrl.includes("drive.google.com")) {
        try {
          const folderName = `${safe(rowData[2])}_${safe(rowData[1])}`; 
          const parentFolder = DriveApp.getFolderById(CONFIG.IDS.FOLDER_INVITE_ROOT);
          const newFolder = parentFolder.createFolder(folderName);
          folderId = newFolder.getId(); folderUrl = newFolder.getUrl();
          sheet.getRange(rowIndex, 37).setValue(folderUrl); 
          
          rowData[36] = folderUrl;
          
          // -- CẬP NHẬT GHI TRẠNG THÁI ĐỒNG BỘ --
          const fbSuccess = writeToFirebase("students/" + payload.studentId, rowData);
          if (fbSuccess) {
            sheet.getRange(rowIndex, CONFIG.SYNC_COL_INDEX + 1).setValue("ĐÃ ĐỒNG BỘ");
          } else {
            sheet.getRange(rowIndex, CONFIG.SYNC_COL_INDEX + 1).setValue("LỖI ĐỒNG BỘ");
          }
        } catch (err) { return { status: "error", message: "Lỗi tạo Folder: " + err.toString() }; }
      } else {
        try { const match = folderUrl.match(/[-\w]{25,}/); if (match) folderId = match[0]; } catch (e) {}
      }
  
  const n8nPayload = {
        action: "create_document", docType: payload.docType, folderId: folderId,       
        studentData: {
          id: safe(rowData[1]), name: safe(rowData[2]), gender: safe(rowData[3]), dob: safe(rowData[4]), phone: safe(rowData[5]), email: safe(rowData[6]), address: safe(rowData[8]), eduSystem: safe(rowData[10]), major: safe(rowData[12]), school: safe(rowData[26]), 
          scholarshipName: payload.scholarship ? payload.scholarship.name : "", 
          scholarshipValue: payload.scholarship ? payload.scholarship.value : "", 
          scholarshipCondition: payload.scholarship ? payload.scholarship.condition : "",
          
          source1: safe(rowData[56]),
          source2: safe(rowData[68]),
          scholarship1_text: safe(rowData[29]),
          scholarship2_text: safe(rowData[69])
        }
      };
  
      const options = { 'method': 'post', 'contentType': 'application/json', 'payload': JSON.stringify(n8nPayload), 'muteHttpExceptions': true };
      if (CONFIG.N8N_WEBHOOK && CONFIG.N8N_WEBHOOK.startsWith("http")) UrlFetchApp.fetch(CONFIG.N8N_WEBHOOK, options);
      return { status: "success", folderUrl: folderUrl };
    } catch (e) { return { status: "error", message: e.toString() }; } finally { lock.releaseLock(); }
  }
  
  // =======================================================
  // BÁO CÁO NGÀY (N8N) - ĐỌC TRỰC TIẾP TỪ FIREBASE
  // =======================================================
  function sendDailyReportToN8N() {
    try {
      const fbData = readFromFirebase("students");
      if (!fbData) return;
      const data = Object.values(fbData);
  
      const today = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Ho_Chi_Minh"}));
      const todayStr = Utilities.formatDate(today, "GMT+7", "dd/MM/yyyy"); 
      
      // Đếm giao dịch trong khung giờ từ 0h00 đến 23h59 hôm nay
      const startTs = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0).getTime();
      const endTs = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).getTime();
      
      let tongHocSinhNop = 0; let tongTien = 0;
      let cd_hs = 0, cd_tien = 0, cd_lpxt = 0, cd_coc = 0, cd_full_ne = 0;
      let tc_hs = 0, tc_tien = 0, tc_lpxt = 0, tc_coc = 0, tc_full_ne = 0;
      let dh_hs = 0, dh_tien = 0, dh_coc = 0, dh_hoanthien = 0;
  
      data.forEach(r => {
        if (!r || !r[1]) return;
        
        // ĐÃ SỬA LỖI TỪ KHÓA CẤM: Đổi 'eval' thành 'stEval'
        let stEval = evaluateStudentForN8N(r);
  
        // Đếm Full NE trong ngày
        let fullNeTs = getTsForReport(r[66]);
        if (stEval.isFullNE && fullNeTs >= startTs && fullNeTs <= endTs) { 
          if (stEval.isDuHoc) dh_hoanthien++; 
          else if (stEval.isTCSC) tc_full_ne++;
          else cd_full_ne++;
        }
  
        let hasMoneyToday = false; let moneyTodayOfStudent = 0;
        const mIdx = [30, 31, 44, 46, 48]; const sIdx = [50, 51, 52, 53, 54]; const dIdx = [60, 61, 62, 63, 64]; 
        
        for(let i=0; i<5; i++) {
          // ĐÃ SỬA LỖI GỌI SAI HÀM: Thay parseAnyDate bằng getTsForReport
          let pTs = getTsForReport(r[dIdx[i]]); 
          let amt = parseInt(String(r[mIdx[i]]).replace(/\D/g, '')) || 0;
          let status = String(r[sIdx[i]]).trim().toUpperCase();
          
          // CHỈ TÍNH TIỀN KHI NẰM TRONG HÔM NAY VÀ ĐÃ ĐƯỢC KẾ TOÁN DUYỆT
          if (status === "ĐỒNG Ý" && amt > 0 && pTs >= startTs && pTs <= endTs) {
              hasMoneyToday = true;
              moneyTodayOfStudent += amt;
              tongTien += amt;
          }
        }
  
        if (hasMoneyToday) {
          tongHocSinhNop++;
          if (stEval.isDuHoc) { dh_hs++; dh_tien += moneyTodayOfStudent; dh_coc++; } 
          else if (stEval.isTCSC) { tc_hs++; tc_tien += moneyTodayOfStudent; if (stEval.isCoc) tc_coc++; else if (stEval.isLpxt) tc_lpxt++; } 
          else { cd_hs++; cd_tien += moneyTodayOfStudent; if (stEval.isCoc) cd_coc++; else if (stEval.isLpxt) cd_lpxt++; }
        }
      });
  
      let detailHtml = `<b>KẾT QUẢ TUYỂN SINH ${todayStr} :</b><br><b>Tổng số HS nộp tiền được Kế toán duyệt :</b> <font color="#d93025"><b>${tongHocSinhNop}</b></font><br><br>`;
      if (cd_hs > 0 || cd_full_ne > 0) {
          detailHtml += `<b>I/ Hệ Cao đẳng/9+:</b> (Hồ sơ: <b>${cd_hs}</b> | Thu: <font color="#198754"><b>${cd_tien.toLocaleString('vi-VN')}đ</b></font>)<br>`;
          if (cd_lpxt > 0) detailHtml += `+ Đã nộp LPXT: <font color="#0056b3"><b>${cd_lpxt}</b></font><br>`;
          if (cd_coc > 0) detailHtml += `+ Hoàn thành cọc: <font color="#198754"><b>${cd_coc}</b></font><br>`;
          if (cd_full_ne > 0) detailHtml += `+ Đã là NE: <font color="#8e44ad"><b>${cd_full_ne}</b></font><br><br>`;
      }
      if (tc_hs > 0 || tc_full_ne > 0) {
          detailHtml += `<b>II/ Hệ Trung Cấp/Sơ Cấp:</b> (Hồ sơ: <b>${tc_hs}</b> | Thu: <font color="#198754"><b>${tc_tien.toLocaleString('vi-VN')}đ</b></font>)<br>`;
          if (tc_lpxt > 0) detailHtml += `+ Đã nộp LPXT: <font color="#0056b3"><b>${tc_lpxt}</b></font><br>`;
          if (tc_coc > 0) detailHtml += `+ Hoàn thành cọc: <font color="#198754"><b>${tc_coc}</b></font><br>`;
          if (tc_full_ne > 0) detailHtml += `+ Đã là NE: <font color="#8e44ad"><b>${tc_full_ne}</b></font><br><br>`;
      }
      if (dh_hs > 0 || dh_hoanthien > 0) {
          detailHtml += `<b>III/ Ngắn hạn & Du học:</b> (Hồ sơ: <b>${dh_hs}</b> | Thu: <font color="#198754"><b>${dh_tien.toLocaleString('vi-VN')}đ</b></font>)<br>`;
          if (dh_coc > 0) detailHtml += `+ Đã nộp cọc: <font color="#e67e22"><b>${dh_coc}</b></font><br>`;
          if (dh_hoanthien > 0) detailHtml += `+ Đã hoàn thiện: <font color="#198754"><b>${dh_hoanthien}</b></font><br><br>`;
      }
      if (tongTien === 0 && cd_full_ne === 0 && tc_full_ne === 0 && dh_hoanthien === 0) {
          detailHtml += `<i>⏳ Hôm nay chưa có phát sinh giao dịch được duyệt hoặc hồ sơ hoàn thiện nào.</i><br><br>`;
      }
      detailHtml += `----------------<br>💰 <b>Tổng số tiền Kế toán duyệt trong ngày:</b> <font color="#d93025" size="4"><b>${tongTien.toLocaleString('vi-VN')} VNĐ</b></font>`;
  
      const payload = { date: todayStr, dailyDetailHtml: detailHtml };
      UrlFetchApp.fetch(CONFIG.N8N_WEBHOOK_DAILY_REPORT, { 'method': 'post', 'contentType': 'application/json', 'payload': JSON.stringify(payload), 'muteHttpExceptions': true });
    } catch (e) { console.error("Lỗi báo cáo: " + e.message); }
  }
  
  // =======================================================
  // BỘ LỌC ĐỘC QUYỀN DÙNG CHUNG CHO BÁO CÁO N8N
  // =======================================================
  function getTsForReport(d) {
      if (!d) return 0;
      if (d instanceof Date) return d.getTime();
      let s = String(d).replace(/'/g, '').trim().split(' ')[0];
      if (s.includes('-')) {
          let p = s.split('-');
          if (p[0].length === 4) return new Date(p[0], parseInt(p[1])-1, p[2]).getTime();
      }
      if (s.includes('/')) {
          let p = s.split('/');
          if (p.length === 3) return new Date(p[2], parseInt(p[1])-1, p[0]).getTime();
      }
      return 0;
  }
  
  function evaluateStudentForN8N(r) {
      const sys = String(r[10] || "").trim().toUpperCase();
      const st = String(r[39] || "MỚI").trim().toUpperCase();
      const isFullNE = String(r[65]).trim() === "ĐÃ FULL NE";
      const is9Plus = sys.includes("9+");
      const isTCSC = sys.includes("TRUNG CẤP") || sys.includes("SƠ CẤP");
      const isDuHoc = sys.includes("DU HỌC") || sys.includes("NGẮN HẠN") || sys.includes("SBS");
  
      let totalApproved = 0;
      const mIdx = [30, 31, 44, 46, 48];
      const sIdx = [50, 51, 52, 53, 54];
      for (let i = 0; i < 5; i++) {
          if (String(r[sIdx[i]]).trim().toUpperCase() === "ĐỒNG Ý") {
              totalApproved += parseInt(String(r[mIdx[i]]).replace(/\D/g, '')) || 0;
          }
      }
  
      let isCoc = false; let isLpxt = false;
  
      if (!isFullNE) {
          let threshold = is9Plus ? 2000000 : 1000000;
          if (totalApproved >= threshold || st === "CỌC THÀNH CÔNG" || st === "ĐÃ HOÀN THIỆN") isCoc = true;
          else if (totalApproved >= 150000) isLpxt = true;
      }
  
      return { isFullNE, isCoc, isLpxt, totalApproved, is9Plus, isTCSC, isDuHoc };
  }
  // =======================================================
  // BÁO CÁO THÁNG (N8N)
  // =======================================================
  function sendMonthlyReportToN8N() {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    if (tomorrow.getMonth() === now.getMonth()) return; 
  
    try {
      const fbData = readFromFirebase("students");
      if (!fbData) return;
      const data = Object.values(fbData);
  
      const today = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Ho_Chi_Minh"}));
      const monthStr = Utilities.formatDate(today, "GMT+7", "MM/yyyy");    
      const startTs = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0).getTime();
      const endTs = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59).getTime();
  
      let nbMonth = 0; let lpxtMonth = 0; let neMonth = 0;
      let tvvStats = {}; 
  
      data.forEach(r => {
          if (!r || !r[1]) return;
          
          let stEval = evaluateStudentForN8N(r);
          const createTs = getTsForReport(r[17]); 
          const tvvName = String(r[18] || "Khác").trim();
  
          if (createTs >= startTs && createTs <= endTs && stEval.totalApproved === 0) nbMonth++;
  
          const mIdx = [30, 31, 44, 46, 48]; const sIdx = [50, 51, 52, 53, 54]; const dIdx = [60, 61, 62, 63, 64]; 
          let hasPaymentThisMonth = false; 
  
          for(let i = 0; i < 5; i++) {
              let pTs = getTsForReport(r[dIdx[i]]);
              let amt = parseInt(String(r[mIdx[i]]).replace(/\D/g, '')) || 0;
              let status = String(r[sIdx[i]]).trim().toUpperCase();
              
              if (status === "ĐỒNG Ý" && amt > 0 && pTs >= startTs && pTs <= endTs) {
                  hasPaymentThisMonth = true;
              }
          }
  
          if (hasPaymentThisMonth) {
              if (stEval.isCoc || stEval.isFullNE) { neMonth++; tvvStats[tvvName] = (tvvStats[tvvName] || 0) + 1; } 
              else if (stEval.isLpxt) { lpxtMonth++; }
          }
      });
  
      let topTVV = "Chưa có"; let maxNE = 0;
      for (const [name, count] of Object.entries(tvvStats)) { if (count > maxNE) { maxNE = count; topTVV = name; } }
  
      const payload = { month: monthStr, nbMonth: nbMonth, lpxtMonth: lpxtMonth, neMonth: neMonth, topTvvName: topTVV, topTvvCount: maxNE };
      if (CONFIG.N8N_WEBHOOK_MONTHLY_REPORT) UrlFetchApp.fetch(CONFIG.N8N_WEBHOOK_MONTHLY_REPORT, { 'method': 'post', 'contentType': 'application/json', 'payload': JSON.stringify(payload), 'muteHttpExceptions': true });
    } catch (e) { console.error("Lỗi báo cáo tháng: " + e.message); }
  }
  
  // =======================================================
  // =======================================================
  // HÀM XÁC NHẬN FULL NE CHO KẾ TOÁN (QUYỀN LỰC TỐI CAO)
  // =======================================================
  // =======================================================
  // HÀM XÁC NHẬN FULL NE (TỰ ĐỘNG DUYỆT MỌI KHOẢN TIỀN TREO)
  // =======================================================
  function setFullNE(studentId) {
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);
      const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.STUDENTS);
      
      // 1. Tìm vị trí sinh viên
      const ids = sheet.getRange("B3:B").getValues().flat();
      let rowIndex = -1;
      for (let i = 0; i < ids.length; i++) {
        if (String(ids[i]).trim() === String(studentId).trim()) {
          rowIndex = i + 3;
          break;
        }
      }
      if (rowIndex === -1) throw new Error("Không tìm thấy sinh viên");
  
      const r = sheet.getRange(rowIndex, 1, 1, 71).getValues()[0].map(safe);
      const todayStr = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy");
  
      // 2. 🔥 TỰ ĐỘNG DUYỆT TẤT CẢ TIỀN ĐANG TREO (CHỮA BỆNH MẤT DOANH THU)
      const mIdx = [30, 31, 44, 46, 48];
      const sIdx = [50, 51, 52, 53, 54];
      const dIdx = [60, 61, 62, 63, 64];
      let autoApprovedAmount = 0;
  
      for (let i = 0; i < 5; i++) {
          let amt = parseInt(String(r[mIdx[i]]).replace(/\D/g, '')) || 0;
          let status = String(r[sIdx[i]]).trim();
  
          // Nếu TVV có gõ tiền > 0 mà Kế toán chưa duyệt (ô Xác nhận bị trống)
          if (amt > 0 && status === "") {
              sheet.getRange(rowIndex, sIdx[i] + 1).setValue("ĐỒNG Ý");
              sheet.getRange(rowIndex, dIdx[i] + 1).setValue(`'${todayStr}`); // Gán ngày nộp thành Hôm nay cho Báo cáo
              r[sIdx[i]] = "ĐỒNG Ý";
              r[dIdx[i]] = `'${todayStr}`;
              autoApprovedAmount += amt;
          }
      }
  
      // 3. Chốt trạng thái Full NE (Cột BN, BO, AN)
      sheet.getRange(rowIndex, 66).setValue("ĐÃ FULL NE"); 
      sheet.getRange(rowIndex, 67).setValue(`'${todayStr}`); 
      sheet.getRange(rowIndex, 40).setValue("ĐÃ HOÀN THIỆN");
  
      SpreadsheetApp.flush();
  
      // 4. Đồng bộ Firebase
      const rNew = sheet.getRange(rowIndex, 1, 1, 71).getValues()[0].map(safe);
      const fbSuccess = writeToFirebase("students/" + studentId, rNew);
      if (fbSuccess) sheet.getRange(rowIndex, CONFIG.SYNC_COL_INDEX + 1).setValue("ĐÃ ĐỒNG BỘ");
  
      // 5. 🔥 BẮN ĐÚNG 1 TIN NHẮN DUY NHẤT LÊN N8N (CHỐNG SPAM)
      try {
          const fd = {
              row_index: rowIndex, id: rNew[1], fullName: rNew[2], gender: rNew[3], dob: rNew[4], phone: rNew[5], email: rNew[6], address: rNew[8], currentAddress: rNew[9], system: rNew[10], major: rNew[12], schoolYear: rNew[13], pob: rNew[14], ethnicity: rNew[15], cccd: rNew[16], created_at: rNew[17], counselor: rNew[18], campus: rNew[19], father: rNew[20], fatherPhone: rNew[21], mother: rNew[22], motherPhone: rNew[23], guardian: rNew[24], guardianPhone: rNew[25], school: rNew[26], province: rNew[27], area: rNew[28],
              scholarship: rNew[29], scholarship2: rNew[69], source: rNew[56], source2: rNew[68],
              deposit_money: rNew[30], deposit_link: rNew[34], l1_money: rNew[31], l1_link: rNew[35], bs3: rNew[44], bill3: rNew[45], bs4: rNew[46], bill4: rNew[47], bs5: rNew[48], bill5: rNew[49], valid1: rNew[50], valid2: rNew[51], valid3: rNew[52], valid4: rNew[53], valid5: rNew[54], n8n_status: rNew[55], date1: rNew[60], date2: rNew[61], date3: rNew[62], date4: rNew[63], date5: rNew[64], total_money: rNew[37], status: rNew[39], note: rNew[38], situation: rNew[42], score: rNew[43]
          };
  
          const pl = { event: "accountant_full_ne", decision: "FULL NE", auto_approved_amount: autoApprovedAmount, full_data: fd };
          const opt = { 'method': 'post', 'contentType': 'application/json', 'payload': JSON.stringify(pl), 'muteHttpExceptions': true };
  
          if (CONFIG.N8N_WEBHOOK_CTSV && CONFIG.N8N_WEBHOOK_CTSV.startsWith("http")) {
              UrlFetchApp.fetch(CONFIG.N8N_WEBHOOK_CTSV, opt);
          }
      } catch (err) {}
  
      return { status: "success" };
    } catch (e) {
      return { status: "error", message: e.message };
    } finally {
      lock.releaseLock();
    }
  }
  
  
  
  function TEST_TIM_LOI_DATA() {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.STUDENTS);
    const lastRow = sheet.getLastRow();
    
    if (lastRow < 3) return console.log("Không có dữ liệu");
  
    const data = sheet.getRange(3, 1, lastRow - 2, 70).getDisplayValues();
    
    console.log("🚀 Bắt đầu quét " + data.length + " dòng dữ liệu...");
  
    let errorCount = 0;
  
    for (let i = 0; i < data.length; i++) {
      let row = data[i];
      let rowIndex = i + 3; 
      let id = String(row[1]).trim(); 
      
      if (!id) continue;
  
      if (/[.#$\[\]]/.test(id)) {
        console.log(`🚨 PHÁT HIỆN LỖI TẠI DÒNG ${rowIndex}: Mã SV "${id}" chứa ký tự cấm (., #, $, [, ]). Firebase sẽ chặn!`);
        errorCount++;
        continue; 
      }
  
      let cleanRow = row.map(cell => String(cell).replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim());
      while(cleanRow.length < 70) cleanRow.push("");
  
      let url = CONFIG.FIREBASE_URL + "students_test/" + id + ".json?auth=" + CONFIG.FIREBASE_SECRET;
      
      try {
        let options = {
          method: "put",
          contentType: "application/json",
          payload: JSON.stringify(cleanRow),
          muteHttpExceptions: true
        };
        
        let res = UrlFetchApp.fetch(url, options);
        
        if (res.getResponseCode() !== 200) {
           console.log(`⚠️ TỪ CHỐI TẠI DÒNG ${rowIndex} (Mã SV: ${id}): Firebase báo lỗi -> ${res.getContentText()}`);
           errorCount++;
        }
      } catch (e) {
        console.log(`❌ CRASH HỆ THỐNG TẠI DÒNG ${rowIndex} (Mã SV: ${id}): Lỗi -> ${e.message}`);
        errorCount++;
      }
    }
  
    console.log("------------------------------------------");
    if (errorCount === 0) {
      console.log("✅ TUYỆT VỜI! Toàn bộ dòng dữ liệu đều sạch sẽ và hợp lệ!");
    } else {
      console.log(`🛑 KẾT LUẬN: Phát hiện ${errorCount} dòng bị lỗi.`);
    }
  }
  
  // =======================================================
  // HÀM NHẬP HÀNG LOẠT TỪ EXCEL
  // =======================================================
  function processBulkImport(dataList, counselorName) {
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(30000);
      const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.STUDENTS);
      
      const reqCols = CONFIG.SYNC_COL_INDEX + 1;
      if (sheet.getMaxColumns() < reqCols) sheet.insertColumnsAfter(sheet.getMaxColumns(), reqCols - sheet.getMaxColumns());
  
      const lastRow = Math.max(sheet.getLastRow(), 3);
      const existingData = sheet.getRange(3, 1, lastRow - 2, 17).getValues();
  
      let existingPhones = new Set();
      let existingCCCDs = new Set();
      let maxSeq = 0;
      const prefix = Utilities.formatDate(new Date(), "GMT+7", "yyMMdd");
  
     existingData.forEach(r => {
          let p = formatPhone(r[5]);
          let c = formatCCCD(r[16]);
          if(p) existingPhones.add(p);
          
          // KHÔNG ĐƯA CHỮ "CHƯA CÓ" VÀO BỘ LỌC TRÙNG
          if(c && c !== "CHƯA CÓ") existingCCCDs.add(c); 
          
          let existingId = String(safe(r[1]));
          if (existingId.startsWith(prefix)) {
              let seq = parseInt(existingId.slice(6), 10);
              if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
          }
      });
  
      let rowsToInsert = [];
      let firebaseUpdates = {};
      let statusUpdates = []; // Trạng thái đồng bộ hàng loạt
      let successCount = 0;
      let failCount = 0;
      let createdAt = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
  
      for (let i = 0; i < dataList.length; i++) {
          let item = dataList[i];
          let phone = formatPhone(item.sdt);
          let cccd = formatCCCD(item.cccd);
          let isNoCCCD = (String(item.cccd).trim().toUpperCase() === "CHƯA CÓ");
  
          if (existingPhones.has(phone)) { failCount++; continue; }
          if (!isNoCCCD && cccd && existingCCCDs.has(cccd)) { failCount++; continue; }
  
          maxSeq++;
          let newId = prefix + ("0000" + maxSeq).slice(-4);
          
          let r = new Array(70).fill("");
          r[0] = ""; 
          r[1] = newId;
          r[2] = String(item.hoTen).toUpperCase();
          r[3] = item.gioiTinh;
          r[4] = item.ngaySinh ? "'" + formatStandardDate(item.ngaySinh) : "";
          r[5] = "'" + phone;
          r[6] = item.email;
          r[8] = item.diaChi;
          r[10] = item.heDaoTao;
          r[12] = item.nganhHoc;
          r[16] = isNoCCCD ? "CHƯA CÓ" : (cccd ? "'" + cccd : "");
          r[17] = createdAt;
          r[18] = counselorName; 
          r[27] = item.tinhTHPT;
          r[39] = "MỚI"; 
          r[56] = item.nguon;
          
          rowsToInsert.push(r);
          firebaseUpdates[newId] = r.map(safe);
          
          existingPhones.add(phone);
          if (!isNoCCCD && cccd) existingCCCDs.add(cccd);
          successCount++;
      }
  
      if (rowsToInsert.length > 0) {
          let currentStt = lastRow - 2;
          rowsToInsert.forEach(r => {
              currentStt++;
              r[0] = currentStt;
          });
          
          // Ghi lên Sheet
          sheet.getRange(lastRow + 1, 1, rowsToInsert.length, 70).setValues(rowsToInsert);
          SpreadsheetApp.flush();
  
          // Cập nhật Firebase
          const fbUrl = CONFIG.FIREBASE_URL + "students.json?auth=" + CONFIG.FIREBASE_SECRET;
          const fbOptions = {
              method: "patch", 
              contentType: "application/json",
              payload: JSON.stringify(firebaseUpdates),
              muteHttpExceptions: true
          };
          const fbRes = UrlFetchApp.fetch(fbUrl, fbOptions);
          
          // Cập nhật trạng thái đồng bộ
          let isFbSuccess = (fbRes.getResponseCode() >= 200 && fbRes.getResponseCode() < 300);
          let statusString = isFbSuccess ? "ĐÃ ĐỒNG BỘ" : "LỖI ĐỒNG BỘ";
          
          for (let i = 0; i < rowsToInsert.length; i++) {
              statusUpdates.push([statusString]);
          }
          
          sheet.getRange(lastRow + 1, CONFIG.SYNC_COL_INDEX + 1, statusUpdates.length, 1).setValues(statusUpdates);
      }
  
      // Trả kèm map id -> row của các hồ sơ vừa thêm — client append trực tiếp thay vì tải lại toàn bộ students.json
      return {
          status: "success",
          message: `Đã nhập thành công ${successCount} hồ sơ mới. Bỏ qua ${failCount} hồ sơ bị trùng SĐT/CCCD.`,
          insertedRows: firebaseUpdates,
      };

    } catch (e) {
        return { status: "error", message: e.message };
    } finally {
        lock.releaseLock();
    }
  }
  
  // =======================================================
  // HÀM CHẠY NGẦM BAN ĐÊM (NIGHTLY SYNC)
  // =======================================================
  function syncFailedDataToFirebase() {
    try {
      const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.STUDENTS);
      if (!sheet) return;
  
      const lastRow = sheet.getLastRow();
      if (lastRow < 3) return;
  
      // Lấy toàn bộ cột trạng thái đồng bộ
      const syncStatusData = sheet.getRange(3, CONFIG.SYNC_COL_INDEX + 1, lastRow - 2, 1).getValues();
      
      let rowsToSync = [];
      
      // Tìm các dòng bị lỗi đồng bộ
      for (let i = 0; i < syncStatusData.length; i++) {
        if (String(syncStatusData[i][0]).trim() === "LỖI ĐỒNG BỘ") {
          rowsToSync.push(i + 3); // Lấy số dòng thực tế trên Sheet
        }
      }
      
      if (rowsToSync.length === 0) {
        console.log("Không có dữ liệu lỗi đồng bộ nào cần chạy bù.");
        return;
      }
      
      console.log(`Đang chạy bù đồng bộ cho ${rowsToSync.length} hồ sơ...`);
      
      // Xử lý từng dòng bị lỗi
      for (let i = 0; i < rowsToSync.length; i++) {
        let rowIndex = rowsToSync[i];
        let rowData = sheet.getRange(rowIndex, 1, 1, 70).getValues()[0];
        let maSV = String(rowData[1]).trim();
        
        if (!maSV) continue;
        
        let dataToSync = rowData.map(safe);
        
        // Thử đẩy lại lên Firebase
        let isSuccess = writeToFirebase("students/" + maSV, dataToSync);
        
        if (isSuccess) {
          // Cập nhật lại trạng thái thành công
          sheet.getRange(rowIndex, CONFIG.SYNC_COL_INDEX + 1).setValue("ĐÃ ĐỒNG BỘ");
          console.log(`Đồng bộ bù thành công: ${maSV}`);
        } else {
          console.log(`Đồng bộ bù THẤT BẠI: ${maSV}`);
        }
        
        // Nghỉ 500ms để tránh quá tải API của Google/Firebase
        Utilities.sleep(500); 
      }
      
    } catch (err) {
      console.error("Lỗi quá trình Nightly Sync:", err);
    }
  }
  
  // Hàm hỗ trợ mã hóa email làm key Firebase (Thay dấu . bằng dấu ,)
  function encodeEmail(email) { 
    return String(email || "").replace(/\./g, ',').toLowerCase().trim(); 
  }
  
  function MIGRATE_USERS_TO_FIREBASE() {
    try {
      let firebaseUsers = {};
  
      // 1. ÉP TÀI KHOẢN ADMIN CỦA ANH LÊN TRƯỚC
      // Anh có thể đổi email/pass admin tại đây nếu muốn
      let adminEmail = "admin@admin.com"; 
      let adminKey = encodeEmail(adminEmail);
      firebaseUsers[adminKey] = {
        name: "ADMIN",
        displayName: "QUẢN TRỊ TỔNG",
        email: adminEmail,
        password: "123", // Thay bằng pass admin anh muốn
        code: "ADMIN",
        phone: "",
        dept: "Hệ thống",
        manager: "",
        role: "admin"
      };
  
      // 2. QUÉT TIẾP CÁC TVV TỪ SHEET
      const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.COUNSELORS);
      const lastRow = sheet.getLastRow();
      
      if (lastRow >= 3) {
        const data = sheet.getRange(3, 1, lastRow - 2, 9).getValues();
        data.forEach(row => {
          let email = safe(row[2]).toLowerCase();
          if (email && email !== adminEmail) { // Tránh trùng với admin vừa tạo ở trên
            let emKey = encodeEmail(email);
            firebaseUsers[emKey] = {
              name: safe(row[0]),
              displayName: safe(row[1]),
              email: email,
              password: safe(row[3]),
              code: safe(row[4]),
              phone: safe(row[5]),
              dept: safe(row[6]),
              manager: safe(row[7]),
              role: safe(row[8]) || "tvv"
            };
          }
        });
      }
  
      // Ghi đè lên Firebase
      writeToFirebase("users", firebaseUsers);
      return "✅ ĐÃ DI CƯ THÀNH CÔNG " + Object.keys(firebaseUsers).length + " TÀI KHOẢN (BAO GỒM ADMIN) LÊN FIREBASE!";
    } catch (e) {
      return "❌ Lỗi di cư: " + e.toString();
    }
  }
  
  // =======================================================
  // HÀM DÀNH CHO ADMIN QUẢN LÝ NHÂN SỰ (GỌI TỪ WEB)
  // =======================================================
  function adminManageUser(action, userData) {
    try {
      if (!userData || !userData.email) return { status: "error", message: "Email không hợp lệ" };
      
      const emKey = encodeEmail(userData.email); // Key MỚI
  
      if (action === 'delete') {
        const url = CONFIG.FIREBASE_URL + "users/" + emKey + ".json?auth=" + CONFIG.FIREBASE_SECRET;
        UrlFetchApp.fetch(url, { method: "delete", muteHttpExceptions: true });
      } else {
        // NẾU LÀ CẬP NHẬT VÀ CÓ SỰ THAY ĐỔI EMAIL
        if (action === 'update' && userData.oldEmail && userData.oldEmail !== userData.email) {
          const oldKey = encodeEmail(userData.oldEmail);
          // Xóa Key chứa Email cũ đi để không bị rác
          const deleteUrl = CONFIG.FIREBASE_URL + "users/" + oldKey + ".json?auth=" + CONFIG.FIREBASE_SECRET;
          UrlFetchApp.fetch(deleteUrl, { method: "delete", muteHttpExceptions: true });
        }
        
        // Xóa trường oldEmail khỏi object trước khi lưu để DB sạch sẽ
        delete userData.oldEmail;
  
        // Ghi thông tin vào Key mới (hoặc đè Key cũ nếu email không đổi)
        writeToFirebase("users/" + emKey, userData);
      }
      return { status: "success" };
    } catch (e) { 
      return { status: "error", message: e.toString() }; 
    }
  }
  
  // =======================================================
  // HÀM BACKUP HỌC SINH TỪ FIREBASE VỀ SHEET (CHẠY LÚC NỬA ĐÊM)
  // =======================================================
  function BACKUP_STUDENTS_TO_SHEET() {
    try {
      const allStudents = readFromFirebase("students");
      if (!allStudents) {
        console.log("Không có dữ liệu trên Firebase để backup.");
        return;
      }
  
      const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.STUDENTS);
  
      // Chuyển Object Firebase thành Mảng và sắp xếp theo Mã SV cho gọn gàng
      let studentArray = Object.values(allStudents);
      studentArray.sort((a, b) => {
          let idA = String(a[1] || "");
          let idB = String(b[1] || "");
          return idA.localeCompare(idB);
      });
  
      // Xóa sạch dữ liệu cũ trên Sheet từ dòng 3 (để dọn rác)
      const lastRow = Math.max(sheet.getLastRow(), 3);
      if (lastRow >= 3) {
          // Xóa 71 cột (bao gồm cột Đồng bộ)
          sheet.getRange(3, 1, lastRow, 71).clearContent(); 
      }
  
      // Chuẩn bị Mảng dữ liệu mới để đập vào Sheet
      let rows = [];
      studentArray.forEach((s, index) => {
          let row = new Array(71).fill("");
          // Phục hồi lại 70 cột dữ liệu
          for(let i = 0; i < 70; i++) {
              row[i] = s[i] !== undefined ? s[i] : "";
          }
          row[0] = index + 1; // Cập nhật lại Số thứ tự chuẩn
          row[CONFIG.SYNC_COL_INDEX + 1] = "ĐÃ ĐỒNG BỘ"; // Trạng thái backup
          rows.push(row);
      });
  
      // Dán đè một lần duy nhất xuống Sheet cho siêu tốc
      if (rows.length > 0) {
          sheet.getRange(3, 1, rows.length, 71).setValues(rows);
      }
      
      console.log("✅ Đã Backup thành công " + rows.length + " học sinh từ Firebase về Sheet.");
    } catch (e) {
      console.error("❌ Lỗi Backup Học Sinh: " + e.message);
    }
  }