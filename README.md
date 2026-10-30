<div align="center">

# ZCode Proxy

**Paket coding GLM-mu, bisa dipakai semua AI coding tool.**

ZCode Proxy adalah program kecil yang jalan di komputermu sendiri. Paket coding Z.AI dari Zhipu (paket personal / paket trial) normalnya cuma bisa dipakai di dalam aplikasi resminya. ZCode Proxy mengubahnya jadi API standar OpenAI / Anthropic di mesinmu sendiri, jadi Claude Code, Codex, Silly Tavern, dan kawan-kawannya dapat langsung memakai kuotamu.

[Mulai cepat](#-mulai-dalam-satu-menit) · [Sambungkan coding tool](#-sambungkan-coding-tool) · [Pertanyaan umum](#pertanyaan-umum)

</div>

---

## Apa yang bisa dibantu

- 🧩 **Satu alamat, tiga format** - API OpenAI, Anthropic, dan Responses (khusus Codex) semuanya tersedia di `127.0.0.1:8080` di mesinmu. Tool-mu butuh format yang mana, tinggal pakai yang itu.
- 🖥️ **Panel visual bawaan** - Jalankan dari terminal dan panelnya langsung kebuka (bisa juga jalan diam-diam di background). Start, login, dan baca log cukup dengan menekan tombol.
- 💬 **Halaman chat bawaan** - Buka `/webui` dan ada halaman chat ala ChatGPT yang jalan lokal, enak untuk mengetes model secara cepat.
- 🌙 **Jalur off-peak & auto-claim paket** (opsional) - Saluran kuota gratis di jam sepi plus pengambilan otomatis paket trial yang jumlahnya terbatas, semuanya sudah built-in.
- 🔌 **Satu endpoint agregat MCP** - MCP plugin resmi ZCode (Tianyancha / Wind / iFinD Tonghuashun, dan lain-lain, total 134+ tool) digabung di balik **satu** endpoint `/mcp` (streamable HTTP, nama tool memakai namespace `{plugin}__{tool}` - jadi klien cukup dikonfigurasi ke satu MCP server saja; butuh login coding-plan, daftarnya dapat dilihat lewat `GET /mcp` di browser); halaman chat bawaan juga dapat dipasangi MCP server milikmu sendiri untuk dipakai model sebagai tool.
- 🪟 **Lintas platform** - Windows / macOS / Linux jalan dari satu codebase yang sama, dapat juga dicompile jadi satu file executable atau di-deploy pakai Docker.

## 🔀 Bedanya dengan versi asli

Fork ini berbasis [TriDefender/zcode-api](https://github.com/TriDefender/zcode-api) tapi dipangkas untuk satu alur: clone, install, jalan.

- **Tanpa aplikasi Android.** Seluruh kode mobile (folder Android-APP, subcommand `android`, build APK) dihapus. Control protocol yang dipakai panel web dipindah ke `src/server/control.ts` dan tetap jalan.
- **Satu provider: Z.AI.** Pilihan bigmodel, login paste, dan auth-code flow dihapus. Login selalu lewat poll OAuth Z.AI.
- **Sekali jalan langsung pakai.** `bun run start` saat belum login otomatis membuka login Z.AI dulu, lalu masuk TUI dan proxy ikut nyala sendiri.
- **Ada kartu Connect Guide di TUI** (tombol <kbd>h</kbd>). Isinya base URL, API key, daftar model, dan contoh env untuk disambungkan ke tool lain.
- **Dokumentasi Bahasa Indonesia.**

## 🚀 Mulai dalam satu menit

### Langkah 1: unduh exe terbaru dari [GitHub Releases](https://github.com/TriDefender/zcode-api/releases)

Iya, sudah itu saja. Memang sesederhana itu.

Jalankan dari source juga sama gampangnya (saat pertama kali jalan, login Z.AI otomatis kebuka dulu, habis itu langsung masuk panel):

```bash
git clone https://github.com/yayayapluto/zcode-api.git && cd zcode-api
bun install
bun run start
```

Setelah jalan, panel kontrol terminal akan kebuka (ini layar utamanya):

<img src="docs/images/tui-annotated.png" alt="Panel kontrol terminal ZCode Proxy" width="980" />

Panelnya berisi kartu-kartu: **Settings & Login** (paket / login), **Proxy Server** (start/stop plus tombol Guide), **Connect Guide** (tekan <kbd>h</kbd> untuk melihat cara menyambungkan aplikasi lain), **Quota** (bar sisa kuota + hitung mundur reset, tekan <kbd>r</kbd> atau klik Refresh), dan **Logs** (satu baris per request, jalan live). Tekan <kbd>s</kbd> untuk menyalakan proxy, kalau sudah muncul `Status: running` berarti sudah siap.

> Tidak terbiasa dengan shortcut keyboard? Tombol-tombol di panel dapat **diklik pakai mouse**. Mau jalan diam-diam di background? `zcode-proxy.exe --cli serve`.

### Shortcut panel

| Tombol | Fungsi |
|------|------|
| <kbd>s</kbd> | Menyalakan / mematikan proxy |
| <kbd>l</kbd> | Login (browser kebuka untuk otorisasi) |
| <kbd>o</kbd> | Logout |
| <kbd>h</kbd> | Membuka / menutup panduan koneksi (cara menyambungkan tool lain) |
| <kbd>t</kbd> | Ganti paket (coding-plan ↔ start-plan) |
| <kbd>r</kbd> | Refresh angka kuota |
| <kbd>u</kbd> | Cek versi baru secara manual (notifikasi update) |
| <kbd>↑</kbd><kbd>↓</kbd> / <kbd>PgUp</kbd> / <kbd>g</kbd> | Scroll log / lompat ke bawah |
| <kbd>c</kbd> | Bersihkan layar log |
| <kbd>q</kbd> | Keluar dari panel |

## 🔌 Sambungkan coding tool

Begitu proxy nyala, alamatnya adalah **`http://127.0.0.1:8080`**. Tool-mu cuma perlu diubah dua hal: **alamat interface** dan **nama model**.

Soal "API Key": kalau kamu pernah mengisi `auth.proxyApiKey` di konfigurasi (atau environment variable `ZCODE_PROXY_API_KEY`), isi di tool dengan nilai yang sama. Kalau tidak diisi, tulis bebas saja (misalnya `sk-1234`). Untuk pemakaian lokal sendiri tidak dicek.

<details>
<summary><b>Claude Code</b> (klik untuk melihat konfigurasinya)</summary>

```bash
# macOS / Linux
export ANTHROPIC_BASE_URL=http://127.0.0.1:8080
export ANTHROPIC_AUTH_TOKEN=sk-1234
export ANTHROPIC_MODEL=glm-5.3
claude
```

```powershell
# Windows PowerShell
$env:ANTHROPIC_BASE_URL = "http://127.0.0.1:8080"
$env:ANTHROPIC_AUTH_TOKEN = "sk-1234"
$env:ANTHROPIC_MODEL = "glm-5.3"
claude
```

</details>

<details>
<summary><b>Codex CLI</b> (lewat interface Responses)</summary>

Edit `~/.codex/config.toml`:

```toml
model_provider = "zcode"
model = "glm-5.3"

[model_providers.zcode]
name = "ZCode Proxy"
base_url = "http://127.0.0.1:8080/v1"
wire_api = "responses"
env_key = "ZCODE_API_KEY"   # isi sembarang nilai non-kosong, kecuali kamu menyetel proxy key
```

</details>

<details>
<summary><b>Tool lain yang kompatibel OpenAI</b> (Cherry Studio, Kilo Code, Cline, LobeChat, …)</summary>

Di bagian "custom provider" tool tersebut, isi:

| Pengaturan | Nilai |
|--------|-----|
| Alamat API (Base URL) | `http://127.0.0.1:8080/v1` |
| API Key | Proxy key milikmu (kalau tidak disetel, isi bebas) |
| Model | `glm-5.3`, `glm-5.3-flash`, lihat tabel model di bawah |

Untuk tool berformat Anthropic (misalnya sebagian klien Claude), alamatnya cukup `http://127.0.0.1:8080`, path `/v1/messages` nanti disambungkan otomatis oleh proxy.

</details>

Mau coba manual dulu? Buka **http://127.0.0.1:8080/webui** dan halaman chat bawaannya langsung ada; atau pakai curl:

```bash
curl http://127.0.0.1:8080/v1/chat/completions -H "Content-Type: application/json" -d '{
  "model": "glm-5.3-flash",
  "messages": [{"role": "user", "content": "Halo!"}]
}'
```

<details>
<summary><b>Deploy pakai Docker</b></summary>

```bash
# Login di host dengan encryption seed yang tetap (tanpa callback lokal:
# linknya buka di perangkat mana saja, loginnya kelar sendiri)
ZCODE_PROXY_CREDENTIAL_SECRET="frasa-rahasia-yang-cuma-kamu-tahu" \
  bun run src/index.ts auth login zai

docker run -d --name zcode-proxy -p 8080:8080 \
  -v "$(pwd)/config.yaml:/data/config.yaml:ro" \
  -v "$(HOME)/.zcode-proxy/credentials.json:/home/bun/.zcode-proxy/credentials.json:ro" \
  -e ZCODE_PROXY_CREDENTIAL_SECRET="frasa-rahasia-yang-cuma-kamu-tahu" \
  ghcr.io/tridefender/zcode-proxy:latest
```

Image-nya multi-arch (amd64 / arm64) dan jalan sebagai user `bun`. Lapisan runtime hasil multi-stage build cuma membawa application bundle dan captcha worker, tanpa `node_modules`, source, test, maupun build tool tambahan, dan fungsinya tetap penuh. Contoh compose:

```yaml
services:
  zcode-proxy:
    image: ghcr.io/tridefender/zcode-proxy:latest
    ports: ["8080:8080"]
    volumes:
      - ./config.yaml:/data/config.yaml:ro
      - ./credentials.json:/home/bun/.zcode-proxy/credentials.json:ro
    environment:
      ZCODE_PROXY_CREDENTIAL_SECRET: "frasa-rahasia-yang-cuma-kamu-tahu"
    restart: unless-stopped
```

</details>

<details>
<summary><b>Konfigurasi dan environment variable yang dapat diubah</b> (tidak diubah pun tetap jalan)</summary>

File konfigurasinya adalah `config.yaml` di root proyek (dibuat otomatis saat pertama jalan, komentar lengkapnya lihat [`config.example.yaml`](config.example.yaml)), dan environment variable menang atas file. Yang sering dipakai:

| Environment variable | Default | Keterangan |
|----------|------|------|
| `ZCODE_PROXY_PORT` | `8080` | Port yang di-listen |
| `ZCODE_PROXY_API_KEY` | kosong | Kunci akses klien ke proxy (tidak disetel = tanpa cek) |
| `ZCODE_PROVIDER` | `zai` | Provider (terkunci ke `zai`) |
| `ZCODE_PROXY_CONFIG` | `config.yaml` | Path file konfigurasi |
| `ZCODE_PROXY_CREDENTIAL_SECRET` | turunan mesin | Seed enkripsi kredensial login (wajib dipatok kalau pindah mesin / Docker) |
| `ZCODE_LOG_FORMAT` | tabel desktop | Isi `compact` untuk log satu baris (enak di layar sempit) |
| `ZCODE_PANEL_ENABLED` | mati | Isi `1`/`true` supaya mode `serve` yang tanpa UI (termasuk Docker) ikut menyalakan panel web lokal |
| `ZCODE_PANEL_TOKEN` | kosong | Token akses panel, **wajib diisi saat panel dinyalakan** (tanpa ini panel tidak start, jadi tidak ada interface kontrol yang telanjang) |
| `ZCODE_PANEL_PORT` | `8090` | Port panel |
| `ZCODE_PANEL_HOST` | `127.0.0.1` | Alamat listen panel. Di jaringan Docker bridge, `-p` tidak dapat menjangkau loopback container, jadi dapat diisi `0.0.0.0`; kalau begitu **tokennya wajib kuat dan portnya jangan dibuka ke publik** |
| `ZCODE_UPDATE_CHECK` | nyala | Isi `off`/`0` untuk mematikan cek "ada versi baru" saat start (cuma notifikasi, tidak auto-update) |
| `ZCODE_UPDATE_SKIP` | kosong | Daftar versi yang diabaikan, pisahkan koma, misalnya `v4.7.6,v4.7.7` |

Tipe paket (`plan`: `coding-plan` paket personal / `start-plan` paket trial) diganti lewat panel dengan menekan <kbd>t</kbd>, nanti ditulis balik ke config.yaml.

Untuk mesin tanpa TUI (server cloud), browser dapat dipakai sebagai gantinya. Set `ZCODE_PANEL_ENABLED=1` dan `ZCODE_PANEL_TOKEN=<string acak bikinanmu sendiri>`, nyalakan proxy, teruskan portnya, lalu buka `http://127.0.0.1:8090`. Di sana dapat dilihat status dan kuota, ganti paket, login/logout, membaca log live dan daftar MCP. Panel default cuma bind loopback (`ZCODE_PANEL_HOST` dapat mengubah alamat bind, lihat bawah) dan setiap panggilan API wajib membawa token. Tanpa token panel tidak start. Perintahnya di-dispatch di dalam proses, jadi tidak ada control port tambahan yang kebuka. "Stop proxy" dari halaman panel cuma menghentikan proxy, prosesnya sendiri tetap dapat keluar normal. SIGTERM/SIGINT maupun shutdown dari panel sama-sama membersihkan timer background (auto-claim, captcha pool) dulu baru keluar. Logout dari panel juga ikut membersihkan kredensial yang sedang live dan menghentikan proxy, jadi request baru tidak lagi memakai kuota akun lama yang sudah logout.

**Notifikasi versi baru**: `serve` dan TUI waktu start menanyakan latest release ke GitHub secara async, paling banter nambah satu baris log (di TUI tekan <kbd>u</kbd> untuk cek manual), tidak menghambat start maupun proxy; kalau offline, diblokir, kena rate limit, atau format balasannya berubah, semuanya diabaikan diam-diam. Cek manual selalu menjawab tegas ("sudah versi terbaru" atau "cek tidak tersedia"). Di dalam container image sifatnya immutable, jadi yang ditampilkan adalah **perintah pull sesuai runtime yang terdeteksi** (Docker: `docker compose pull && docker compose up -d`, Podman: `podman compose pull && podman compose up -d`; kalau runtime tidak dikenali ya cuma disuruh "pull image baru lalu recreate container"), bukan mengganti file sendiri (release saat ini juga belum punya checksum, jadi tidak ada unduh-ganti otomatis). Tidak mau dicek sama sekali, set `ZCODE_UPDATE_CHECK=off`; kalau ada versi yang berisik, abaikan lewat `ZCODE_UPDATE_SKIP=v4.7.6`.

**Cara menyambungkan panel di dalam Docker**: panel default cuma listen di `127.0.0.1` **milik container sendiri**, jadi di jaringan bridge default, mapping `-p 8080:8080` tidak tembus, dan sekadar nambah `-p 8090:8090` juga tidak konek (port di-map ke alamat non-loopback container). Ada dua jalan: ① tambah `ZCODE_PANEL_HOST=0.0.0.0` di environment plus `-p 8090:8090` - panel langsung bind ke semua interface container, tokennya wajib kuat dan 8090 hanya dibuka ke sumber yang memang butuh; ② di server Linux pakai host network supaya container langsung memakai loopback host:

```yaml
services:
  zcode-proxy:
    # pertahankan image / volumes / restart yang sudah ada
    network_mode: host        # mode host: hapus bagian ports: yang lama
    environment:
      ZCODE_PROXY_CREDENTIAL_SECRET: "frasa-rahasia-yang-cuma-kamu-tahu"
      ZCODE_PANEL_ENABLED: "1"
      ZCODE_PANEL_TOKEN: "${ZCODE_PANEL_TOKEN:?isi dulu panel token di .env}"
      ZCODE_PANEL_PORT: "8090"
```

Terus bikin satu tunnel terus-menerus di mesin sendiri (`-N` tanpa buka shell):

```bash
ssh -N -L 8090:127.0.0.1:8090 user@host
```

Lalu buka `http://127.0.0.1:8090`. Di mode host network, port utama proxy juga langsung memakai port host, jadi aturan security group/firewall untuk 8080 tetap seperti semula, dan 8090 **jangan** dibuka keluar.

</details>

<details>
<summary><b>Fitur lanjutan: jalur off-peak & auto-claim paket</b></summary>

**Jalur off-peak (`/async/*`)** - saluran komputasi gratis yang dibuka official di jam sepi seperti dini hari. Request antre ambil tiket dulu, giliran tiba langsung diteruskan ke model (cocok untuk batch job yang tidak buru-buru). Nyalakan lewat `async.enabled: true` di `config.yaml`; ingat sifatnya sekali tembak tanpa memori sesi, jadi percakapan multi-turn wajib membawa riwayat di dalam request.

**Auto-claim paket weekend/trial** - default nyala. Proxy mengecek halaman event paket terbatas dari official tiap 5 menit, begitu ada yang baru langsung diambilkan otomatis (`claim.enabled: false` untuk mematikan). Ambil manual: `bun run src/index.ts claim`.

**Tampilan kuota** - sehabis login panel otomatis mengambil kuota sekali, habis itu refresh manual dengan <kbd>r</kbd>. Datanya dari dua bidang kuota upstream: bucket kredit paket trial/poin (`billing/balance`, sisa / total plus waktu kedaluwarsa), dan jendela pemakaian paket coding personal (`/api/monitor/usage/quota/limit`, sumbernya sama dengan panel pemakaian resmi, **sisa kuota** dan waktu reset jendela 5 jam / mingguan - kolom `number` dari upstream bukan total yang sebanding dengan sisa, jadi CLI/TUI konsisten hanya menampilkan sisa, dan bar proporsi cuma digambar kalau upstream memberi persentase). Cek langsung dari command line: `bun run src/index.ts quota` (padanan HTTP-nya `GET /quota`). Karena gateway upstream membatasi query yang terlalu sering, panel tidak melakukan polling terjadwal.

</details>

## 🧮 Model yang tersedia

Daftar ini cuma untuk pajangan:

| Model | Konteks | Output maks |
|------|--------|----------|
| `glm-5.3` | 1M | 128K |
| `glm-5.3-flash` (vision) | 1M | 128K |

## ❓ Pertanyaan umum

**Kuota satu akun habis di tengah jalan, gimana?**
Login saja akun kedua (ketiga, dst): `bun run src/index.ts auth login zai` bisa diulang untuk akun berbeda. Kalau satu akun kehabisan kuota, proxy otomatis meneruskan request ke akun berikutnya yang masih ada kuotanya — tanpa jeda, tanpa setting. Cek daftar akun: `auth status`. Pindah manual akun aktif: `auth switch <id|n>` atau tombol `a` di TUI. Keluar dari satu akun: `auth logout [id]` (tanpa argumen = akun aktif).

**Start langsung keluar, pesannya Not logged in?**
Login dulu: `bun run src/index.ts auth login zai`. Sekali login cukup, kredensialnya disimpan terenkripsi.

**Port 8080 dipakai aplikasi lain?**
Ganti lewat environment: `ZCODE_PROXY_PORT=8081 bun run src/index.ts`, atau ubah `server.port` di `config.yaml`.

**Tool tidak konek-konek / 401?**
Kalau kamu pernah menyetel `ZCODE_PROXY_API_KEY`, tool wajib diisi nilai yang sama; kalau tidak disetel ya tanpa password. Perhatikan, begitu kunci dinyalakan maka **semua route** kecuali `/webui` (termasuk `/health`) wajib membawa kunci.

**Ganti komputer / install ulang, wajib login lagi?**
Iya. Kredensial dienkripsi terikat info mesin. Untuk pindah mesin, set `ZCODE_PROXY_CREDENTIAL_SECRET` yang sama di kedua sisi, lalu login ulang atau salin `~/.zcode-proxy/credentials.json`.

**Server tidak ada browser, loginnya bagaimana?**
Login langsung saja: `bun run src/index.ts auth login zai`. Link login dibuka di browser perangkat mana pun bisa, begitu otorisasi selesai sisi lokal kelar sendiri (tanpa halaman callback).

**Sebenarnya di background dia ngapain?**
Dia "penerjemah + kurir". Request standar dari tool-mu diterjemahkan jadi request yang sama persis dengan aplikasi resmi, lalu diteruskan ke atas. Balasannya diterjemahkan balik apa adanya. Seluruh trafik hanya antara mesinmu dan server resmi, tidak lewat pihak ketiga mana pun.

## 🛠️ Ikut mengembangkan

```bash
bun test            # jalankan test
bun x tsc --noEmit  # cek tipe
bun run dev         # panel mode development
```

Arsitektur dan detail implementasi ada di komentar tiap file source di bawah [`src/`](src/).

## Privacy

Proxy ini jalan sepenuhnya lokal: **tanpa telemetri, tanpa analitik, tanpa laporan keluar dalam bentuk apa pun**. Data pemakaian, info perangkat, dan konfigurasimu tidak keluar dari mesin; log debug/dump otomatis menyamarkan API key, JWT, dan proxy key.

## License

Copyright (c) 2026 TriDefender and the ZCode Proxy contributors.

Proyek ini memakai **[CC BY-NC-SA 4.0 (Atribusi-NonKomersial-BerbagiSerupa 4.0 Internasional)](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.id)**. [LICENSE](LICENSE) memuat naskah resmi yang belum diubah; bagian awal file adalah pernyataan hak cipta dan lisensi proyek.

- **Nonkomersial**: boleh disalin, dibagikan, dan diadaptasi gratis selama patuh lisensi; tidak boleh dipakai untuk kegiatan yang tujuan utamanya keuntungan komersial atau imbalan uang.
- **Atribusi dan pertahankan pernyataan**: saat membagikan karya asli atau adaptasi, wajib mencantumkan atribusi penulis, pernyataan hak cipta dan lisensi yang diberikan, plus tautan lisensi dan keterangan perubahan, sesuai tuntutan lisensi.
- **BerbagiSerupa**: saat membagikan karya adaptasi ke publik, wajib memakai lisensi yang sama atau kompatibel. Tidak boleh menambah ketentuan hukum atau cara teknis yang membatasi hak dalam lisensi.

**Batas berlakunya**: CC BY-NC-SA 4.0 tidak mewajibkan penyediaan source code. Ia juga tidak dapat menjamin larangan closed-source secara ketat, dan tidak menuntut layanan jaringan membuka source yang bersesuaian; proyek ini tidak menambah batasan kustom semacam itu. CC resmi [tidak menganjurkan lisensi CC untuk software](https://creativecommons.org/faq/#can-i-apply-a-creative-commons-license-to-software), dan proyek ini memilihnya karena syarat nonkomersial, atribusi, dan berbagi-serupanya. Output tool independen yang tidak memuat konten berlisensi proyek tidak otomatis ikut lisensi ini hanya karena memakai proyek.

Komponen pihak ketiga tetap ikut lisensinya masing-masing. Lisensi ini hanya mencakup konten yang memang berhak dilisensikan pemegang hak dengan syarat tersebut; lisensi MIT yang diperoleh sebelumnya secara sah tidak dicabut surut. Ringkasan ini sekadar ikhtisar, syarat lengkapnya ikut [LICENSE](LICENSE) dan [teks hukum resmi](https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode.id).

## Protokol dan catatan pemeliharaan

Search tool Responses hosted tidak dieksekusi di sisi server.
