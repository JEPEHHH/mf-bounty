# Rencana Kerja — bounty-entrants-02

Target: meluncurkan bounty berbayar (entry fee >= $0.50) milik sendiri melalui sponsor flow make.fun, memaksimalkan paying entrants sebelum deadline, dan mengirimkan entri lengkap sesuai aturan.

## Tahapan Kerja
1. **Inisialisasi Repo & Identitas**: Siapkan berkas root dari `starter/` (`main.ts`, `LICENSE`, `BOUNTY.json`), `.makefun/owner.json`, dan commit awal.
2. **Cek Sponsor Terms**: Baca batas terkini dari `GET /api/sponsor/terms` (`min_pot_fee_multiple`, `max_open`, `max_per_day`, `auto_list_lead_minutes`, `self_setup_lead_minutes`, `max_run_hours`).
3. **Desain & Peluncuran Bounty**:
   - Gunakan opsi `auto_list` atau `setup: 'self'` dari `POST /api/sponsor/suggestions` agar tayang cepat tanpa antrean review panjang.
   - Tetapkan entry fee >= $0.50 (tetap menarik dan mematuhi rasio pot/fee) serta jadwal buka di dalam window kompetisi.
   - Danai deposit sponsor dan pantau hingga berstatus approved & public; atur ritme sesuai batas `max_open` dan `max_per_day`.
4. **Akuisisi Paying Entrants (Organik)**:
   - Promosikan bounty secara organik (postingan komunitas, media sosial, pesan, iklan berbasis reach — dilarang bayar/refund per entri).
   - Pantau jumlah paying entrants secara berkala dan pastikan semua bounty tetap live hingga hasil diumumkan.
5. **Konfigurasi Entri & Uji Lokal**:
   - Isi `BOUNTY.json` dengan seluruh URL bounty public milik sendiri (`https://make.fun/bounty/<slug>`).
   - Uji `main.ts` secara lokal (`MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts`) untuk memverifikasi salinan `BOUNTY.json`.
6. **Validasi, Bundling & Submit**:
   - Commit tiap milestone, siapkan `transcripts.tar.gz` dan bundle entri.
   - Jalankan pre-submit check (`node cli/makefun.mjs check --kit . --repo . --transcripts transcripts.tar.gz`).
   - Lengkapi deliverable (`repo_url`, `commit_sha`, `title`, `entry_message`, `entry_signature`) dan submit ulang bila ada bounty baru sebelum deadline.

## Daftar Berkas yang Akan Dibuat
- `PLAN.md` — Rencana kerja dan daftar berkas (berkas ini).
- `main.ts` — Program Node.js untuk menyalin `BOUNTY.json` ke `/output/BOUNTY.json`.
- `BOUNTY.json` — Daftar URL bounty milik sendiri yang sudah public di make.fun.
- `LICENSE` — Lisensi repositori (MIT, mengacu pada `starter/LICENSE`).
- `.makefun/owner.json` — Metadata kepemilikan akun/entri make.fun.
- `README.md` — Dokumentasi ringkas entri, daftar bounty, dan cara uji lokal.
- `transcripts.tar.gz` — Arsip transkrip sesi pengerjaan untuk validasi dan submit.
