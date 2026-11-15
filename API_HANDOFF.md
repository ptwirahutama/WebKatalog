# API Katalog Bersama — Dokumen Serah Terima

Satu Google Sheet master → satu Apps Script Web App → dipakai (1) web katalog dua perusahaan, (2) web pembuatan penawaran.
URL API: `https://script.google.com/macros/s/XXXX/exec` (disebut `API`).

## Prinsip
- Produk, harga set, spesifikasi, dan foto **milik bersama**. Beda hanya: logo, kode produk (WHM-XXXX vs kode Prakarsa), WhatsApp, diskon.
- **Harga item include tidak pernah dikirim ke publik** kecuali perusahaan mengaktifkan "Tampil Harga Include = Ya". Menyembunyikan di tampilan bukan keamanan; server yang menahan datanya.
- PIN dan key disimpan sebagai hash SHA-256 + salt. Jangan menaruh key di kode browser.
- Web penawaran WAJIB menyalin (snapshot) nama, kode, harga ke dokumen penawaran saat dibuat. Jangan membaca live untuk penawaran lama.

## Endpoint publik (customer)
| Panggilan | Hasil |
|---|---|
| `GET API?action=ping` | `{ok:true}` |
| `GET API?action=version` | `{ok, version}` — bandingkan untuk tahu ada data baru |
| `GET API?action=catalog&c=whm\|prakarsa` | katalog siap tampil |

Bentuk `catalog`:
```
{ok, version, companies:{whm:{nama,wa,showInc}}, promos:[{judul,teks,label,s,e}],
 products:[{id,kode,whm,nama,tampil,kat,sub,varian,std,spec,qty,sat,harga,tipe,slug,nI,foto,d:{whm:{p,s,e}}}],
 includes:[{pid,grup,kode,nama,spec,qty,sat,harga(null bila disembunyikan),ket}]}
```
- Kode tampil: `c=whm` → `whm`; `c=prakarsa` → `kode`.
- Diskon: `d[co] = {p:persen, s:mulai, e:selesai}`. Harga akhir = `round(harga*(1-p/100))`, berlaku bila hari ini di antara `s` dan `e` (kosong = tanpa batas). Dipotong dari harga normal, tanpa markup.
- Foto: `foto` berisi ID file Drive → `https://drive.google.com/thumbnail?id=ID&sz=w900`.

## Endpoint direktur (POST, body JSON dikirim sebagai `text/plain` agar tanpa preflight CORS)
| action | body | hasil |
|---|---|---|
| `login` | `{company,director,pin}` | `{ok,token,company,director}` (sesi 6 jam, maks 5 percobaan/10 menit) |
| `admin_catalog` | `{token}` | produk + include **dengan harga** |
| `upload_photo` | `{token,productId,mime,data(base64)}` | `{ok,fotoId}`; ID otomatis tertulis di `Produk!Foto ID`, berkas masuk folder Drive, dicatat di tab `Log Foto` |
| `set_discount` | `{token,productId,pct,start,end}` | pct 0 = hapus. Hanya untuk perusahaan si pemilik sesi |
| `set_show_include` | `{token,value:true\|false}` | atur tab Perusahaan kolom Tampil Harga Include |
| `logout` | `{token}` | — |
Kesalahan sesi: `{ok:false,error:'sesi'}` → login ulang.

## Endpoint web penawaran (internal)
`POST API` body `{"action":"quote_catalog","app":"penawaran-whm","key":"<KEY>","c":"whm"}`
- `app` dan `key` dibuat lewat menu Sheet **Katalog → Buat key aplikasi penawaran** (key tampil sekali).
- Kolom `Tampil Harga Item` di tab Aplikasi (Ya/Tidak) menentukan apakah harga item dikirim.
- Panggil dari **server/Netlify Function** supaya key tidak terlihat browser.
- Jika penawaran menampilkan harga item ke klien: simpan pilihan "tampil harga item" **per penawaran** pada dokumen penawaran itu sendiri.

### Snapshot penawaran (disarankan)
Per baris penawaran simpan: `productId, kodeTampil, namaTampil, qty, hargaSatuan, diskonPct, hargaAkhir, itemSnapshot[]`, `perusahaan`, `tanggalSnapshot`, `versionSumber`.

## Cache & pembaruan
Setiap sunting di Sheet (atau aksi direktur) mengubah `version`. Klien memanggil `catalog` lagi (tombol "Muat data terbaru"). Cache server 10 menit per versi.

## Struktur Sheet
Produk (A–X; Kode WHM kolom V, Foto ID W), Include, Perusahaan (Kode, Nama, Direktur, PIN Hash, Salt, WhatsApp, Tampil Harga Include, Status), Diskon (Perusahaan, ID Produk, Persen, Diubah, Mulai, Selesai), Promo (Perusahaan, Judul, Teks, Label Tombol, Mulai, Selesai, Aktif), Aplikasi, Log Foto.
