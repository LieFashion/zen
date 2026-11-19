
const SPREADSHEET_ID = "1em5L6Blsix9LqEN5aN3T8qyPtXy64dmpQQQcsBaYR0Q";
const FIREBASE_WEB_API_KEY = "AIzaSyAS5VJQvoacGT7B6qjQdiuC8FqkTQ6mvGo";
const SHEETS = {
  Products: ["id","name","category","price","image","description","active","updatedAt"],
  Media: ["id","title","type","url","active","updatedAt"],
  Contacts: ["id","label","type","value","isOrder","active","updatedAt"],
  Settings: ["key","value"],
  Admins: ["email","active"]
};
const CACHE_SECONDS = 45;

function setupSpreadsheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  Object.keys(SHEETS).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) sh.getRange(1,1,1,SHEETS[name].length).setValues([SHEETS[name]]);
    sh.setFrozenRows(1);
  });
  const settings = ss.getSheetByName("Settings");
  if (settings.getLastRow() === 1) settings.getRange(2,1,2,2).setValues([
    ["heroDescription","Oleh-oleh khas Sekotong, dibawa pulang dari Gili. Temukan merchandise yang menyimpan cerita tentang matahari, tanah, dan ketenangan."],
    ["instagram",""]
  ]);
  return "ZEN spreadsheet siap digunakan.";
}
function doGet(e) {
  const p = (e && e.parameter) || {};
  let result;
  try {
    if (p.action === "publicData") result = {ok:true,data:getPublicData_()};
    else if (p.action === "adminData") {
      const user = verifyAdmin_(p.idToken);
      result = {ok:true,data:getAdminData_(),email:user.email};
    } else result = {ok:false,error:"Action tidak dikenal."};
  } catch(err) { result = {ok:false,error:String(err.message || err)}; }
  const json = JSON.stringify(result);
  if (p.callback && /^[a-zA-Z_$][0-9a-zA-Z_$]*$/.test(p.callback)) {
    return ContentService.createTextOutput(p.callback+"("+json+");").setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
function doPost(e) {
  let result;
  try {
    const payload = JSON.parse((e && e.parameter && e.parameter.payload) || "{}");
    verifyAdmin_(payload.idToken);
    if (payload.action === "save") saveItem_(payload.kind,payload.item);
    else if (payload.action === "delete") deleteItem_(payload.kind,payload.id);
    else if (payload.action === "settings") saveSettings_(payload.settings || {});
    else throw new Error("Action tidak dikenal.");
    CacheService.getScriptCache().remove("zen_public_data");
    result = {ok:true};
  } catch(err) { result = {ok:false,error:String(err.message || err)}; }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
function verifyAdmin_(idToken) {
  if (!idToken) throw new Error("Token login tidak ditemukan.");
  if (!FIREBASE_WEB_API_KEY || FIREBASE_WEB_API_KEY.indexOf("PASTE_") === 0) throw new Error("FIREBASE_WEB_API_KEY belum diatur di Code.gs.");
  const url = "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key="+encodeURIComponent(FIREBASE_WEB_API_KEY);
  const response = UrlFetchApp.fetch(url,{method:"post",contentType:"application/json",payload:JSON.stringify({idToken:idToken}),muteHttpExceptions:true});
  const body = JSON.parse(response.getContentText() || "{}");
  if (response.getResponseCode() !== 200 || !body.users || !body.users.length) throw new Error("Sesi Firebase tidak valid. Silakan login ulang.");
  const user = body.users[0], email = String(user.email || "").toLowerCase();
  if (!email || user.disabled) throw new Error("Akun tidak aktif.");
  const admins = readRows_("Admins");
  const allowed = admins.some(a => String(a.email).toLowerCase() === email && String(a.active).toLowerCase() !== "false");
  if (!allowed) throw new Error("Email ini belum terdaftar sebagai admin di Spreadsheet.");
  return {email:email,uid:user.localId};
}
function getPublicData_() {
  const cache = CacheService.getScriptCache(), cached = cache.get("zen_public_data");
  if (cached) return JSON.parse(cached);
  const data = {products:readRows_("Products"),media:readRows_("Media"),contacts:readRows_("Contacts"),settings:getSettings_()};
  cache.put("zen_public_data",JSON.stringify(data),CACHE_SECONDS);
  return data;
}
function getAdminData_() {
  return {products:readRows_("Products"),media:readRows_("Media"),contacts:readRows_("Contacts"),settings:getSettings_()};
}
function getSettings_() {
  const rows=readRows_("Settings"), out={};
  rows.forEach(r=>out[r.key]=r.value);
  return out;
}
function readRows_(sheetName) {
  const ss=SpreadsheetApp.openById(SPREADSHEET_ID), sh=ss.getSheetByName(sheetName);
  if (!sh || sh.getLastRow()<2) return [];
  const values=sh.getRange(1,1,sh.getLastRow(),sh.getLastColumn()).getDisplayValues();
  const headers=values.shift();
  return values.filter(row=>row.some(v=>v!=="")).map(row=>{
    const obj={}; headers.forEach((h,i)=>obj[h]=row[i]);
    if (obj.active !== undefined) obj.active = String(obj.active).toLowerCase() !== "false";
    if (obj.isOrder !== undefined) obj.isOrder = String(obj.isOrder).toLowerCase() === "true";
    return obj;
  });
}
function saveItem_(kind,item) {
  const map={products:"Products",media:"Media",contacts:"Contacts"};
  const sheetName=map[kind]; if (!sheetName) throw new Error("Jenis data tidak valid.");
  if (!item || !item.name && !item.title && !item.label) throw new Error("Nama atau judul wajib diisi.");
  const ss=SpreadsheetApp.openById(SPREADSHEET_ID), sh=ss.getSheetByName(sheetName);
  const headers=SHEETS[sheetName], id=String(item.id || Utilities.getUuid()), now=new Date().toISOString();
  const values=sh.getDataRange().getValues(), idCol=headers.indexOf("id");
  let rowIndex=values.findIndex((r,i)=>i>0 && String(r[idCol])===id);
  const row=headers.map(h=>{
    if(h==="id") return id;
    if(h==="updatedAt") return now;
    if(h==="active") return item.active === false ? false : true;
    if(h==="isOrder") return item.isOrder === true || String(item.isOrder)==="true";
    return item[h] === undefined ? "" : item[h];
  });
  if(rowIndex>0) sh.getRange(rowIndex+1,1,1,row.length).setValues([row]);
  else sh.appendRow(row);
}
function deleteItem_(kind,id) {
  const map={products:"Products",media:"Media",contacts:"Contacts"}, sheetName=map[kind];
  if(!sheetName || !id) throw new Error("Data tidak valid.");
  const sh=SpreadsheetApp.openById(SPREADSHEET_ID), sheet=sh.getSheetByName(sheetName), values=sheet.getDataRange().getValues();
  const idx=values.findIndex((r,i)=>i>0 && String(r[0])===String(id));
  if(idx<1) throw new Error("Item tidak ditemukan.");
  sheet.deleteRow(idx+1);
}
function saveSettings_(settings) {
  const sh=SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Settings");
  Object.keys(settings).forEach(key=>{
    const values=sh.getDataRange().getValues(), idx=values.findIndex((r,i)=>i>0 && r[0]===key);
    if(idx>0) sh.getRange(idx+1,2).setValue(String(settings[key]));
    else sh.appendRow([key,String(settings[key])]);
  });
}
