# 📅 aSc Timetables → Excel Converter

Aplikasi desktop **Windows** untuk mengonversi file ekspor XML dari [aSc Timetables](https://www.asctimetables.com/) menjadi file **Excel (.xlsx)** dan **PDF** dengan format yang rapi dan siap pakai. Dibangun khusus untuk kebutuhan staf kepegawaian sekolah.

## ✨ Fitur

- **Drag & Drop** file XML — cukup tarik file `.xml` dari aSc Timetables ke jendela aplikasi
- **6 Sheet Excel** lengkap:
  1. **Matriks Kelas** — Tampilan jadwal visual per kelas (Hari × Jam) dengan warna
  2. **Data Mentah** — Raw mapping seluruh relasi dari XML
  3. **Master Data Flat** — Data bersih siap Pivot Table
  4. **Master Guru** — Daftar referensi guru (ID, Kode, Nama, Gender)
  5. **Master Kelas** — Daftar referensi kelas
  6. **Master Mapel** — Daftar referensi mata pelajaran
- **Export PDF per Kelas** — Satu file PDF untuk setiap kelas, dikemas dalam ZIP
- **Export PDF per Guru** — Satu file PDF untuk setiap guru, dikemas dalam ZIP
- **Auto-Updater** — Notifikasi update otomatis saat versi baru tersedia
- **100% Offline** — Semua pemrosesan dilakukan di komputer lokal

## 📸 Screenshot

![App Screenshot](public/icon.png)

## 🚀 Download

Download installer terbaru dari halaman **[Releases](https://github.com/andangdj/asc-converter/releases)**.

## 🛠️ Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Desktop Framework | [Tauri v2](https://tauri.app/) (Rust) |
| Frontend | [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) |
| Bundler | [Vite 7](https://vitejs.dev/) |
| Styling | [TailwindCSS 4](https://tailwindcss.com/) |
| XML Parser | [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser) |
| Excel Generator | [ExcelJS](https://github.com/exceljs/exceljs) |
| PDF Generator | [jsPDF](https://github.com/parallax/jsPDF) |
| ZIP Packaging | [JSZip](https://stuk.github.io/jszip/) |

## 🧑‍💻 Development

### Prasyarat

- [Node.js](https://nodejs.org/) v20+
- [Rust](https://www.rust-lang.org/) toolchain
- [VS Code](https://code.visualstudio.com/) (opsional)

### Setup

```bash
# Clone repo
git clone git@github.com:andangdj/asc-converter.git
cd asc-converter

# Install dependencies
npm install

# Jalankan dev server
npm run tauri dev

# Build installer
npm run tauri build
```

## 📄 Format XML Input

Aplikasi membaca struktur XML dari aSc Timetables yang memiliki node:

| Node | Atribut Utama |
|------|--------------|
| `<teachers>` | `id`, `name`, `short`, `gender` |
| `<subjects>` | `id`, `name`, `short` |
| `<classes>` | `id`, `name`, `short` |
| `<daysdefs>` | `days` (binary: "10000"=Senin) |
| `<lessons>` | `subjectid`, `classids`, `teacherids` |
| `<cards>` | `lessonid`, `period`, `days` |

Root node harus `<timetable ascttversion="...">`.

## 📦 Release & Auto-Update

Build otomatis via **GitHub Actions** setiap push tag `v*`. Lihat [`.github/workflows/release.yml`](.github/workflows/release.yml).

Auto-updater menggunakan Tauri Updater dengan endpoint GitHub Releases.

## 📝 Lisensi

Proprietary — untuk penggunaan internal sekolah.

---

Dibuat dengan ❤️ untuk kemudahan administrasi sekolah.
