# PROJECT OVERVIEW
Anda adalah AI Coding Agent (Cursor/Cline/Antigravity) yang bertugas membangun Desktop Application untuk mengonversi file ekspor XML dari aSc Timetables menjadi file Excel (.xlsx) dengan format spesifik. Aplikasi ini ditujukan untuk staf kepegawaian sekolah.

## TECH STACK & LIBRARIES
*   **Core Framework:** Tauri (Rust)
*   **Frontend:** Vite + React + TypeScript
*   **Styling:** TailwindCSS
*   **XML Parser:** `fast-xml-parser` (dieksekusi di Frontend)
*   **Excel Generator:** `exceljs` (dieksekusi di Frontend untuk styling matrix, hasilnya di-pass sebagai Buffer/Blob)
*   **File System:** `@tauri-apps/api/fs` & `@tauri-apps/api/dialog` (untuk trigger save file dialog natively di OS)
*   **Auto-Updater:** Tauri Updater (integrasi dengan GitHub Releases)

## UI/UX REQUIREMENTS
Aplikasi berjalan secara offline murni (Client-Side / Local).
1.  **Main View:** Terdapat drag-and-drop zone besar di tengah layar.
2.  **Validation:** Saat file di-drop, parsing root node XML. Tolak jika bukan `<timetable ascttversion="...">` dengan pesan error yang ramah (human-readable).
3.  **State/Progress:** Gunakan visual feedback saat proses berjalan:
    *   "Membaca File XML..."
    *   "Memproses Data & Relasi..."
    *   "Menyusun File Excel..."
    *   "Menyimpan ke Komputer..."
4.  **Save Action:** Gunakan Tauri Dialog `save()` agar user bisa memilih lokasi folder dan nama file sebelum file Excel digenerate.

## DATA PROCESSING LOGIC (aSc XML)
File XML aSc bukan struktur flat, melainkan relational database. Anda harus membuat Hash Map / Dictionary terlebih dahulu untuk efisiensi (O(1) lookup).
*   `<teachers>` -> `id`, `name`, `short`
*   `<subjects>` -> `id`, `name`, `short`
*   `<classes>` -> `id`, `name`, `short`
*   `<daysdefs>` -> Map atribut `days` (binary string seperti "10000" = Senin, "01000" = Selasa, "00100" = Rabu, "00010" = Kamis, "00001" = Jumat).
*   `<lessons>` -> Menyimpan relasi `subjectid`, `classids`, `teacherids`. (Catatan: `classids` dan `teacherids` bisa berisi multiple ID yang dipisah koma).
*   `<cards>` -> Jadwal aktual. Memiliki referensi `lessonid`, `period` (jam ke-), dan `days`.

## EXCEL OUTPUT SPECIFICATIONS (CRITICAL)
Satu file Excel (.xlsx) yang dihasilkan HARUS memiliki tepat 3 sheet dengan format yang sangat ketat di bawah ini. Gunakan `exceljs`.

### SHEET 1: "Matriks Kelas"
*   **Tujuan:** Visual matrix jadwal per kelas.
*   **Header Baris 1:**
    *   Kolom A & B: Kosong (di-merge vertikal A1:B3) dengan teks "Kelas" dan "Tipe".
    *   Kolom C dan seterusnya: Nama Hari (Senin, Selasa, Rabu, Kamis, Jumat). Setiap nama hari di-merge secara horizontal sepanjang 10 kolom (untuk 10 jam pelajaran).
*   **Header Baris 2:**
    *   Di bawah setiap Hari, isi angka Jam ke- (1, 2, 3, 4, 5, 6, 7, 8, 9, 10).
*   **Header Baris 3:**
    *   Rentang waktu (8:00 - 8:45, 9:00 - 9:45, dst) berulang di bawah setiap angka jam.
*   **Styling Header (Baris 1-3):** Background fill pattern solid warna kuning (`FFFF99`), border thin (top, left, bottom, right) di semua sel, alignment center & middle, font bold.
*   **Data Layout (Per Kelas):**
    *   Setiap kelas memakan 2 baris (contoh: baris 4 dan 5).
    *   Kolom A: Nama kelas (misal: "X Desain dan Produksi Busana 1"). Di-merge vertikal memakan 2 baris.
    *   Kolom B Baris Atas: Teks "Subject". Kolom C dst berisi Singkatan Mapel (misal: PAI, IPAS).
    *   Kolom B Baris Bawah: Teks "Teacher". Kolom C dst berisi Singkatan Guru (misal: A3, L1).
    *   Pastikan kolom pertama diperlebar agar nama kelas muat.

### SHEET 2: "Data Mentah"
*   **Tujuan:** Raw mapping relasional.
*   **Header (Baris 1):** (String persis seperti ini)
    1.  `Card_lesson`
    2.  `Card_room_id`
    3.  `Card_days_id`
    4.  `Card_period`
    5.  `Card_mapel`
    6.  `Card_mapel_short`
    7.  `Card_urut_kelas1`
    8.  `Card_teacher`
    9.  `Card_teacher_short`
    10. `Card_day_urut`
    11. `Card_day_name`
    12. `Card kelas gabung`
    13. `Card_teacher_team1`
    14. `Card_teacher_short_team1`
*   **Data Layout:** Setiap entri `<card>` dalam XML menjadi satu baris independen. Jika satu lesson memiliki banyak guru (team teaching), guru utama diekstrak ke kolom `_team1`. Tidak ada styling khusus selain header standar.

### SHEET 3: "Master Data Flat"
*   **Tujuan:** Normalized flat data untuk Pivot Table.
*   **Header (Baris 1):** (String persis seperti ini, tambahkan AutoFilter)
    1.  `Kelas` (Nama Lengkap)
    2.  `Mapel` (Nama Lengkap)
    3.  `Hari` (UPPERCASE, misal: SENIN)
    4.  `Jam` (Angka Integer)
    5.  `Guru` (Nama Lengkap beserta gelar)
    6.  `Card_day_urut` (Angka, 1 = Senin)
    7.  `Card_day_name` (Format Title Case, misal: Senin)
*   **Data Layout:** Satu baris untuk setiap sel jadwal yang terisi. Sangat bersih, tidak ada ID yang ditampilkan.

29062010
### SHEET 4: "Master Guru"
Tujuan: Daftar referensi data guru.

Header (Baris 1): ID Guru, Kode/Singkatan, Nama Lengkap, Gender

Data Layout: Parsing dari node <teachers>. Ambil atribut id, short, name, dan gender. Berikan border thin dan header bold.

### SHEET 5: "Master Kelas"
Tujuan: Daftar referensi data kelas.

Header (Baris 1): ID Kelas, Kode/Singkatan, Nama Kelas

Data Layout: Parsing dari node <classes>. Ambil atribut id, short, dan name. Berikan border thin dan header bold.

### SHEET 6: "Master Mapel"
Tujuan: Daftar referensi data mata pelajaran.

Header (Baris 1): ID Mapel, Kode/Singkatan, Nama Mapel

Data Layout: Parsing dari node <subjects>. Ambil atribut id, short, dan name. Berikan border thin dan header bold.


## TUGAS ANDA (AI AGENT)
1. Setup project Tauri (Rust) + Vite (React/TS).
2. Buat UI dasar sesuai requirements.
3. Tulis logic parser dan mapping data dari aSc XML.
4. Implementasikan pembuat Excel menggunakan `exceljs` sesuai 3 format Sheet di atas.
5. Konfigurasi CI/CD untuk Tauri auto-updater via GitHub releases.
