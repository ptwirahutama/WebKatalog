# Panduan Pasang

Urutannya bebas. Situs sudah bisa tampil lewat GitHub + Netlify meski Apps Script belum dipasang
(memakai salinan statis `data.json`: 403 produk tampil, tapi belum ada foto, diskon, dan login direktur).

---

## A. GitHub + Netlify (seperti biasa, hanya berkasnya lebih dari satu)

Isi repo (semua di **akar repo**, sejajar, bukan di dalam folder `web`):

```
index.html        <- halaman katalog
config.js         <- satu-satunya berkas yang Anda ubah
data.json         <- salinan produk (cadangan bila API mati)
netlify.toml      <- biar Netlify tidak bingung soal folder
assets/           <- 4 berkas logo
    logo-whm-l.png  logo-whm-d.png
    logo-prakarsa-l.png  logo-prakarsa-d.png
```

`Code.gs`, `API_HANDOFF.md`, dan `DEPLOY.md` **tidak dipakai situs**. Boleh ikut diunggah sebagai arsip, boleh juga tidak.

### Langkah
1. Ekstrak `web_catalog.zip`. Isinya ada di dalam folder `web`.
2. GitHub → **New repository** (boleh *Private*; Netlify tetap bisa membacanya).
3. Di repo baru: **Add file → Upload files**.
   Buka folder `web`, **blok semua isinya** (`index.html`, `config.js`, `data.json`, `netlify.toml`, dan folder `assets`), lalu seret ke kotak unggah.
   Yang diseret adalah **isi** folder `web`, bukan folder `web`-nya. Folder `assets` ikut terseret beserta isinya.
4. **Commit changes**.
5. Netlify → **Add new site → Import an existing project → GitHub** → pilih repo.
   Build command: **kosongkan**. Publish directory: **`.`** (sudah diatur `netlify.toml`). → **Deploy**.

Kalau terlanjur ikut terunggah foldernya sehingga jadi `web/index.html`, tidak perlu diulang:
di Netlify → Site configuration → Build & deploy → Publish directory, isi `web`.

### Link untuk customer
```
https://situs-anda.netlify.app/?c=whm          <- logo WHM, kode WHM-XXXX, WA Anda
https://situs-anda.netlify.app/?c=prakarsa     <- logo Prakarsa, kode ARK/GE, WA Prakarsa
```
Tanpa `?c=`, situs memakai WHM. Direktur juga bisa menyalin link ini lewat tombol **Bagikan ke customer**.

### Mengubah pengaturan nanti
Buka `config.js` di GitHub → ikon pensil → ubah → Commit. Netlify otomatis deploy ulang (± 1 menit).
Tidak perlu mengunggah ulang berkas lain.

---

## B. Apps Script (supaya foto, diskon, dan login direktur hidup)

1. Google Sheet master → **Ekstensi → Apps Script** → hapus isi → tempel `Code.gs` → Simpan.
2. Muat ulang Sheet; muncul menu **Katalog** di atas.
3. **Katalog → Siapkan kolom & folder foto** (setujui izin Drive).
4. **Katalog → Atur PIN direktur** — lakukan dua kali: untuk `whm` dan untuk `prakarsa`
   (isi nama direktur + PIN minimal 6 angka). PIN asli tidak tersimpan di Sheet, hanya hash-nya.
5. Isi nomor WhatsApp bisnis di tab **Perusahaan** (format `62812xxxx`).
6. **Deploy → Deployment baru → Aplikasi web**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Salin URL yang berakhiran `/exec`.
7. Di GitHub, buka `config.js` → isi `API:'https://script.google.com/macros/s/..../exec'` → Commit.

Setiap kali `Code.gs` diubah: Deploy → **Manage deployments** → Edit (pensil) → Version: **New version** → Deploy.
URL-nya tetap sama, jadi `config.js` tidak perlu diubah lagi.

---

## C. Uji singkat
1. Buka link customer → katalog tampil, tombol **Tanya produk ini** membuka WhatsApp yang benar.
2. Klik ikon orang (kanan atas) → masuk sebagai direktur → buka satu produk → unggah foto.
   Cek di Sheet: kolom **Foto ID** terisi, dan tab **Log Foto** bertambah satu baris.
3. Isi diskon 10% → simpan → harga lama tercoret dan muncul label **-10%**.
4. Klik tombol **Muat data terbaru** (ikon panah melingkar) setelah mengubah Sheet.

## Catatan
- Kalau `API` sudah diisi tapi situs tetap memakai data lama, berarti Apps Script belum di-deploy ulang,
  atau akses deployment belum **Anyone**.
- Harga item include tidak pernah dikirim ke customer kecuali direktur menyalakannya dari halaman web.
- Foto dipakai bersama kedua perusahaan. Foto lama tetap tersimpan di folder Drive.
