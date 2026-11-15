/**
 * API Katalog Bersama - PT. Wira Hutama Multindo & CV. Prakarsa Tekindo
 * Pasang di Google Sheet master: Extensions > Apps Script > tempel file ini.
 * Deploy > New deployment > Web app > Execute as: Me, Who has access: Anyone.
 * Lihat API_HANDOFF.md untuk kontrak lengkap.
 */
var SH = {produk:'Produk', include:'Include', perusahaan:'Perusahaan', diskon:'Diskon', promo:'Promo', aplikasi:'Aplikasi', log:'Log Foto'};
var SESSION_SEC = 6 * 3600;
var MAX_PHOTO_BYTES = 3 * 1024 * 1024;
var CO = ['whm', 'prakarsa'];

/* ============ pintu masuk ============ */
function doGet(e) {
  try {
    var p = e.parameter || {}, a = p.action || 'catalog';
    if (a === 'ping') return out({ok: true, time: new Date().toISOString()});
    if (a === 'version') return out({ok: true, version: version()});
    if (a === 'catalog') return out(publicCatalog(coOf(p.c)));
    if (a === 'quote_catalog') return out(quoteCatalog(p.key, p.c, p.app));
    return out({ok: false, error: 'action tidak dikenal'});
  } catch (err) { return out({ok: false, error: 'server: ' + err.message}); }
}

function doPost(e) {
  try {
    var b = JSON.parse(e.postData.contents), a = b.action;
    if (a === 'login') return out(login(b));
    if (a === 'quote_catalog') return out(quoteCatalog(b.key, b.c || b.company, b.app));
    var s = session(b.token);
    if (!s) return out({ok: false, error: 'sesi'});
    if (a === 'admin_catalog') return out(adminCatalog(s));
    if (a === 'upload_photo') return out(uploadPhoto(s, b));
    if (a === 'set_discount') return out(setDiscount(s, b));
    if (a === 'set_show_include') return out(setShowInclude(s, b));
    if (a === 'logout') { CacheService.getScriptCache().remove('ses_' + b.token); return out({ok: true}); }
    return out({ok: false, error: 'action tidak dikenal'});
  } catch (err) { return out({ok: false, error: 'server: ' + err.message}); }
}

function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function coOf(c) { c = String(c || '').toLowerCase(); return CO.indexOf(c) >= 0 ? c : 'whm'; }

/* ============ utilitas sheet ============ */
function sheet(n) { var s = SpreadsheetApp.getActive().getSheetByName(n); if (!s) throw new Error('Tab tidak ada: ' + n); return s; }
function table(n) {
  var s = sheet(n), v = s.getDataRange().getValues(); if (!v.length) return {head: [], rows: []};
  var h = v.shift().map(String);
  return {head: h, rows: v.filter(function (r) { return r.some(function (c) { return c !== ''; }); }).map(function (r) {
    var o = {}; h.forEach(function (k, i) { o[k] = r[i]; }); return o; })};
}
function col(n, name) { var h = sheet(n).getRange(1, 1, 1, sheet(n).getLastColumn()).getValues()[0]; var i = h.indexOf(name); if (i < 0) throw new Error('Kolom tidak ada: ' + name); return i + 1; }
function num(v) {
  if (typeof v === 'number') return v; var s = String(v == null ? '' : v).replace(/rp/i, '').replace(/\s/g, ''); if (!s) return null;
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.'); else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  var f = parseFloat(s); return isNaN(f) ? null : f;
}
function ymd(v) { if (!v) return ''; if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Jakarta', 'yyyy-MM-dd'); return String(v).slice(0, 10); }
function yes(v) { return /^(ya|yes|true|1)$/i.test(String(v).trim()); }
function sha(s) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8).map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join(''); }
function salt() { return Utilities.getUuid().replace(/-/g, ''); }

/* ============ versi + cache bertingkat (batas 100 KB per kunci) ============ */
function version() { return PropertiesService.getScriptProperties().getProperty('VERSION') || '0'; }
function bump() { PropertiesService.getScriptProperties().setProperty('VERSION', Utilities.formatDate(new Date(), 'Asia/Jakarta', "yyyy-MM-dd'T'HH:mm:ss")); }
function onEdit() { bump(); }  // sunting manual di Sheet => versi baru. Sunting skrip memanggil bump() sendiri.
function cacheGet(k) {
  var c = CacheService.getScriptCache(), n = c.get(k + '#n'); if (!n) return null;
  var keys = []; for (var i = 0; i < +n; i++) keys.push(k + '#' + i);
  var m = c.getAll(keys), s = ''; for (var j = 0; j < +n; j++) { if (m[keys[j]] == null) return null; s += m[keys[j]]; } return s;
}
function cachePut(k, s) {
  var c = CacheService.getScriptCache(), n = Math.ceil(s.length / 90000), o = {};
  for (var i = 0; i < n; i++) o[k + '#' + i] = s.substr(i * 90000, 90000); o[k + '#n'] = String(n); c.putAll(o, 600);
}

/* ============ pembentukan data ============ */
function companies() {
  var m = {}; table(SH.perusahaan).rows.forEach(function (r) { m[String(r['Kode']).toLowerCase()] = r; }); return m;
}
function discounts(co) {
  var m = {};
  table(SH.diskon).rows.forEach(function (r) {
    if (String(r['Perusahaan']).toLowerCase() !== co) return;
    var p = num(r['Persen']); if (p > 0) m[r['ID Produk']] = {p: p, s: ymd(r['Mulai']), e: ymd(r['Selesai'])};
  }); return m;
}
function baseProducts(co, withAllDisc) {
  var dm = discounts(co);
  return table(SH.produk).rows.filter(function (r) { return String(r['Status']) !== 'Nonaktif'; }).map(function (r) {
    var o = {id: r['ID'], kode: r['Kode Prakarsa'], whm: r['Kode WHM'], nama: r['Nama Produk'], tampil: r['Nama Tampil'] || r['Nama Produk'], kat: r['Kategori'], sub: r['Sub Kategori'],
      varian: r['Varian / Ukuran'], std: r['Standar'], spec: r['Spesifikasi'], qty: num(r['Qty']) || 1, sat: r['Satuan'], harga: num(r['Harga Satuan (Rp)']),
      tipe: r['Tipe'], slug: r['Slug'], status: 'Aktif', nI: num(r['Jumlah Item Include']) || 0, foto: r['Foto ID'] || r['URL Gambar'] || '', d: {}};
    if (dm[o.id]) o.d[co] = dm[o.id]; return o;
  });
}
function includes(withPrice) {
  return table(SH.include).rows.map(function (r) {
    return {pid: r['ID Produk'], grup: r['Grup'], kode: r['Kode Item'], nama: r['Nama Item'], spec: r['Spesifikasi'], qty: num(r['Qty']) || 1, sat: r['Satuan'],
      harga: withPrice ? num(r['Harga Satuan (Rp)']) : null, ket: r['Keterangan']};
  });
}
function promos(co) {
  return table(SH.promo).rows.filter(function (r) { var c = String(r['Perusahaan']).toLowerCase(); return yes(r['Aktif']) && (c === 'semua' || c === 'all' || c === co); })
    .map(function (r) { return {judul: r['Judul'], teks: r['Teks'], label: r['Label Tombol'], s: ymd(r['Mulai']), e: ymd(r['Selesai']), co: 'all', aktif: true}; });
}
function companyInfo(co) {
  var r = companies()[co] || {}, o = {}; o[co] = {nama: r['Nama Perusahaan'], wa: String(r['WhatsApp'] || '').replace(/\D/g, ''), showInc: yes(r['Tampil Harga Include'])}; return o;
}

/* ============ katalog publik (TIDAK memuat harga item include kecuali diizinkan) ============ */
function publicCatalog(co) {
  var key = 'pub_' + co + '_' + version(), hit = cacheGet(key); if (hit) return JSON.parse(hit);
  var ci = companyInfo(co), show = ci[co].showInc;
  var res = {ok: true, version: version(), companies: ci, promos: promos(co), products: baseProducts(co), includes: includes(show)};
  cachePut(key, JSON.stringify(res)); return res;
}

/* ============ login direktur ============ */
function login(b) {
  var co = coOf(b.company), name = String(b.director || '').trim().toLowerCase(), pin = String(b.pin || '');
  if (!name || !pin) return {ok: false, error: 'Lengkapi nama dan PIN'};
  var c = CacheService.getScriptCache(), rk = 'try_' + co + '_' + name, tries = +(c.get(rk) || 0);
  if (tries >= 5) return {ok: false, error: 'Terlalu banyak percobaan. Coba lagi 10 menit lagi.'};
  var r = companies()[co], ok = false;
  if (r && String(r['Status']) === 'Aktif' && r['PIN Hash'] && String(r['Nama Direktur']).trim().toLowerCase() === name) ok = sha(r['Salt'] + pin) === r['PIN Hash'];
  if (!ok) { c.put(rk, String(tries + 1), 600); return {ok: false, error: 'Nama atau PIN tidak cocok'}; }
  c.remove(rk);
  var token = Utilities.getUuid() + sha(String(Math.random())).slice(0, 16);
  c.put('ses_' + token, JSON.stringify({co: co, director: r['Nama Direktur']}), SESSION_SEC);
  return {ok: true, token: token, company: co, director: r['Nama Direktur']};
}
function session(t) { if (!t) return null; var v = CacheService.getScriptCache().get('ses_' + t); return v ? JSON.parse(v) : null; }

function adminCatalog(s) {
  return {ok: true, version: version(), products: baseProducts(s.co), includes: includes(true)};
}

/* ============ tindakan direktur ============ */
function uploadPhoto(s, b) {
  var pid = String(b.productId || ''), mime = String(b.mime || '');
  if (!/^image\/(jpeg|png|webp)$/.test(mime)) return {ok: false, error: 'Format foto harus JPG, PNG, atau WebP'};
  var bytes = Utilities.base64Decode(String(b.data || '')); if (!bytes.length || bytes.length > MAX_PHOTO_BYTES) return {ok: false, error: 'Ukuran foto maksimal 3 MB'};
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var rows = sheet(SH.produk).getDataRange().getValues(), h = rows[0], ci = h.indexOf('ID'), cf = h.indexOf('Foto ID'), at = -1;
    for (var i = 1; i < rows.length; i++) if (rows[i][ci] === pid) { at = i + 1; break; }
    if (at < 0) return {ok: false, error: 'Produk tidak ditemukan'};
    var ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    var f = photoFolder().createFile(Utilities.newBlob(bytes, mime, pid + '_' + Date.now() + '.' + ext));
    f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    sheet(SH.produk).getRange(at, cf + 1).setValue(f.getId());
    sheet(SH.log).appendRow([new Date(), s.co, pid, f.getId(), f.getName()]);
    bump(); return {ok: true, fotoId: f.getId()};
  } finally { lock.releaseLock(); }
}
function photoFolder() {
  var p = PropertiesService.getScriptProperties(), id = p.getProperty('PHOTO_FOLDER');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var f = DriveApp.createFolder('Foto Katalog (jangan dihapus)'); p.setProperty('PHOTO_FOLDER', f.getId()); return f;
}
function setDiscount(s, b) {
  var pid = String(b.productId || ''), pct = Number(b.pct), st = String(b.start || ''), en = String(b.end || '');
  if (isNaN(pct) || pct < 0 || pct > 90) return {ok: false, error: 'Diskon 0 sampai 90 persen'};
  if (st && en && en < st) return {ok: false, error: 'Tanggal akhir sebelum tanggal mulai'};
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    ensureDiscountCols();
    var sh = sheet(SH.diskon), v = sh.getDataRange().getValues(), h = v[0], at = -1;
    for (var i = 1; i < v.length; i++) if (String(v[i][0]).toLowerCase() === s.co && v[i][1] === pid) { at = i + 1; break; }
    var row = [s.co, pid, pct, new Date(), st, en];
    if (pct === 0) { if (at > 0) sh.deleteRow(at); }
    else if (at > 0) sh.getRange(at, 1, 1, 6).setValues([row]); else sh.appendRow(row);
    bump(); return {ok: true};
  } finally { lock.releaseLock(); }
}
function ensureDiscountCols() {
  var sh = sheet(SH.diskon); if (sh.getRange(1, 5).getValue() !== 'Mulai') sh.getRange(1, 5, 1, 2).setValues([['Mulai', 'Selesai']]);
}
function setShowInclude(s, b) {
  var sh = sheet(SH.perusahaan), v = sh.getDataRange().getValues(), h = v[0], ck = h.indexOf('Kode'), cs = h.indexOf('Tampil Harga Include');
  for (var i = 1; i < v.length; i++) if (String(v[i][ck]).toLowerCase() === s.co) { sh.getRange(i + 1, cs + 1).setValue(b.value ? 'Ya' : 'Tidak'); bump(); return {ok: true}; }
  return {ok: false, error: 'Perusahaan tidak ditemukan'};
}

/* ============ API untuk web penawaran (internal, pakai key aplikasi) ============ */
function quoteCatalog(key, c, app) {
  if (!key || !app) return {ok: false, error: 'key dan app wajib'};
  var rows = table(SH.aplikasi).rows, r = null;
  rows.forEach(function (x) { if (String(x['Nama Aplikasi']) === String(app) && yes(x['Aktif'])) r = x; });
  if (!r || sha(r['Salt'] + key) !== r['Key Hash']) return {ok: false, error: 'key tidak valid'};
  var co = coOf(c), withPrice = yes(r['Tampil Harga Item']);
  var ps = baseProducts(co);
  // web penawaran membutuhkan kedua kode: p.kode (Prakarsa) dan p.whm
  return {ok: true, version: version(), company: co, snapshotNote: 'Salin nama, kode, harga ke dokumen penawaran saat dibuat (snapshot). Jangan referensi live.',
    companies: companyInfo(co), products: ps, includes: includes(withPrice)};
}

/* ============ menu Sheet (untuk Anda, bukan untuk publik) ============ */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Katalog')
    .addItem('Atur PIN direktur...', 'menuPin')
    .addItem('Buat key aplikasi penawaran...', 'menuKey')
    .addItem('Siapkan kolom & folder foto', 'menuSetup')
    .addItem('Segarkan data web sekarang', 'bump').addToUi();
}
function menuSetup() { ensureDiscountCols(); photoFolder(); bump(); SpreadsheetApp.getUi().alert('Siap. Folder foto dibuat di Drive Anda.'); }
function menuPin() {
  var ui = SpreadsheetApp.getUi();
  var c = ui.prompt('Kode perusahaan (whm atau prakarsa)'); if (c.getSelectedButton() !== ui.Button.OK) return;
  var n = ui.prompt('Nama direktur (dipakai saat login)'); if (n.getSelectedButton() !== ui.Button.OK) return;
  var p = ui.prompt('PIN baru (minimal 6 angka)'); if (p.getSelectedButton() !== ui.Button.OK) return;
  var pin = p.getResponseText().trim(); if (!/^\d{6,}$/.test(pin)) { ui.alert('PIN minimal 6 angka.'); return; }
  var sh = sheet(SH.perusahaan), v = sh.getDataRange().getValues(), h = v[0];
  for (var i = 1; i < v.length; i++) if (String(v[i][0]).toLowerCase() === c.getResponseText().trim().toLowerCase()) {
    var s = salt(); sh.getRange(i + 1, h.indexOf('Nama Direktur') + 1).setValue(n.getResponseText().trim());
    sh.getRange(i + 1, h.indexOf('Salt') + 1).setValue(s); sh.getRange(i + 1, h.indexOf('PIN Hash') + 1).setValue(sha(s + pin));
    ui.alert('PIN tersimpan (terenkripsi). PIN asli tidak disimpan di Sheet.'); return;
  }
  ui.alert('Kode perusahaan tidak ditemukan.');
}
function menuKey() {
  var ui = SpreadsheetApp.getUi(), a = ui.prompt('Nama aplikasi penawaran (contoh: penawaran-whm)'); if (a.getSelectedButton() !== ui.Button.OK) return;
  var key = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''), s = salt();
  sheet(SH.aplikasi).appendRow([a.getResponseText().trim(), sha(s + key), s, 'semua', 'Ya', 'Ya']);
  ui.alert('KEY (catat sekarang, tidak bisa ditampilkan lagi):\n\n' + key + '\n\nSimpan di environment variable Netlify aplikasi penawaran, jangan di kode browser.');
}
