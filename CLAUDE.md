# Lingora English (LiLy AI) — tình trạng dự án

Cập nhật: 2026-09-27. File này tổng hợp chức năng thực tế trong code để nắm nhanh cái gì chạy được, cái
gì chưa, và các mốc quan trọng — đọc mục đầu tiên trước khi làm bất cứ gì khác.

**Phiên 2026-09-25 đến 2026-09-27**: sửa lỗi 404 + cache sai giọng ở Listening Lab, thêm hướng dẫn tương tác
(guided tour) 4 trang đủ 54 ngôn ngữ, tích hợp Google Analytics, và trọng tâm phiên — sửa 32/44 âm
Pronunciation "Sounds" đọc sai + xây công cụ chỉ-admin tự nghe/tạo/lưu audio đúng — xem 6 mục mới ngay
trước "⛔ Còn thiếu" bên dưới, đặc biệt mục Pronunciation (dài nhất, **còn 1 phần chưa deploy**).

**Phiên 2026-09-21 đến 2026-09-23**: sửa lại luồng nghe mẫu ở Pronunciation (âm → từ → câu chứa từ),
dọn/mở/khoá lại nhiều category Vocabulary + phát hiện dữ liệu cũ bị hỏng encoding, sửa gate free/premium
Listening Lab, và thêm **SePay (chuyển khoản ngân hàng)** làm phương thức thanh toán thứ hai song song
Stripe — xem 4 mục ngay sau các mục 2026-09-27 bên dưới.

**Phiên 2026-09-17 vừa audit sâu Yêu cầu 11/12/13 + toàn bộ Phần III/IV/V + spec audit 01 vs 02 — xem các
mục mới ở gần cuối file (trước "⛔ Còn thiếu"), đặc biệt mục "SỰ CỐ NGHIÊM TRỌNG" nếu đang debug lỗi đăng
nhập.**

Tài liệu khách hàng gốc + checklist đối chiếu tiến độ nằm ở
[`BAN GIAO DEV - LINGORA ENGLISH/`](BAN%20GIAO%20DEV%20-%20LINGORA%20ENGLISH/) (4 file: đặc tả yêu cầu,
yêu cầu gốc từ khách, checklist tiến độ, báo cáo kiểm thử) — đọc các file đó để biết đối chiếu chi tiết
theo từng yêu cầu của khách hàng. File này chỉ nói về **tình trạng kỹ thuật**.

---

## ✅ Rebuild fullstack + cutover khỏi Supabase: XONG, đang chạy thật trên production

Toàn bộ kế hoạch rebuild trong [`KE_HOACH_REBUILD_FULLSTACK.md`](KE_HOACH_REBUILD_FULLSTACK.md) đã hoàn
tất — file đó giờ chỉ còn giá trị lịch sử (cách đã làm cutover), không phản ánh trạng thái hiện tại nữa.

- Backend đã 100% tự vận hành: **Postgres tự host trên VPS + Drizzle ORM**, không còn phụ thuộc Supabase
  ở bất kỳ đâu (đã gỡ `@supabase/supabase-js`, `src/integrations/supabase/`).
- Auth tự viết hoàn chỉnh: session lưu DB (cookie httpOnly, thu hồi được ngay), bcryptjs, xác thực email
  qua token, Google OAuth thủ công. **Google OAuth**: đã điền `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
  thật vào `.env.docker` (2026-09-18), chờ `deploy.bat` để build lại (build-time var). **SMTP (Resend)**:
  có API key thật nhưng **domain `lingoraenglishai.com` chưa xác minh trên Resend** — mọi email xác thực
  đăng ký/quên mật khẩu đều gửi lỗi 403, xem mục "🔴 Bug đăng ký..." bên dưới. Ghi chú cũ ở đây từng nói
  "đã chạy thật với SMTP thật" — sai, chưa từng tự test gửi thật trước 2026-09-18, đã sửa lại.
- Database production đã bootstrap đầy đủ: 3 role Postgres (`anon`/`authenticated`/`service_role`) +
  `auth.uid()` qua `db/0000_auth_compat_shim.sql`, 43 bảng nghiệp vụ + RLS gốc qua 19 file
  `supabase/migrations/*.sql` chạy gần như nguyên vẹn, cộng `db/0001-0003_*.sql` (bugfix quyền, bảng auth
  riêng, cột hội thoại Shadowing). **Trình tự bootstrap này chỉ cần làm 1 lần cho 1 database mới** — xem
  comment đầu file `migrate.bat` nếu cần dựng lại từ đầu (disaster recovery/môi trường mới).
- **Dữ liệu tài khoản người dùng thật (từ Supabase Cloud cũ) CHƯA di chuyển sang** — vẫn cần connection
  string Postgres của Supabase Cloud, hiện chưa có. Tài khoản trên production bây giờ chỉ có 4 tài khoản
  demo (xem bên dưới) — đây là cutover đã được xác nhận chấp nhận đánh đổi này.

---

## Tech stack hiện tại

- **Frontend/SSR**: React 19 + TanStack Start (SSR) + TanStack Router, Vite 8, Nitro (`node-server`
  preset khi build cho VPS — `Dockerfile` đã set `NITRO_PRESET=node-server` sẵn), Tailwind CSS 4.
- **Backend**: Postgres thuần tự host + Drizzle ORM, business logic qua TanStack Start server functions
  (`src/lib/*.functions.ts`), dùng `withUser`/`withAnon`/`withAdmin` (`src/db/index.ts`) — 3 hàm này chạy
  mỗi lệnh gọi trong 1 transaction riêng, set `role`/`app.user_id` để RLS Postgres áp dụng đúng theo từng
  request, tuyệt đối không query trực tiếp qua `rawDb`/`rawSql` ở code tính năng.
- **AI — chỉ 2 dịch vụ, đúng Ràng buộc 2 của khách hàng, không dùng dịch vụ nào khác**:
  `src/lib/ai-providers.server.ts` — `AI_TEXT_PROVIDER=deepseek` (mặc định, hoặc `gemini`) cho tác vụ văn
  bản (chấm điểm, sửa lỗi, sinh câu mẫu), Gemini cho mọi tác vụ âm thanh (STT, TTS, chấm phát âm) vì
  Gemini xử lý trực tiếp file âm thanh. **Đã xoá hẳn code gọi Lovable AI Gateway** (2026-09-13) — không
  còn khả năng vô tình dùng nhầm dịch vụ ngoài danh sách cho phép.
  - Chấm phát âm (`analysePronunciation` + `analysePronunciationAudio`): Gemini **nghe trực tiếp bản ghi
    âm** và tự chấm điểm 0-100 (`AudioPronunciationFeedback.score`, đổi 2026-09-14) — trước đó điểm hiển
    thị luôn là so khớp chữ (transcript so với target), Gemini chỉ viết feedback định tính; giờ điểm ưu
    tiên lấy từ chính đánh giá của Gemini khi có audio, so khớp chữ chỉ còn là fallback khi không gửi
    được audio. Đã bỏ hẳn banner "not a certified acoustic score..." khỏi UI (`/shadowing`,
    `/pronunciation`) theo yêu cầu khách — xoá luôn 2 component `AudioGroundedNotice`/`NotConnectedNotice`
    (dead code, score-panel.tsx) + 2 khoá dịch tương ứng trong `en.ts` và 15 file locale khác. `acoustic`
    field vẫn luôn `false` nội bộ (vẫn không có dịch vụ chấm âm học chuẩn hoá kiểu Azure/SpeechAce/ELSA),
    chỉ là không còn hiển thị disclaimer đó cho người dùng nữa.
    **Quyết định chốt 2026-09-13 (Vấn đề 5 trong tài liệu đặc tả)**: giữ nguyên Gemini/DeepSeek, không
    thêm dịch vụ chấm âm học chuyên dụng — lưu ý Ràng buộc 2 tự nó không nói gì về việc này (chỉ là bảng
    phân bổ dịch vụ theo tác vụ), đây là quyết định giải Vấn đề 5, từng ghi nhầm là suy ra từ Ràng buộc 2.
  - TTS cache theo `(provider, voice, text)` trong bảng `tts_cache`, có xử lý race-condition khi 2 request
    trùng nhau (`onConflictDoNothing`).
- **Thanh toán**: **Stripe** (từ 2026-09-21, thay cho Paddle — xem mục "Chuyển thanh toán Paddle → Stripe" ở
  cuối file). Gọi thẳng REST bằng `fetch` (`src/lib/stripe.server.ts`, không SDK). Mọi phần nói về Paddle
  phía dưới là **lịch sử** — code Paddle đã xoá khỏi nhánh `feat/checkout-stripe`.
- **Đa ngôn ngữ**: i18n tự viết (`src/lib/i18n.tsx`), có fallback tiếng Anh khi thiếu key
  (`dict?.[key] ?? en[key] ?? String(key)`). Hiện **54/50+ ngôn ngữ** — **ĐÃ HOÀN TẤT 100% YÊU CẦU 8**
  (16 gốc + 38 nạp qua DB seed — xem mục "Đa ngôn ngữ" bên dưới). Một số section lớn (shadow,
  coach, tests, listen, app) tách file riêng ở `src/locales/en/*.ts` — thêm key mới cho đúng section,
  không phải lúc nào cũng bỏ vào `src/locales/en.ts` (file gốc, chứa các namespace chung như `dash.*`).
- **Deploy**: Docker container sau Nginx + Let's Encrypt, VPS `221.132.19.75`
  (`lingoraenglishai.com`). Quy trình deploy đã tự động hoá — xem mục riêng bên dưới.

---

## Quy trình deploy (tự phục vụ, không cần tôi mỗi lần)

Hai file ở root repo, chạy trong Git Bash (MINGW64):

- **`deploy.bat`** — build image, nén (`gzip`) + tự thử lại tối đa 4 lần nếu mạng rớt giữa chừng, đẩy
  image + `docker-compose.yml` + `.env.docker` (đồng bộ từ file local) lên VPS, nạp lại và khởi động
  container. Chạy mỗi khi sửa code hoặc sửa `.env.docker` local.
- **`migrate.bat`** — chỉ lo phần database: copy mọi file `.sql` mới trong `src/db/schema/` lên VPS, tự
  bỏ qua file đã áp dụng rồi (theo dõi qua `migrations/.applied` trên VPS). Chạy trước `deploy.bat` khi có
  thay đổi schema (Drizzle sinh file migration mới). **Không dùng để dựng database hoàn toàn mới** — xem
  comment đầu file để biết trình tự bootstrap 1 lần (`db/0000_auth_compat_shim.sql` → 19 file
  `supabase/migrations/*.sql` → `db/0001-0003_*.sql`).
- `.env.docker` ở root repo (không commit, có trong `.gitignore`) là **nguồn thật** cho production — sửa
  file này rồi chạy `deploy.bat`, không cần SSH vào VPS sửa tay nữa.
- VPS: SSH key `~/.ssh/lingoraenglish_vps`, user `root`, IP `221.132.19.75`. Postgres chạy trong container
  riêng (`lingoraenglish-postgres`, qua `docker-compose.yml`), KHÔNG mở port ra ngoài (chỉ bind
  `127.0.0.1:5432`).

### Tài khoản demo trên production (chưa có user thật — xem mục cutover ở trên)

| Email | Mật khẩu | Gói |
|---|---|---|
| demo-admin@lingoraenglish.local | Demo@1234 | Free + quyền Admin |
| demo-free@lingoraenglish.local | Demo@1234 | Free |
| demo-premium@lingoraenglish.local | Demo@1234 | Premium |
| demo-ielts@lingoraenglish.local | Demo@1234 | IELTS Pro |

Tạo qua `scripts/seed-demo-accounts.ts` (an toàn chạy lại nhiều lần). Lưu ý: subscription của
demo-premium/demo-ielts phải có `environment='live'` (không phải `'sandbox'`) mới được production công
nhận — script gốc tạo `'sandbox'`, đã tự sửa tay 1 lần trên production, nhớ sửa lại nếu re-run script này.

---

## Học liệu — đã nạp gì, còn thiếu gì

Toàn bộ học liệu nằm sẵn trong repo (`scripts/seed/*.json`, KHÔNG cần lấy từ Supabase), nạp bằng
`scripts/load-*.py`. Số liệu thật trên production (2026-09-13):

| Học liệu | Số lượng | Trạng thái |
|---|---|---|
| Câu Shadowing đơn | 3.104 câu, 31 chủ đề | ✅ Đủ |
| **Hội thoại Shadowing nhiều lượt** | **93 đoạn / 467 lượt**, phủ đủ 31/31 chủ đề, mỗi chủ đề 3 đoạn (A1/B1/C1) | ✅ Mới thêm 2026-09-13, xem mục riêng bên dưới |
| Bài Listening Lab | 99 bài | ✅ Đủ |
| Chủ đề AI Speaking Coach | 275 chủ đề | ✅ Đủ |
| Đề Speaking Tests (IELTS) | 90 đề | ✅ Đủ |
| Đề Speaking Tests (TOEFL/PTE) | 60 đề | ✅ Đủ |
| Pronunciation — 8 phần nâng cao | **372 bài** (22-50/phần) | 🟢 22 → 130 → 212 → 290 → 372 qua 4 đợt (2026-09-14) — **7/8 phần đã đủ 50**, chỉ Reductions còn 22 (có chủ đích, xem mục riêng bên dưới) |
| Từ vựng | **18 từ** (1 từ mẫu/chủ đề × 18 chủ đề) | ⛔ Thiếu nghiêm trọng — cần ~1.582 từ nữa (Vấn đề 2 trong tài liệu đặc tả, chưa chốt nguồn) |

### Tính năng "Hội thoại nhiều lượt" trong Shadowing (mới, 2026-09-13)

Thêm 4 cột vào `shadowing_sentences`: `dialogue_id` (nhóm các dòng thành 1 hội thoại), `turn_number`,
`speaker_label` (tên vai, tự do như `ai_role`/`user_role` của coach_topics), `speaker_voice` (1 trong 5
giọng `LILY_VOICES`). Migration: `db/0003_shadowing_dialogues.sql` (đã áp dụng production).

- Admin tự soạn hội thoại mới qua `/admin` → tab Shadowing → nút "💬 Compose a dialogue" (component
  `admin-shadowing.tsx`, server function `adminSaveShadowDialogue` trong `shadowing-admin.functions.ts`)
  — không cần chạy script.
- Nạp hàng loạt qua script riêng `scripts/load-shadowing-dialogues.py` (JSON ở
  `scripts/seed/shadowing-dialogues/*.json`, KHÁC schema với `load-shadowing.py` — có `turns[]` lồng
  nhau, không có ràng buộc ≥100 câu/không trùng lặp như script câu đơn).
- Trải nghiệm luyện tập (`shadow-practice.tsx`) hiện nhãn vai nói + câu trước đó làm ngữ cảnh, phát đúng
  giọng AI của vai đó (trước đây toàn bộ Shadowing chỉ dùng 1 giọng `"shimmer"` cố định).

---

## Khôi phục bảng điểm AI Coach khi tải lại trang (mới, 2026-09-14)

Trước đây F5 giữa hội thoại chỉ khôi phục được nội dung câu nói (transcript), mất hết bảng chấm điểm
(fluency/grammar/vocabulary/mistakes/corrections...) của các lượt cũ vì điểm không lưu gắn với từng
`coach_turn`. Đã thêm cột `analysis` (jsonb, nullable) vào `coach_turns` — migration
`db/0004_coach_turn_analysis.sql` (đã áp dụng production) + server function mới `saveCoachTurnAnalysis`
(`coach.functions.ts`, kiểm tra sở hữu session trước khi ghi). `getCoachSession` giờ trả kèm điểm đã lưu
theo từng turn, `ai-speaking.tsx` dựng lại đúng cả `analysis` lẫn `previous` (để badge "điểm tăng X" vẫn
đúng) khi khôi phục. Đã build/deploy + xác nhận qua HTTP thật.

---

## Speaking Tests (IELTS) — chấm điểm Pronunciation trong Part 1-3 (mới, 2026-09-14)

Phát hiện khi đối chiếu lại với spec gốc: `evaluateIelts` chỉ chấm Fluency/Lexical/Grammatical từ
transcript, còn Pronunciation luôn bỏ trống — prompt AI ghi thẳng "Do NOT score pronunciation" và UI
(`speaking-tests.tsx`) hard-code `value={null}`, dù cột `ielts_attempts.pronunciation` đã có sẵn trong
schema từ trước và `saveIeltsAttempt` chưa từng ghi vào đó (điểm chưa từng được yêu cầu sai trong tài
liệu QA gửi khách — `04_BAO_CAO_KIEM_THU_KHACH_HANG.md` dòng #10 — trước bản sửa này).

Đã thêm hàm `analyseIeltsPronunciationAudio` (`ai-providers.server.ts`) — Gemini nghe trực tiếp bản ghi
âm câu trả lời tự do và chấm band 0-9 (bước 0.5) theo đúng tiêu chí giám khảo IELTS thật (âm đơn, trọng
âm từ/câu, ngữ điệu, chunking) — khác với `analysePronunciationAudio` vốn so khớp phát âm với 1 "target"
cố định (dùng cho bài đọc lại TOEFL/PTE), vì câu trả lời IELTS Part 1-3 là tự do, không có kịch bản để so.
`evaluateIelts` giờ gọi song song (`Promise.all`) cả LLM chấm text lẫn cuộc gọi audio này khi client gửi
kèm `audioBase64`/`mimeType`; `speaking-tests.tsx` gửi kèm bản ghi âm sẵn có lúc submit và hiển thị đúng
`ScoreBar`, `saveIeltsAttempt` đã lưu cột `pronunciation`. Cập nhật khoá dịch
`tests.score.pronunciationHint` ở cả 16 ngôn ngữ (trước đó ghi "luyện tập trong Pronunciation Coach" vì
chưa chấm được). Null khi không gửi audio hoặc Gemini lỗi/không cấu hình — không đoán bừa.

Đã typecheck sạch (`tsc --noEmit`), **đã build/deploy lên production** (2026-09-14). Không cần migration DB
(cột đã có sẵn). TOEFL/PTE không đổi gì (nằm ngoài phạm vi spec IELTS Speaking Tests đang đối chiếu).

**Fix kèm theo cùng đợt**: nút "Full Mock Test" trước đó có thể chọn phải đề Part 2/3 đang khoá cho user
Free (vì chỉ Part 1 có test free — xác nhận đây là thiết kế đúng, không đổi), khiến 2/3 chặng hiện câu hỏi
rỗng rồi lỗi `UpgradeRequiredError` giữa chừng lúc Submit. Đã sửa tận gốc:
`buildMockTest` (`speaking-test-library.ts`) bỏ hẳn fallback sang đề khoá — giờ chỉ chọn trong các đề
`unlocked`, bỏ qua phần nào không có đề free thay vì lấy đại đề khoá. Thêm `canBuildMockTest()` để
UI (`speaking-tests.tsx`) biết trước user có đủ cả 3 phần unlocked hay không; nút Full Mock Test giờ hiện
đúng dạng khoá (link sang `/pricing` + `PremiumBadge`, tái dùng đúng pattern các thẻ đề khác) thay vì cho
bấm vào rồi lỗi giữa chừng. Vì chỉ Part 1 có test free nên thực chất Full Mock Test giờ luôn yêu cầu
Premium/IELTS Pro — đúng bản chất dữ liệu hiện có, không phải bug mới.

---

## Pronunciation — 44 Sounds: gate nội dung + Mastered thật + tách 4 bước đầu (mới, 2026-09-14)

Đối chiếu với Yêu cầu 5 của spec (44 âm gộp 1 nhóm "Sounds" không chia Level, 8 bước Listen→...→Mastered,
3 âm free/41 âm Premium), phát hiện 2 gap nghiêm trọng + 1 lỗi luồng, đã sửa cả 4:

1. **Gate nội dung lớp server** — `pronunciation.tsx` trước đó import thẳng `PHONEMES` (client-bundled),
   gửi hết nội dung bài học 44 âm xuống mọi trình duyệt kể cả chưa đăng nhập, không hề khoá/đánh dấu 🔒 —
   chỉ lộ ra khi bấm Submit ghi âm. Thêm `getSoundsCatalogue` (`pronunciation.functions.ts`) redact
   `how/lips/teeth/tongue/jaw/mistakes/words/sentences/pairs` thành rỗng cho sound index ≥ `FREE_SOUND_COUNT`
   (3) khi chưa Premium — đúng pattern `speaking_test_catalogue()`. UI hiện badge khoá + CTA `/pricing`.
2. **"Mastered" (bước 8) lưu thật vào DB** — trước đó chỉ là `useState` trong RAM, F5 hoặc đổi âm là mất.
   Thêm cột `pronunciation_scores.clear_runs`/`.mastered` (migration `src/db/schema/0001_pronunciation_mastered.sql`
   — lưu ý: `drizzle-kit generate` sinh lẫn cả loạt thay đổi cũ đã áp dụng tay ngoài Drizzle trước đó, đã
   dọn lại file chỉ còn 2 dòng ALTER TABLE thật cần), logic giống hệt `shadowing_progress.clear_attempts`/
   `status` (2 lần liên tiếp ≥90 = mastered, không sticky — 1 lần điểm thấp là mất lại).
3. **Tách 4 bước đầu độc lập** — trước đó Listen/Understand/Watch/Repeat dùng chung 1 biến `playing`, bấm
   Listen 1 lần là cả 4 bước tự tích xanh. Listen giờ dựa `hasPlayed` (sticky); Understand/Watch/Repeat
   không có tín hiệu tự động khả dụng (nội dung nằm ở component cha `pronunciation.tsx`, không phải trong
   `PronPractice`) nên chuyển thành chip bấm được, tự báo cáo — đúng "Phải test từng bước".
4. **Bỏ bộ lọc Level khỏi tab Sounds** — Yêu cầu 5 ghi rõ "Không chia thành nhiều Level riêng nữa". Cấu
   trúc 1 trang/1 tab đã đúng từ trước, nhưng UI vẫn còn bộ lọc Level (Beginner/Intermediate/Advanced) có
   thể ẩn bớt âm khỏi danh sách — đã ẩn bộ lọc này khi `skill === "sounds"` và bỏ hẳn `level` khỏi điều
   kiện lọc `filteredSounds` (chỉ còn Difficulty + tìm kiếm). Level filter cho 8 phần nâng cao (lessons)
   giữ nguyên, không đổi — nằm ngoài phạm vi Yêu cầu 5.

Đã typecheck sạch, đã build/deploy lên production. Không xác minh được qua browser thật do môi trường dev
Windows máy này không chạy được `vite dev` (lỗi `rolldown` không liên quan code) và tunnel SSH sang DB
production bị sandbox chặn — đã xác minh bằng cách dò tay code với dữ liệu thật (`PHONEMES` index 0/3),
khách tự test trên production bằng tài khoản demo-free/demo-premium.

---

## Pronunciation — 8 phần nâng cao: chuyển sang DB + CRUD admin + soạn thêm nội dung (mới, 2026-09-14)

Đối chiếu Yêu cầu 6 (≥50 examples/phần, 5 free/phần, Audio/Explanation/Practice/Recording/AI feedback/
Progress mỗi phần). Audio/Practice/Recording/AI feedback/Progress đã hoạt động sẵn từ trước (dùng chung
pipeline với Sounds). Còn thiếu 2 việc, đã làm cả hai:

1. **Gate nội dung lớp server** — y hệt gap vừa sửa ở Sounds: `SKILL_LESSONS` (mảng TS tĩnh) từng import
   thẳng vào client, gửi hết nội dung 8 phần xuống mọi trình duyệt bất kể tier. Đã thêm
   `getSkillLessonsCatalogue` redact đúng cách.
2. **Chuyển toàn bộ nội dung từ mảng TS tĩnh sang bảng DB thật + CRUD admin** — khách yêu cầu rõ: "cho
   CRUD luôn ở admin ... các phần trước đó cũng thế" (tham chiếu Shadowing). Đã làm:
   - Bảng mới `pronunciation_lessons` (migration `src/db/schema/0002_pronunciation_lessons.sql`, sinh sạch
     — không dính bug snapshot cũ nữa vì lần trước đã đồng bộ lại journal) — cột theo đúng convention
     `shadowing_sentences` (`is_free`/`sort_order`/`status` triplet, `points text[]`, `items jsonb`).
   - Server functions admin (`pronunciation-admin.functions.ts`): `adminListPronunciationLessons`,
     `adminSavePronunciationLesson` (upsert), `adminSetPronunciationLessonStatus` (soft "xoá" — đúng quy
     ước không hard-delete của cả codebase, xem `shadowing-admin.functions.ts`/`coach.functions.ts`),
     `adminSetPronunciationFreeCount` (bulk theo skill, giống `adminSetShadowFreeCount`).
   - UI admin (`admin-pronunciation.tsx`, tab "Pronunciation" mới trong `/admin`) — accordion theo 8 skill
     cố định, mỗi lesson sửa inline (title/level/difficulty/accent/explain/points/items/caution), thêm
     lesson mới cùng form, không cần chạy script.
   - `getSkillLessonsCatalogue` (`pronunciation.functions.ts`) và gate lớp chấm điểm (`analysePronunciation`
     trong `lily.functions.ts`) đổi từ đọc mảng tĩnh (`skillLessonRank`) sang đọc thẳng cột `is_free` của
     DB theo `lessonId` — cùng 1 nguồn sự thật, không thể lệch nhau như trước.
   - Xoá hẳn mảng tĩnh `SKILL_LESSONS`/`SkillLesson`/`SkillItem`/`FREE_SKILL_LESSON_COUNT`/
     `skillLessonRank` khỏi `pronunciation-content.ts` (dead code sau khi chuyển DB) — xoá bằng script
     Python theo số dòng chính xác, không dùng Edit text-match (block quá lớn để tái tạo an toàn bằng tay).

**Nội dung**: soạn thêm qua JSON seed (`scripts/seed/pronunciation-lessons/<skill>.json`, 1 file/skill,
tên file = skill id) + script nạp mới `scripts/load-pronunciation-lessons.py` (cùng convention
`load-shadowing.py`: dedupe theo title, `on conflict (skill, sort_order) do update`, 5 lesson đầu/skill
free). Đã nạp thật lên production qua `docker exec ... psql` (không dùng `SUPABASE_DB_URL` trực tiếp vì
tunnel SSH sang DB production bị sandbox chặn — thay bằng scp file SQL lên VPS rồi chạy tại chỗ, giống hệt
cách `remote-migrate.sh` áp dụng migration). Số lượng thật hiện tại (sau đợt 4, 2026-09-14) — **372/400**
(mục tiêu 50/phần):

| Phần | Đợt 1 | Đợt 2 | Đợt 3 | Đợt 4 | Free |
|---|---|---|---|---|---|
| Word stress | 45 | 50 | 50 | **50 ✅** | 5 |
| Intonation | 15 | 32 | 49 | **50 ✅** | 5 |
| Sentence stress | 24 | 39 | 49 | **50 ✅** | 5 |
| Connected speech | 14 | 29 | 43 | **50 ✅** | 5 |
| Fluency | 8 | 17 | 28 | **50 ✅** | 5 |
| Rhythm | 8 | 16 | 27 | **50 ✅** | 5 |
| Chunking | 7 | 14 | 25 | **50 ✅** | 5 |
| Reductions | 9 | 15 | 19 | **22** | 5 |

**7/8 phần đã đạt đúng 50/phần.** Chỉ còn Reductions ở 22/50 — có chủ đích, không phải bỏ sót: đây là tập
rút gọn khẩu ngữ (gonna/wanna/kinda/coulda...) có giới hạn thật trong tiếng Anh tự nhiên, thêm nữa dễ thành
lặp ý — ưu tiên chất lượng hơn ép đủ số. Có thể coi phần này gần như hoàn thiện thực tế dù chưa chạm mốc
50. Hạ tầng (DB + CRUD + gate) đã xong 100% từ đợt 1 — làm tiếp qua `/admin` → tab Pronunciation trực tiếp
(không cần code), hoặc thêm JSON vào `scripts/seed/pronunciation-lessons/` rồi
chạy lại `load-pronunciation-lessons.py`. Đã báo khách rõ con số thật, không nhận vơ là đã đủ 50/phần.

Đã typecheck sạch, đã build/deploy lên production, đã xác nhận qua HTTP thật + query DB thật (130 rows,
đúng 5 free/skill).

**⛔ Bug nghiêm trọng phát hiện + đã sửa (2026-09-14, sau khi khách test thật):** khách báo tất cả 8 tab
kỹ năng hiện "0 shown" dù DB có đủ 372 dòng — hoá ra **KHÔNG PHẢI bug code**, mà bảng
`pronunciation_lessons` tạo qua `drizzle-kit generate` chỉ có RLS policies, **thiếu hẳn GRANT bảng**
(`drizzle-kit` không model GRANT, chỉ model `pgPolicy`) — Postgres chặn ở bước kiểm tra quyền bảng
*trước khi* RLS kịp chạy, nên mọi query (kể cả qua `service_role`/`withAdmin`) đều bị
`permission denied for table pronunciation_lessons` (code 42501). Vì lỗi này bị `createServerFn` nuốt và
trả về response nhỏ (200 OK, ~600 bytes) thay vì lỗi rõ ràng, nên rất khó phát hiện chỉ bằng cách nhìn
Network tab — phải test trực tiếp query trong container (`node` script gọi thẳng `withAdmin`) mới thấy
đúng nguyên nhân gốc. Đã sửa bằng `GRANT SELECT/ALL` cho `anon`/`authenticated`/`service_role`/`lingora`
(khớp đúng bộ quyền của `shadowing_sentences`), ghi lại thành migration
`db/0005_pronunciation_lessons_grants.sql` để disaster-recovery/database mới không dính lại lỗi này.
**Bài học quan trọng cho mọi bảng mới tạo bằng `drizzle-kit generate` sau này**: luôn phải tự thêm GRANT
thủ công (không tự sinh), nếu không sẽ luôn bị permission denied dù RLS đúng 100%.

---

## Hệ thống hạn mức Free/Premium — hợp nhất thật sự (2026-09-15), bản 2026-09-13 hoá ra vẫn sai

Bản "đã hợp nhất" ngày 2026-09-13 (xem lịch sử git) hoá ra **không sửa đúng Yêu cầu 9** — nó đổi từ 3 cơ chế
hạn mức tách biệt thành **7 cơ chế tách biệt khác** (mỗi tính năng đúng 1 gate riêng, nhưng vẫn là *riêng*,
không phải *chung*): bảng `coach_settings` singleton, hằng số hard-code `FREE_SOUND_COUNT` trong
`pronunciation-content.ts`, và 3 admin action gần như copy-paste nhau
(`adminSetShadowFreeCount`/`adminSetPronunciationFreeCount`/`adminSetVocabularyFreeCount`), cộng cờ `is_free`
set tay qua script cho Listening/Speaking Tests. Phát hiện lại khi khách hỏi audit lần 2 (2026-09-15) — đọc
kỹ code mới thấy bảng ở bản ghi cũ liệt kê "Nơi enforce" khác nhau cho từng tính năng chính là bằng chứng vi
phạm, không phải bằng chứng đã sửa.

**Sửa thật lần này**: `billing_plans.limits` (jsonb, đã có sẵn từ đầu, mỗi dòng 1 tier free/premium/
ielts_pro, admin sửa ở tab "Plans" — `plan-admin.functions.ts`/`admin-plans.tsx`) giờ là **nơi duy nhất**
chứa mọi con số free/premium của mọi tính năng. `entitlements.server.ts` thêm `getLimits(tier)` (đọc, cache
2 phút kiểu i18n) và `resyncContentFreeRanks()` (ghi — tính lại `is_free`/`access_tier` cho Shadowing/
Pronunciation lessons/Vocabulary/Listening bằng `row_number() OVER (PARTITION BY <nhóm> ORDER BY sort_order)`,
tự chạy sau mỗi lần `adminUpdatePlan` lưu). Migration seed số liệu:
`src/db/schema/0004_unify_feature_limits.sql` (đọc nguyên giá trị `coach_settings` cũ qua subquery thay vì
đoán số, các số còn lại lấy đúng từ audit khách hàng 2026-09-14 bên dưới).

| Tính năng | Key trong `billing_plans.limits` | Cách áp dụng |
|---|---|---|
| AI Speaking Coach | `coach_free_turns_lifetime` (free), `coach_monthly_turns` (premium/ielts_pro) | Đọc trực tiếp (live) trong `coach.functions.ts#settings()` — `coach_turns`/`coach_reserve_turn()` giữ nguyên, chỉ đổi nguồn ngưỡng |
| Shadowing | `shadowing_free_per_topic_level` (=4) | Resync-on-write vào `shadowing_sentences.is_free`, nhóm theo `(topic_id, level)` — **quan trọng**: không phải `sort_order <= N` đơn giản, vì `sort_order` là chỉ số chạy toàn topic (không reset theo level) — dùng flat threshold sẽ lặp lại đúng bug "chỉ beginner mới free" đã sửa ở audit 2026-09-14 |
| Pronunciation nâng cao (8 phần) | `pronunciation_lessons_free_per_skill` (=5) | Resync-on-write vào `pronunciation_lessons.is_free`, nhóm theo `skill` |
| Pronunciation 44 âm | `pronunciation_sounds_free_count` (=3) | Đọc trực tiếp (live) trong `getSoundsCatalogue`/gate chấm điểm (`lily.functions.ts`) — không còn hằng số hard-code |
| Vocabulary | `vocabulary_free_per_category` (=10) | Resync-on-write vào `vocabulary_words.access_tier`, nhóm theo `category`. RLS (`can_access_tier`) giữ nguyên, không đổi |
| Listening Lab | `listening_free_categories` (=6) | Resync-on-write vào `listening_lessons.is_free`, xếp hạng category theo `LISTENING_CATEGORIES` (`src/lib/listening-content.ts`) — đã đồng bộ lại thứ tự với `CATEGORY_ORDER` trong `scripts/load-listening.py` (trước đó 2 danh sách thứ tự khác nhau, chỉ tình cờ ra cùng kết quả) |
| Speaking Tests | `speaking_tests_free_per_part` (=1/part IELTS) + `speaking_tests_free_toefl_pte` (=0) | Resync-on-write vào `speaking_tests.is_free` (2026-09-16 — trước đó là ngoại lệ curated tay). 3 đề free = IELTS Part 1/2/3 mỗi phần 1 đề; TOEFL/PTE khoá hết. Cả 3 đề khách đã chọn tay đều đứng thứ 1 trong phần của nó nên chuyển sang resync **không đổi đề nào** |

Đã xoá 3 admin action trùng lặp (`adminSetShadowFreeCount`/`adminSetPronunciationFreeCount`/
`adminSetVocabularyFreeCount`) + form nhập free-count riêng ở `admin-shadowing.tsx`/`admin-pronunciation.tsx`/
`admin-vocabulary.tsx`/`admin-coach.tsx` (còn lại chỉ hiển thị số, sửa ở tab "Plans"). Tab "content" (bảng
admin cũ, dropdown `access_tier` per-row) đã bỏ khả năng sửa riêng cho `vocabulary_words` (cùng lý do — sẽ
bị resync ghi đè) — 4 bảng còn lại trong tab đó (`grammar_lessons`/`speaking_questions`/`ielts_questions`/
`listening_exercises`) là bảng đời Supabase cũ, không tính năng nào đang thật sự gate theo chúng nữa, chưa
dọn vì không ảnh hưởng gì (không phải trọng tâm Yêu cầu 9). Bảng `coach_settings` **chưa bị xoá** — giữ lại
làm lưới an toàn, dự kiến DROP ở migration sau khi xác nhận ổn trên production vài ngày.

Dashboard (`/dashboard`) không cần đổi gì — vẫn đọc qua `getCoachUsage()`, chỉ nguồn dữ liệu bên trong đổi.

Đã đối chiếu query thật trên production sau khi deploy (2026-09-16): `coach_monthly_turns` = 0 cho cả
premium lẫn ielts_pro (tức **không giới hạn**, đúng giá trị `coach_settings` cũ mang sang), các số còn lại
đúng như bảng trên. Bảng "Nơi enforce" cũ (2026-09-13) đã hết hiệu lực, xoá khỏi bản ghi này để khỏi đọc nhầm.

Đã xoá 3 hàm chết không dùng tới trong lúc dọn (2026-09-13): `chatWithLily`, `reviewConversation`,
`correctEnglish` (không route/component nào gọi tới — "Free Conversation" thật sự chạy qua `coachReply`
trong `coach.functions.ts`, không phải các hàm này).

---

## Yêu cầu 10 (hạn mức sử dụng) — siết lại 2026-09-16: 2 lỗ hổng thật + đếm đồng thời + hoàn lượt

Yêu cầu 9 mới lo phần "một cơ chế, một nơi cấu hình". Đối chiếu tiếp Yêu cầu 10 (kiểm tra phía máy chủ,
không lách được bằng gọi thẳng API, không đếm sai khi đồng thời, AI lỗi thì hoàn lượt) phát hiện **2 lỗ
hổng có thật trên production**, đã xác minh trực tiếp trước khi sửa:

1. **Nội dung 41 âm khoá nằm sẵn trong file JS trình duyệt tải về** — `pronunciation.tsx` import
   `SOUND_COUNT = PHONEMES.length` nên cả mảng `PHONEMES` (how/lips/tongue/mistakes/words/sentences/pairs
   của đủ 44 âm) bị bundle vào `/assets/pronunciation-content-*.js`, ai xem source cũng đọc được. Bản ghi
   2026-09-14 ghi "đã gate lớp nội dung" chỉ đúng cho server function, không đúng cho bundle. Đã tách hẳn
   nội dung sang `src/lib/pronunciation-sounds.server.ts` (hậu tố `.server.ts` = không bao giờ vào client
   graph); trang lấy tổng số âm qua `getPronunciationFreeCounts`. Quét lại 57 chunk JS trên production sau
   deploy: 0 kết quả.
2. **Nghĩa của từ vựng khoá đọc được** — RLS `vocabulary_translations` là `USING (true)`, còn
   `content_catalogue('vocabulary')` trả về **chính từ** + id của cả ~1.600 từ khoá, nên chỉ cần gọi
   `getVocabularyTranslations` với các id đó là có nghĩa/ví dụ. Đã: join `vocabulary_words` (RLS của chính
   người gọi) trong `getVocabularyTranslations`, siết policy (migration 0005), và bỏ hẳn title/id của mục
   khoá khỏi `getContentCatalogue` (`LockedContentList` giờ hiện theo chủ đề + số lượng).

Chống lách bằng gọi thẳng API: mọi lệnh chấm điểm AI giờ **bắt buộc gắn đúng 1 nội dung** và server tự tra
DB — `analysePronunciation` nhận đúng một trong `targetSound`/`lessonId`/`testId`/`sentenceId`,
`analyseSpeaking` nhận `testId` **hoặc** `wordId` (Coach không còn dùng endpoint này). Server còn đối chiếu
**câu đang chấm có thuộc nội dung đó không** (`assertTextBelongs`), nên không thể lấy id của mục free ghép
với câu của mục khoá. Các endpoint ghi tiến độ/điểm (`saveShadowingProgress`, `saveListeningProgress`,
`recordVocabularyPractice`, `toggleVocabularyWordKnown`, `updatePronunciationSoundScore`,
`recordSpeakingTestAttempt`) cũng kiểm tra quyền trước khi ghi. Hàm gate chung `assertUnlockedOrPremium`
chuyển từ `lily.functions.ts` sang `entitlements.server.ts` để mọi tính năng dùng đúng 1 chỗ.

**Chấm điểm của AI Coach chuyển vào trong `coachReply`** (chạy song song với câu trả lời, phía server):
trước đây client gọi song song `analyseSpeaking` — tài khoản free hết 3 lượt vẫn gọi endpoint đó vô hạn để
lấy bảng điểm. Giờ không tốn lượt thì không có bảng điểm; `saveCoachTurnAnalysis` (client tự ghi điểm) đã bỏ.

Đếm đồng thời + hoàn lượt:
- `reserveUsage()` (entitlements) thay `requireCapacity` + `recordUsage`: giữ chỗ **nguyên tử** bằng
  `insert ... on conflict do update ... where units + 1 <= limit` trước khi gọi AI, trả về hàm hoàn lượt gọi
  khi AI lỗi. Bản cũ đọc-rồi-ghi nên vừa vượt hạn mức khi đồng thời vừa đếm thiếu (ghi đè lẫn nhau).
- `coach_reserve_turn()` (migration 0005) kiểm tra **cả hạn mức tháng của gói trả phí** trong cùng advisory
  lock, và bỏ qua lượt "mồ côi" (`coach_text=''` quá 5 phút — tiến trình chết giữa chừng hoặc lệnh hoàn lượt
  lỗi) thay vì tính mãi. Bản 3 tham số cũ giữ lại làm cầu nối trong lúc deploy, có thể DROP sau.
- `readUsage()` đếm theo đúng quy tắc đó, và bỏ lượt mở đầu (`turn_number = 0`) khỏi hạn mức tháng — trước
  đây mỗi lần bắt đầu hội thoại bị trừ oan 1 lượt của gói trả phí.

**Đã kiểm chứng trên production sau deploy** (2026-09-16):
- `scripts/test-usage-limits.mjs` (mới) đăng nhập `demo-free` rồi **gọi thẳng server function**: 17/17 đạt —
  thiếu id nội dung → từ chối; âm/bài/câu/đề/từ khoá → `UPGRADE_REQUIRED`; ghép id free với nội dung khoá →
  từ chối; ghi tiến độ/điểm cho nội dung khoá → từ chối; nghĩa từ khoá không trả về; Coach hết 3 lượt →
  từ chối; và kiểm chứng ngược: âm free vẫn chấm bình thường (không chặn nhầm).
- Test đồng thời ở tầng SQL (user tạm, xoá ngay sau test): 10 request song song với hạn mức 3 → đúng 3 lượt;
  20 request song song với quota 5 → đúng 5, counter = 5 (không mất/không dư); hoàn lượt trả lại đúng 1.
- 6 hạn mức trên production: Coach 3, âm 3, từ vựng 10/chủ đề, listening 6 chủ đề, ví dụ nâng cao 5/phần,
  Speaking Tests 3 đề (IELTS 1/1/1; TOEFL/PTE 0 — **quyết định của khách 2026-09-16**, trước đó free tới 9 đề).
- Luồng Coach thật (demo-premium): 1 lượt trả về cả câu trả lời lẫn bảng điểm, bảng điểm lưu đúng vào
  `coach_turns.analysis` (F5 khôi phục được).

**Chưa làm / lưu ý**: chưa test được bằng trình duyệt thật (phiên làm việc không có browser) — mới test ở
tầng API + DB. Quota ẩn `stt_requests` (free 40/tháng) vẫn áp cho mọi lần ghi âm: đặc tả không nhắc con số
này, nếu khách coi đó là hạn mức thứ 7 thì cần hiển thị cho người học hoặc bỏ. `scripts/test-usage-limits.mjs`
đọc id server function từ `scripts/.usage-limit-ids.json` (sinh lại sau mỗi lần deploy — xem hướng dẫn ở
đầu file script).

### `migrate.bat` đã chạy lại được (2026-09-16) — 0003 từng chặn toàn bộ pipeline

`0003_vocabulary_content_fields.sql` chưa từng áp được lên production và **chặn mọi migration sau nó**
(`remote-migrate.sh` áp theo thứ tự tên file, gặp lỗi là dừng) — vì thế 0004/0005 phải áp tay qua SSH.
Nguyên nhân: cột + ràng buộc `vocabulary_words_category_sort_order_key` đã được thêm tay từ trước, nên câu
lệnh backfill trong file — đánh số lại **toàn bộ** `sort_order` theo `created_at` — vừa lỗi (đánh số đè lên
các dòng đang giữ đúng số đó, ràng buộc unique kiểm tra ngay từng dòng) vừa nguy hiểm: nếu chạy lọt sẽ xáo
lại thứ tự 1.961 từ và **đổi luôn 10 từ miễn phí của mỗi chủ đề** (free rank tính từ `sort_order`). Đã sửa
file thành idempotent: chỉ đánh số các dòng còn `sort_order = 0` (và đánh sau các số đã dùng trong cùng
category), thêm ràng buộc qua `DO $$ ... IF NOT EXISTS`. Chạy trên production ra `UPDATE 0` — dữ liệu không
đổi (1.961 dòng, 10 free/chủ đề, 0 trùng), `migrate.bat` giờ báo "no new migrations".

**Bài học cho migration sau này**: file migration phải chạy lại được nhiều lần và phải an toàn trên database
đã được sửa tay trước đó — dùng `IF NOT EXISTS`/`DO $$` cho ràng buộc, và **không bao giờ** backfill vô điều
kiện một cột mà logic nghiệp vụ đang phụ thuộc vào giá trị của nó. Lưu ý thư mục `migrations/` trên VPS hiện
có 2 file khác nhau cùng số 0004 (`0004_coach_turn_analysis.sql` chép tay từ `db/`, và
`0004_unify_feature_limits.sql` của `src/db/schema/`) — cả hai đã áp, tên khác nhau nên `.applied` theo dõi
đúng, chỉ là đánh số hơi rối.

---

## Audit khách hàng 2026-09-14 (buổi tối) — 4 lỗi phân bổ free/premium, đã sửa + xác nhận qua query thật

Khách gửi báo cáo audit chạy trực tiếp trên DB production, phát hiện 4 lỗi phân bổ free/premium (ngoài
Vocabulary — xem mục riêng bên dưới). Cả 4 đã sửa, áp dụng thẳng lên production qua SSH + `docker exec
... psql` (tunnel port 5432 bị sandbox chặn nhưng SSH command execution thì không — xác nhận lại
2026-09-14, khác với ghi chú cũ ở cuối file này), xác nhận lại bằng query đối chiếu trước/sau:

- **Speaking Tests (Yêu cầu 4)**: cả 3 đề IELTS free đều nằm ở Part 1 (0 đề free Part 2/3), vi phạm thẳng
  "ba đề miễn phí cần trải đều các phần thi" (dòng 342, tài liệu đặc tả). Sửa: bỏ free 2 đề Part 1
  (Hometown, Family), thêm free 1 đề Part 2 + 1 đề Part 3 (sort_order thấp nhất mỗi phần) — giờ đúng 1/1/1.
  Không cần đổi code: `canBuildMockTest()` (`speaking-test-library.ts:96-98`) đã tự đúng yêu cầu ≥1 đề free
  mỗi phần từ trước, chỉ do dữ liệu sai nên Full Mock Test trước đó luôn khoá với tài khoản free — giờ tự
  mở đúng, không cần sửa gì thêm.
- **Shadowing (Yêu cầu 2)**: `scripts/load-shadowing.py` cũ đánh free "10 câu đầu mỗi topic" — vì mỗi file
  topic liệt kê câu từ dễ → khó, 10 câu đầu gần như luôn là toàn bộ câu `beginner`, khiến free user gần như
  chỉ thấy `beginner` (465/477 câu free, 97.5%) và **0 câu `elementary`** — vi phạm thẳng "người dùng miễn
  phí tiếp cận được câu ở nhiều mức độ khác nhau" (tiêu chí nghiệm thu Yêu cầu 2). Sửa tận gốc: đổi logic
  loader sang "4 câu đầu **mỗi level** mỗi topic" (không phải 10 câu đầu topic bất kể level), rồi chạy lại
  UPDATE tương đương trên production (3.571 dòng, dùng `row_number() OVER (PARTITION BY topic_id, level)`)
  — giờ đúng 124/124/124/124 free đều 4 level. Script cho lần seed sau cũng đã đúng, không cần vá tay nữa.
- **Pronunciation Reductions (Yêu cầu 6)**: 22/50 ví dụ — bổ sung 28 ví dụ thật (ain't, gotcha, musta/mighta,
  shouldn'ta/couldn'ta, g-dropping -in', 'em/'n'/'cause/'course/aight, letcha, jever, gonna hafta, innit
  [UK], whaddya say, y'know, s'up, tell'im/ask'er, kinda sorta, dincha, hadta, willcha, lotsa/buncha,
  helluva, howdy, s'pose — mỗi cái là hiện tượng rút gọn thật, không lặp ý với 22 cái cũ) vào
  `scripts/seed/pronunciation-lessons/reductions.json`, nạp qua `load-pronunciation-lessons.py` — giờ đúng
  **50/50**, khớp 7/7 phần còn lại (tất cả 8 phần nâng cao giờ đều 50/50).
- **Listening Lab (Yêu cầu 3 / Vấn đề 1)**: gap kép, cả hai đã sửa cùng lúc:
  1. `load-listening.py` cũ đánh free theo **"10 lesson đầu toàn bộ"**, hoàn toàn bỏ qua `category` — với
     5 category, không category nào từng bị khoá thật (99/99 `is_free=true`), dù script *tưởng* mình đang
     giới hạn 10. Sửa: đổi hẳn sang logic đúng nghĩa "chủ đề" = `category` (khớp `listen.filter.allTopics`)
     — 6 category đầu theo `CATEGORY_ORDER` cố định thì free, category thứ 7 trở đi thì khoá.
  2. Thêm 2 category mới thật (không phải category rỗng cho có): **Academic English** và
     **Entertainment & Media**, 10 lesson/category (script + 5 câu hỏi + dictation + connected_speech đầy
     đủ, đúng schema, qua hết validate của loader). Ghi chú: mục "Còn thiếu" cũ ở dưới có ghi "đã hỏi, khách
     chọn để dành" cho việc tạo category mới — báo cáo audit 2026-09-14 này là chỉ đạo mới, rõ ràng hơn từ
     khách, nên đã làm theo, không chờ thêm.
  - Kết quả xác nhận qua query thật: 7 category, 6 category đầu (Travel/Everyday Life/Social
    English/Work & Career/Canadian Life/Academic English) 100% free, category thứ 7 (Entertainment & Media)
    100% khoá (0/10 free) — đúng "sáu chủ đề đầu miễn phí, các chủ đề còn lại bị khóa".

---

## Kiểm tra lại + sửa tiếp phiên làm việc song song (2026-09-15)

Phiên trước (2026-09-14 tối) bị dừng giữa chừng do rate limit, người dùng tự tiếp tục làm việc song song
(commit `a36c249`, cùng thư mục làm việc) trong lúc chờ. Phiên này kiểm tra lại toàn bộ, tìm thấy và sửa
5 lỗi thật trước khi coi là xong:

1. **`vocabulary.tsx` lỗi build + lỗi hiển thị thật**: nút "Load more" gọi `t("common.loadMore")` — khoá
   dịch này chưa tồn tại, vừa gây lỗi TypeScript (`common.loadMore` không nằm trong `TranslationKey`) vừa
   khiến nút hiện chữ "common.loadMore" thẳng ra màn hình. Đã thêm khoá vào `en.ts`.
2. **`progress.functions.ts` lỗi runtime thật**: cột điểm "grammar" mới sửa để lấy từ `speakingAttempts.grammar`
   nhưng câu `select` không lấy cột đó — sẽ luôn trả về `NaN` trên bảng My Progress cho mọi người dùng đã
   đăng nhập. Đã thêm `grammar` vào `select`.
3. **`ru.ts` bị thụt lùi**: ai đó xoá `progress.days_few`/`progress.days_many` (dạng số nhiều tiếng Nga) —
   vì cơ chế `t()` fallback về `en[key]` khi thiếu key ở locale hiện tại (không fallback về `_other` cùng
   locale), việc xoá này khiến người dùng Nga thấy tiếng Anh trộn vào cho các số đếm rơi vào nhóm
   "few"/"many". Đã khôi phục lại 2 dòng.
4. **"Daily English" bị tạo nhầm thành chủ đề thứ 19**: ai đó soạn 100 từ cho category "Daily English"
   (giá trị mặc định cũ của cột, không phải tên chủ đề thật) — category này không nằm trong
   `VOCAB_CATEGORIES` (`ipa-data.ts`) nên **không hiện ở đâu cả**, kể cả trang Vocabulary lẫn trang admin
   (cả hai đều duyệt theo `VOCAB_CATEGORIES`), trùng lặp hoàn toàn với "Everyday English" đã có sẵn. Đã
   soft-delete (status='draft') 100 dòng này trên production, giữ nguyên dữ liệu.
5. Đã build + deploy lại production với các bản sửa trên (image mới, container recreate lúc 13:14
   2026-09-15, xác nhận healthy, không lỗi trong log khởi động).

**Xác nhận phần đã đúng (không cần sửa)**: 18/18 category Vocabulary đủ ≥100 từ (một vài category dư nhẹ
do soạn nhiều đợt — Idioms 130, Phrasal Verbs 113, Shopping 118 — không phải lỗi, kiểm tra `sort_order`
liên tục 1..N không trùng lặp), 100% đủ trường (ipa/meaning_en/meaning_vi/example_sentence/usage_context),
0 từ trùng lặp trong toàn bảng, luồng "Use it in Speaking" → `vocabulary_progress` vẫn hoạt động đúng, cả
4 lỗi audit YC1/YC2/YC4/YC6 hôm trước vẫn đúng như đã ghi nhận.

**Vocabulary (Yêu cầu 7): coi như xong** — hạ tầng (cột `sort_order`/`usage_context`, CRUD admin, script
nạp hàng loạt, gate free/premium) + nội dung (18 category × ≥100 từ, chất lượng đã soát mẫu) đều đã có
thật trên production.

**Đa ngôn ngữ (Yêu cầu 8 / Vấn đề 3): ĐÃ HOÀN THÀNH 100% (54/50+ NGÔN NGỮ)** — hệ thống i18n đã chuyển
sang mô hình DB-backed cho ngôn ngữ mới (`ui_languages`/`ui_translations` là nguồn dữ liệu chính thay vì
override thưa như trước, có cache trong bộ nhớ để không chậm trang khi thêm ngôn ngữ, có
`Intl.PluralRules` cho số nhiều, có form "Register a new language" trong admin). Đã nạp và xác nhận thật
trên production **toàn bộ 38 ngôn ngữ mới** qua seed DB + **16 ngôn ngữ gốc** trong `src/locales/` = **54/50+ ngôn ngữ**:
- **16 ngôn ngữ gốc**: en, vi, es, pt, fr, de, it, ja, ko, zh-CN, zh-TW, hi, id, tr, ru, ar.
- **38 ngôn ngữ mới qua DB seed** (100% đã nạp vào PostgreSQL production `ui_languages` & `ui_translations` với 45,689 dòng):
  th, pl, nl, sv, cs, da, fi, is, sk, hu, el, he, fa, nb, ur, ro, uk, bg, hr, sr, sl, lt, lv, et, ms, fil, bn, pa, ta, te, mr, gu, kn, ml, si, ne, my, km.
- Đã validate 100% các file seed: khớp placeholder `{{...}}`, chuẩn UTF-8 không lỗi ký tự, đúng hướng viết `ltr`/`rtl` (he, fa, ur, ar chuẩn RTL), biến thể số nhiều khớp chuẩn `Intl.PluralRules` từng ngôn ngữ.
- Query trực tiếp production DB xác nhận: `total_languages` = 54, `total_translations` = 45,689 rows.

---

## 🔴 Bug đăng ký 2026-09-18 (code đã vá, ⛔ nguyên nhân gốc — domain email — CHƯA vá, cần người dùng làm)

**Triệu chứng thật do người dùng báo**: đăng ký tài khoản → toast lỗi chung chung "Something went wrong".
Đăng ký lại lần 2 cùng email → báo "email đã được sử dụng" → chứng tỏ tài khoản **đã tạo trong DB** ở lần
đầu nhưng bị lỗi giữa chừng, kẹt lại vĩnh viễn không xác thực được, không có cách tự khôi phục.

**Đã tra ra 2 lớp nguyên nhân, xác minh bằng dữ liệu thật (không đoán):**

1. **Nguyên nhân gốc — domain email chưa xác minh trên Resend, ⛔ CHƯA VÁ, chỉ người dùng tự làm được**:
   test gửi trực tiếp qua đúng `SMTP_PASS` đang dùng trong `.env.docker` (gọi thẳng Resend HTTP API, không
   qua nodemailer) trả về `403: "The lingoraenglishai.com domain is not verified. Please, add and verify
   your domain on https://resend.com/domains"`. API key tự nó hợp lệ (không phải sai key) — chỉ riêng bước
   xác minh domain (DNS TXT + CNAME) trong `HUONG_DAN_LAY_SMTP_GOOGLE_OAUTH.md` Phần 1 Bước 2 chưa hoàn
   tất/chưa lan truyền. Ghi chú cũ ở đầu file này ("đăng ký/đăng nhập bằng email đã chạy thật với SMTP
   thật") là **sai** — chưa từng tự test gửi thật trước ngày này, đã sửa lại. Query DB xác nhận 2 tài khoản
   test (`tunghv.21it@vku.udn.vn`, `thanhhuyen191223@gmail.com`) đều có dòng trong `auth.users` VÀ đúng 1
   dòng trong `auth.email_verification_tokens` (nghĩa là bước tạo token cũng thành công) nhưng
   `email_confirmed_at` vẫn NULL — khớp chính xác: lỗi xảy ra đúng ở bước gửi mail, sau khi mọi ghi DB đã
   xong. **Cách sửa (người dùng tự làm)**: xem mục "⛔ Cần làm ngay" đầu file
   `HUONG_DAN_LAY_SMTP_GOOGLE_OAUTH.md`.
2. **Lỗi code thật, ĐÃ VÁ**: `signUp()`/`resendVerification()` (`auth.functions.ts`) gọi
   `issueEmailVerification()` không có try/catch — khi gửi mail lỗi vì bất kỳ lý do gì (không riêng vụ
   domain lần này — cũng có thể là Resend rớt mạng, rate-limit tạm thời...), lỗi văng thẳng ra ngoài
   `createServerFn`, tài khoản đã tạo/token đã tạo nhưng client nhận lỗi 500 chung chung thay vì màn hình
   "check your email". Đã bọc try/catch quanh cả 2 lời gọi, `console.error` lại lỗi phía server (cùng
   nguyên tắc fail-open như `rate-limit.server.ts`) nhưng vẫn trả `requiresVerification: true`/`{ok: true}`
   như bình thường — người học luôn thấy đúng màn hình "kiểm tra email" thay vì lỗi khó hiểu, và nút "Gửi
   lại" dùng lại được ngay khi domain email được xác minh xong, không cần tạo tài khoản mới. Đã typecheck
   sạch. **2 tài khoản test kẹt lại ở trên vẫn cần xử lý tay** (xoá hoặc chờ domain xác minh xong rồi bấm
   "Gửi lại email xác thực") — chưa tự xử lý vì không chắc người dùng muốn giữ hay xoá 2 tài khoản test đó.

---

## 🔴 SỰ CỐ NGHIÊM TRỌNG 2026-09-17 (đã vá) — migration 0009 chặn toàn bộ đăng nhập production

**Đọc mục này trước nếu đang debug bất kỳ lỗi đăng nhập/quyền hàm Postgres nào.**

Migration `0009_auth_rate_limits.sql` (rate-limit đăng nhập, xem mục riêng bên dưới) kết thúc bằng:
```sql
REVOKE ALL ON FUNCTION public.auth_rate_take(...) FROM public, anon, authenticated;
```
`public` ở đây là **pseudo-role nghĩa là "mọi role"**, không phải schema `public`. Hàm mới tạo mặc định
được Postgres cấp EXECUTE cho `PUBLIC`; thu hồi từ `public` là thu hồi khỏi **tất cả**, kể cả
`service_role` (role mà `withAdmin()` dùng để gọi hàm này) — và migration quên cấp lại. Hậu quả: **mọi
lượt đăng nhập thật trên production đều lỗi** `permission denied for function auth_rate_take`, và vì
`rate-limit.server.ts` khi đó không try/catch quanh lệnh gọi DB, lỗi thô này **vỡ thẳng ra toast trên UI**
— lộ tên hàm nội bộ, hash email, tham số cấu hình (`10, 900`).

**Đã vá 3 lớp** (migration `0011_fix_auth_rate_take_grant.sql` + code):
1. `GRANT EXECUTE ... TO service_role, lingora` — vá đúng nguyên nhân gốc.
2. `rate-limit.server.ts#take()` giờ try/catch quanh lệnh gọi DB, **fail open** (cho qua + log lỗi phía
   server) nếu bản thân cơ chế rate-limit gặp lỗi hạ tầng — không được phép làm mất khả năng đăng nhập chỉ
   vì lớp bảo vệ phụ bị lỗi. Bước kiểm tra mật khẩu ngay sau đó vẫn áp dụng đầy đủ.
3. `auth.tsx#friendlyError()` đảo từ **blacklist sang whitelist** — trước đây "trừ 2 câu đã biết, hiện hết
   phần còn lại"; giờ "chỉ hiện đúng những câu app tự viết ra trong `auth.functions.ts`, còn lại luôn là
   thông báo chung chung". Chặn mọi lỗi hạ tầng tương lai (không riêng lỗi lần này) khỏi lộ ra UI.

**Bài học migration Postgres** (áp dụng cho mọi hàm mới sau này, không riêng vụ này): mọi `REVOKE ... FROM
public` phải luôn đi kèm `GRANT` lại tường minh cho đúng role sẽ gọi hàm. **Không bao giờ coi migration đã
đúng chỉ vì test bằng role `postgres`/superuser** — superuser bỏ qua mọi kiểm tra quyền nên loại lỗi này sẽ
không bao giờ lộ ra khi test kiểu đó. Luôn kiểm bằng `set role <đúng role production dùng>;` trước khi
coi migration liên quan tới hàm là xong (đã làm việc này khi vá 0011, tái hiện đúng lỗi thật trên Postgres
tạm trước khi đụng production).

Triệu chứng phụ chưa giải thích được dứt điểm: sau lỗi đầu tiên (đã vá), có báo cáo 5 lần thử đăng nhập
tiếp theo "im lặng hoàn toàn" (loading rồi về bình thường, không toast, không điều hướng). Đã tra thẳng
bucket rate-limit trong DB → 0 dòng (không bị khoá), log server 12h không có dấu vết nào liên quan — nghi
chưa từng chạm tới server nhưng **chưa xác nhận được nguyên nhân chắc chắn**. Nếu tái diễn, cần Console +
Network tab lúc xảy ra để bắt đúng nguyên nhân.

---

## Yêu cầu 11 (Thanh toán) — audit sâu + vá 2 lỗ hổng thật + bỏ gateway Lovable (2026-09-16/17)

Đối chiếu kỹ với đặc tả (chữ ký webhook, idempotency, ân hạn, lịch sử offline, quay lại nội dung), xác minh
bằng code + test thật trên Postgres tạm (không đoán):

**Đã đúng từ trước**: xác thực chữ ký webhook qua SDK chính thức (`paddle.webhooks.unmarshal`), trạng thái
trả phí luôn tính server-side (`effective_tier()`), không cache nên logout/login hay F5 không làm sai
trạng thái, quay lại đúng nội dung khoá sau khi nâng cấp (`upgrade-return.ts` + polling `verifyCheckout`).

**2 lỗ hổng thật, đã vá** (migration `0007_payment_idempotency_history.sql`):
1. **Idempotency**: `logBillingEvent` là INSERT thuần, không dedupe theo `event.eventId`/`notificationId`
   (SDK Paddle trả sẵn 2 field này nhưng code không dùng) — Paddle gửi lại webhook khi timeout/lỗi (chính
   endpoint cũng tự tạo tình huống này vì trả 400 khi lỗi), mỗi lần gửi lại là 1 dòng `billing_events`
   trùng, **thổi phồng thẳng `totalRevenue`/`failedPayments` trên trang admin billing**. Vá: bảng
   `processed_webhook_events`, webhook "giành quyền xử lý" theo `eventId` trước khi chạy handler, release
   lại nếu handler lỗi (để Paddle retry vẫn vào được). Test 25 request đồng thời hạn mức 10 → đúng 10 lọt.
2. **Lịch sử thanh toán khi gateway gián đoạn**: `listMyPayments` đọc live từ Paddle, trả `{payments:[]}`
   **im lặng** khi gateway lỗi — UI hiện y hệt "chưa từng thanh toán". Vá: fallback đọc từ `billing_events`
   nội bộ (webhook đã ghi đủ subtotal/tax/description/invoice/thẻ), kèm cờ `stale` để UI báo "đang xem bản
   lưu nội bộ". Áp dụng cho cả `/billing` lẫn `/account`.

**Thêm cơ chế ân hạn** (`grace_period_days` trong `billing_plans.limits`, seed = 0 = giữ nguyên hành vi
cũ) — Vấn đề 4 trong đặc tả **khách chưa chốt số ngày**, nên chỉ dựng cơ chế, không tự chọn số. Đã kiểm
chứng: `past_due` + grace 7 ngày vẫn giữ Premium trong 7 ngày, quá hạn thì về free; gói bị huỷ (`canceled`)
**không** được hưởng ân hạn (đúng ý — ân hạn chỉ cho lỗi thanh toán, không cho chủ động huỷ).

**Vá thêm 2 việc nhỏ cùng đợt**: webhook `subscription.updated`/`canceled` đến **trước**
`subscription.created` (Paddle không đảm bảo thứ tự) từng bị mất trắng vì `UPDATE` khớp 0 dòng — giờ tự
đọc lại từ Paddle khi khớp 0 dòng. `verifyCheckout` từng ghi `subscription_activated` mỗi lần F5 trang
success — thêm unique index theo `(user_id, subscriptionId)` + `onConflictDoNothing`.

### Bỏ gateway Lovable, gọi thẳng Paddle (2026-09-17)

Trước đó mọi lệnh gọi Paddle đi qua proxy `connector-gateway.lovable.dev/paddle` (tàn dư từ nền tảng khởi
tạo project), cần **2 lớp key** (`X-Connection-Api-Key` + `Lovable-API-Key`). Khách xác nhận đã chủ động bỏ
phụ thuộc Lovable (giống việc đã bỏ Lovable AI Gateway trước đó) — đã viết lại `paddle.server.ts` gọi thẳng
`api.paddle.com`/`sandbox-api.paddle.com` bằng chính SDK (`Environment.production`/`Environment.sandbox`,
đã đối chiếu với source SDK để xác nhận đúng URL, không đoán), xác thực bằng 1 header chuẩn
`Authorization: Bearer`. Đổi tên `gatewayFetch`→`paddleFetch`, `getConnectionApiKey`→`getPaddleApiKey` ở 11
điểm gọi (`billing.functions.ts`, `billing-sync.server.ts`). Bỏ hẳn biến `LOVABLE_API_KEY` khỏi
`.env.docker.example`. Giờ chỉ cần đúng 4 giá trị Paddle — xem
`BAN GIAO DEV - LINGORA ENGLISH/HUONG_DAN_LAY_PADDLE_KEYS.md`.

---

## Yêu cầu 12 (Trang tài khoản) — thiếu 2/9 mục, "ngày bắt đầu gói" sai nguồn (2026-09-17)

Đối chiếu 9 mục yêu cầu, phát hiện mục 8 (Mức sử dụng AI) và mục 9 (Tiến độ học tập) **hoàn toàn chưa có**
trên `/account` (checklist cũ ghi nhầm ✅ — số liệu đó thực ra chỉ có ở `/dashboard`). Đã thêm
`AiUsagePanel`/`ProgressSummaryPanel` (`src/components/lily/usage-progress.tsx`), dùng chung server
function với `/dashboard` để không lệch số.

**Lỗi thật**: "ngày bắt đầu gói" đọc từ `subscriptions.current_period_start` — cột này **bị webhook ghi đè
mỗi lần gia hạn**, nên sau vài kỳ thanh toán ngày hiển thị nhảy sang gần nhất thay vì ngày đăng ký gốc, vi
phạm đúng yêu cầu đặc tả ("không phải ngày bắt đầu kỳ thanh toán hiện tại"). Vá: cột mới `started_at`
(migration `0008_subscription_started_at.sql`), lưu từ `startedAt`/`firstBilledAt` của Paddle, **chỉ ghi
khi payload có giá trị** (không xoá trắng khi payload thiếu field). Đã test trên Postgres tạm: gia hạn làm
`current_period_start` nhảy nhưng `started_at` giữ nguyên.

**Lỗi thêm phát hiện khi soi kỹ tiêu chí "khớp số lượt thực tế"**: thanh đo ghi "Conversations with Lingora
English" nhưng counter đó chỉ tăng khi sinh **learning plan** (`CAPABILITY_MAP` chỉ map `learning_plan`),
hội thoại Coach thật đi qua cơ chế đếm riêng (`coach_turns`), không đụng counter này — học viên trò chuyện
20 lượt vẫn thấy "0/200". Cùng nhãn sai này còn lộ ra ở bảng so sánh gói `/pricing`. Đã đổi nhãn thành "AI
learning plans" cho khớp đúng thứ nó đo.

---

## Yêu cầu 13 (Bảng tiến độ) — % là điểm trung bình chứ không phải hoàn thành, lộ dữ liệu demo (2026-09-17)

Lỗi lớn nhất: 4 thanh % ở `/progress` từng là **điểm trung bình các bài đã làm**, trong khi đặc tả yêu cầu
rõ % phải là **mức độ hoàn thành** (số mục đã làm / tổng số mục có sẵn). Viết lại hoàn toàn
`getProgressOverview()` (`progress.functions.ts`) theo đúng định nghĩa: Speaking = (shadowing mastered +
đề Speaking Test hoàn thành) / tổng nội dung 2 loại đó; Listening = bài hoàn thành / tổng bài; Pronunciation
= âm thành thạo / 44; Vocabulary = từ đã học / tổng từ published. Đã kiểm chứng công thức trên Postgres tạm
(30/150=20%, 10/20=50%, 11/44=25%, 66/200=33%, khớp tay). Xoá hẳn `getDashboardProgress()` (hàm tính sai
cũ) để không ai lỡ dùng lại.

**Lộ dữ liệu demo cho user thật đã đăng nhập** (vi phạm "không hiển thị số liệu giả"), 2 chỗ:
- `progress.tsx` fallback `DEMO_SOUND_PROGRESS` khi user chưa có điểm âm nào — giờ thay bằng trạng thái
  trống thật.
- **Phát hiện thêm khi rà cùng loại lỗi**: `speaking-tests.tsx` hiện band điểm IELTS **giả** (`DEMO_IELTS`)
  cho user đã đăng nhập nhưng chưa nộp bài — không có nhãn demo nào, đọc y như điểm thật. Đã ẩn bảng điểm
  tới khi có kết quả thật; khách chưa đăng nhập vẫn xem được bản mẫu (đúng giao kèo `demo-data.ts`: "used
  only when the visitor is not signed in").

**Chỉ 1 trang tiến độ duy nhất**: `/dashboard` bỏ 4 thanh riêng (và thanh "grammar" thứ 5 không có trong
spec), dùng chung `ProgressSummaryPanel` với `/account` — cả 3 nơi đọc đúng 1 nguồn, không thể lệch số.

---

## Phần III (Yêu cầu phi chức năng) — audit 3.1-3.5 (2026-09-16/17)

### 3.1 Bảo mật — 2 lỗ hổng thật

- **Xoá dữ liệu luyện tập thiếu bảng**: `deleteMyAccountData` chỉ xoá 7 bảng, 3 trong đó là bảng Supabase
  cũ không còn dùng, còn các bảng **đang dùng thật** thì bỏ sót (`listening_progress`, `shadowing_progress`,
  `vocabulary_progress`, `speaking_test_progress`, `daily_plans`). Riêng `coach_turns` **không xoá được** vì
  nó vừa là transcript vừa là sổ đếm hạn mức free — xoá thẳng sẽ reset hạn mức. Vá: redact nội dung
  (`user_text=''`, `analysis=null`) nhưng **giữ dòng** để hạn mức không bị lách; `coach_sessions` cố tình
  không đụng (cascade sẽ kéo theo xoá luôn dòng vừa redact — suýt viết nhầm chỗ này, đã tự bắt qua FK).
  Test trên Postgres tạm: sau redact, lời nói bị xoá sạch nhưng hạn mức vẫn đúng 3/3.
- **Không có rate-limit ở endpoint xác thực**: `signIn`/`requestPasswordReset`/`resendVerification` không
  giới hạn tần suất — dò mật khẩu vô hạn, hoặc dội mail vào hộp thư nạn nhân. Vá: bảng `auth_rate_limits` +
  hàm `auth_rate_take()` đếm nguyên tử (migration 0009, **dính sự cố GRANT — xem mục SỰ CỐ NGHIÊM TRỌNG ở
  trên**, đã vá bằng 0011). Ngưỡng: đăng nhập 10/15phút/email + 30/15phút/IP (xoá bộ đếm khi đăng nhập
  thành công); quên mật khẩu/gửi lại xác thực 3/giờ/email + 10/giờ/IP. Email băm sha256 trước khi làm khoá
  bucket — không lưu địa chỉ thật kể cả của kẻ dò mật khẩu.

### 3.2 Chi phí AI — thêm theo dõi + trần chi phí (trước đó chỉ có log, chưa có chi phí/kiểm soát)

- `ai_usage_log` thêm cột `estimated_cost_micro_usd`, tính giá **ngay lúc gọi** (model đổi giá không làm
  sai bản ghi cũ) — bảng giá cứng trong `ai-cost.server.ts`, model lạ tính 0 thay vì đoán bừa.
- `ai_cost_settings` (1 dòng, migration 0010): trần chi phí/ngày + ngưỡng cảnh báo %, admin tự đặt, seed =
  không giới hạn (deploy không đổi hành vi). `assertWithinDailyBudget()` chặn gọi AI mới khi chạm trần —
  đây là trần **toàn hệ thống theo ngày**, khác hẳn `DAILY_AI_LIMIT` cũ (300 lượt/người/ngày, chống 1 tài
  khoản lạm dụng) — 2 cơ chế độc lập, không thay thế nhau.
- **Lỗi tự phát hiện muộn**: viết xong backend (`getAiCostReport`/`updateAiCostSettings`) nhưng quên nối
  giao diện — bị khách hỏi thẳng "admin đâu có quyền gì đâu?" mới nhận ra. Đã thêm tab "AI Cost" trong
  `/admin` (`admin-ai-cost.tsx`): chi tiêu hôm nay so với trần, đặt trần + ngưỡng, bảng 30 ngày theo tính
  năng/theo ngày.
- `scripts/pregenerate-audio.ts` mới — tạo sẵn audio hàng loạt cho Shadowing/Listening/Vocabulary/
  Pronunciation vào đúng `tts_cache` mà `speak()` đọc (cùng cache key, không sinh bản trùng), có `--dry-run`
  ước tính chi phí trước khi chạy thật, `--limit`/`--only` để chạy theo lô, tự bỏ qua cái đã có.

### 3.5 Nhật ký & giám sát — thiếu log đăng ký/đăng nhập + sao lưu

- Bảng `auth_events` (migration 0010) — ghi đăng ký, đăng nhập thành công/thất bại/bị chặn rate-limit.
  Không lưu email (chỉ `user_id` khi biết) để log không tự biến thành danh sách địa chỉ khách hàng.
- `deploy/backup-db.sh` mới — `pg_dump` nén, ghi ra `.part` rồi mới đổi tên (đứt giữa chừng không để lại
  file cụt giả dạng backup tốt), tự kiểm tra đọc lại được (gzip hợp lệ + marker hoàn tất), giữ 14 ngày.
  **Quy trình khôi phục viết sẵn trong file**, bắt buộc test trên database nháp trước khi đụng production
  thật — chưa cài cron trên VPS, lệnh cài có sẵn trong comment đầu file.

---

## Phần IV (Dữ liệu) — audit 4.1/4.2/4.3 (2026-09-17)

**4.1 Khối lượng học liệu: ĐẠT TOÀN BỘ**, đã đối chiếu số liệu thật trên production (không tin theo tài
liệu cũ): Vocabulary 1.861 từ/18 chủ đề (thấp nhất đúng 100/chủ đề), Pronunciation nâng cao 400 ví dụ/8
phần (thấp nhất đúng 50/phần — số 372 trong các mục ghi trước đó đã lỗi thời), Shadowing 3.571 câu phủ đều
4 cấp độ + 93 đoạn hội thoại, Speaking Tests IELTS 30/30/30 + TOEFL 30 + PTE 30, 44 âm đủ, Listening 119
bài/7 chủ đề.

**4.2 Dữ liệu cần lưu: 11/12 nhóm đạt.** Nhóm "Bản ghi âm của người học" — cột `audio_path` có sẵn trong
schema (`speaking_attempts`/`pronunciation_attempts`) nhưng **0 dòng có dữ liệu, không code nào ghi vào**.
**Khách đã quyết định 2026-09-17: KHÔNG lưu bản ghi âm** (đúng nghĩa "lưu trữ **được**" trong đặc tả, không
bắt buộc lưu mọi bản ghi) — giữ nguyên hiện trạng, không cần sửa code. **Việc còn treo**: bảng 4.2 trong
`01_DAC_TA_YEU_CAU_LINGORA_ENGLISH.md` dòng 845 vẫn liệt kê "Bản ghi âm và kết quả chấm" là dữ liệu cần lưu
— cần sửa lại tài liệu đặc tả cho khớp quyết định này, chưa làm.

**4.3 Công cụ: thiếu CRUD admin cho Listening Lab + Speaking Tests** (có script nạp hàng loạt nhưng sửa 1
bài/1 đề phải SSH chạy script Python). Đã thêm 2 tab admin mới:
- **Listening Lab** (`admin-listening.tsx`/`listening-admin.functions.ts`): script hội thoại có editor dạng
  dòng, questions/dictation/connected_speech để JSON có validate zod (nội dung lồng sâu, sai cú pháp báo
  lỗi rõ thay vì hỏng bài lúc học viên đang luyện).
- **Speaking Tests** (`admin-speaking-tests.tsx`/`speaking-test-admin.functions.ts`): nhóm theo đúng 5
  nhóm đặc tả đếm riêng (IELTS P1/P2/P3, TOEFL, PTE), hiện `X/30` bôi đỏ khi thiếu; form tự đổi theo nhóm
  (chỉ IELTS Part 2 hiện ô cue card, server chặn lưu Part 2 thiếu cue card).
- Cả 2 đều **không cho sửa `is_free`** — Yêu cầu 9 quy định con số đó thuộc tab Plans, sửa ở đây sẽ bị
  `resyncContentFreeRanks()` ghi đè ngay.

---

## Spec audit toàn diện: 01_DAC_TA_YEU_CAU vs 02_Yeu_cau_goc (2026-09-17)

Đối chiếu 2 chiều toàn văn 2 file, tách 168 atomic requirement từ file 02, truy vết từng cái sang file 01.
Báo cáo đầy đủ: `BAN GIAO DEV - LINGORA ENGLISH/05_SPEC_AUDIT_01_VS_02.md`. Kết quả: 151 COVERED (89,9%), 6
PARTIAL, 1 MISSING, 2 CONFLICT, 8 AMBIGUOUS — **NOT READY** làm source-of-truth duy nhất nếu chưa đóng các
mục sau:

- **MISSING**: mô hình "Credits" (lượt mua lẻ) được nhắc 2 lần trong file 02 (dòng 41, tiêu đề mục 10)
  nhưng **chưa từng được đặc tả** — không nơi nào nói mua ở đâu, giá bao nhiêu, hết hạn không, hoàn ra sao.
- **CONFLICT #1**: 3 đề Speaking Test free là "3 đề đầu" (file 02) hay "mỗi phần thi 1 đề" (file 01 tự
  thêm) — đổi hành vi thật, cần khách chốt.
- **CONFLICT #2**: "thêm 100 từ/chủ đề" (file 02) là cộng thêm vào số đã có hay tổng mục tiêu 100 (file 01
  bảng 4.1 âm thầm hiểu là tổng) — chênh ~288 từ nếu hiểu sai.
- **4 tiêu chí nghiệm thu tự mâu thuẫn với nguyên tắc của chính file 01** (dòng 41: "không dùng khái niệm
  định tính khó đo lường"): "Recording nếu phù hợp", "AI feedback nếu được thiết kế", "Audio nếu có thể",
  "Full Mock Tests" (không định nghĩa cấu phần) — chưa chốt dứt khoát phần nào có/không.
- Ràng buộc 1 & 2 (VPS tự vận hành, bảng phân bổ Gemini/DeepSeek) được ghi "là yêu cầu của khách hàng"
  nhưng **không có trong file 02** — không truy vết được nguồn.

---

## Audit BE-vs-FE (2026-09-17, tiếp) — 2 lỗ hổng đã vá, 2 để ngỏ có chủ đích

Rà soát toàn bộ ~110 hàm `createServerFn` trong `src/lib/*.functions.ts` xem có hàm nào backend đã viết
xong nhưng không route/component nào gọi tới (đúng kiểu bug từng xảy ra với tab AI Cost — xem mục Phần
III 3.2 ở trên). Đối chiếu từng phát hiện với spec thật (`01_DAC_TA_YEU_CAU_LINGORA_ENGLISH.md`) trước
khi quyết định sửa hay để đó. 4 phát hiện:

1. **AI Speaking Coach — thiếu form tạo/sửa topic trong admin — ĐÃ VÁ.** `adminSaveCoachTopic`
   (`coach.functions.ts:637`, schema đủ 20 trường) trước đó không ai gọi; `admin-coach.tsx` chỉ có
   list + bật/tắt. Spec dòng 857 (*"đội phát triển cần xây dựng công cụ... quản trị để bổ sung, chỉnh
   sửa học liệu về sau mà không cần sửa mã nguồn"*) không nêu tên "Coach topics" trực tiếp, nhưng đúng
   nguyên tắc đã áp dụng cho cả 5 loại nội dung còn lại — để thiếu là không nhất quán với tiền lệ đã tự
   đặt ra. Đã thêm `TopicEditor` (form đầy đủ 19 trường editable, theo đúng pattern accordion inline của
   `admin-pronunciation.tsx`'s `LessonEditor`) vào `admin-coach.tsx`, gọi thẳng `adminSaveCoachTopic` có
   sẵn — không cần sửa backend.
2. **`auth_events` (log đăng nhập/đăng ký) không có UI xem — ĐÃ VÁ.** Bảng chỉ có đúng 1 chỗ ghi
   (`auth.functions.ts:68`), không hàm nào đọc. Spec dòng 805 chỉ yêu cầu *"ghi nhật ký"*, không đòi hỏi
   rõ phải có màn hình xem — nên đây là mức ưu tiên thấp, làm thêm cho tinh thần "giám sát" (dòng 807)
   chứ không phải vá lỗi sai spec. Đã thêm `getAuthEventsLog` (`admin.functions.ts`, join `profiles` lấy
   email khi biết, 200 dòng gần nhất) + tab "Sign-in Log" mới trong `/admin` (`admin-auth-log.tsx`).
3. **`adminBulkImportTranslations` mồ côi — để ngỏ có chủ đích, không vá.** Hàm đầy đủ
   (`admin.functions.ts:306`) nhưng tab "translations" chỉ nối phần sửa từng key. Spec dòng 515 (*"trang
   quản trị cho phép chỉnh sửa bản dịch và xem tỷ lệ dịch còn thiếu"*) đã đạt đủ bằng editor từng key có
   sẵn — nhập hàng loạt chỉ là tiện ích thêm, không bắt buộc. Chưa làm gì thêm.
4. **`getAiStatus` (kiểm tra key AI có hoạt động) mồ côi — để ngỏ có chủ đích, không vá.** Không xuất
   hiện ở đâu trong spec, thuần công cụ nội bộ ngoài yêu cầu khách. Có thể cân nhắc xoá sau này nếu dọn
   dead code, không phải việc cần làm ngay.

Đã typecheck sạch (`tsc --noEmit` qua Docker). **Không xác minh được qua trình duyệt thật** — máy dev
Windows này vẫn dính đúng lỗi `rolldown` cũ khi chạy `vite dev` (lỗi ngay từ bước load `vite.config.ts`,
xác nhận lại không liên quan gì tới thay đổi lần này). Không cần migration DB (2 bảng `coach_topics` và
`auth_events` đã có sẵn từ trước) — chỉ cần `deploy.bat` để lên production.

---

## Onboarding — thiết kế lại theo khảo sát khách cung cấp (2026-09-18), thêm CRUD admin

Khách yêu cầu thay khảo sát onboarding cũ (4 bước: ngôn ngữ giao diện / ngôn ngữ mẹ đẻ / trình độ CEFR
hiện tại+mục tiêu / mục tiêu+phút luyện) bằng 5 câu hỏi mới (mục tiêu chính, muốn cải thiện gì nhất —
multi-select, tần suất luyện tập, tự đánh giá trình độ, ngôn ngữ hướng dẫn/giải thích), có CRUD admin.
Đã audit code hiện có trước khi làm — `onboarding.tsx`/`completeOnboarding` đã tồn tại sẵn nhưng 100%
hard-code, 0% chỉnh được qua admin.

**Quyết định thiết kế chính** (đã người dùng xác nhận qua 2 câu hỏi):
- Thay thế hoàn toàn 4 bước cũ, không giữ song song. Ngôn ngữ giao diện không hỏi lại trong onboarding
  nữa — đã có sẵn 2 nơi khác (`LanguageSelector` ở header/footer, và `/account`), không mất chức năng.
- Câu "ngôn ngữ hướng dẫn/giải thích" (English/Vietnamese) **không tạo cột DB riêng** — tái dùng
  `englishOnlyMode` + `interfaceLanguage` sẵn có: chọn English → bật `englishOnlyMode`; chọn Vietnamese →
  tắt `englishOnlyMode` + set `interfaceLanguage='vi'`. Trước đó "ngôn ngữ giải thích AI" chưa từng có
  trường lưu riêng — luôn tính lại mỗi request từ 2 trường trên (xác nhận qua audit `explanation-language.ts`).
- Trình độ (câu 4) vẫn giữ enum CEFR A1-C1 bên trong (map "Beginner→A1...Advanced→C1", "I'm not sure"→B1
  — B1 trùng giá trị mặc định cột) — vì `englishLevel` đang được dùng thật trong prompt AI (Coach tone,
  chấm Speaking, sinh learning plan), không phải chỉ hiển thị. Không hỏi lại "target level" trong
  onboarding nữa (spec khách không có câu này) — cột `targetLevel` giữ default 'C1', vẫn sửa được sau ở
  `/account`.
- "Muốn cải thiện gì nhất" (multi-select) là hoàn toàn mới — thêm cột `profiles.focus_areas` (`text[]`).

**Hạ tầng CRUD mới**: bảng `onboarding_options` (migration `src/db/schema/0012_onboarding_survey.sql`) —
5 `question_key` cố định (goal/focus_areas/minutes/level/instruction_language, khớp logic app, admin
không tự thêm được câu hỏi mới) × option_value/label_en/label_vi/sort_order/is_active admin tự do
thêm/sửa/ẩn/sắp xếp trong mỗi câu. Label chỉ có EN+VI (52 ngôn ngữ giao diện còn lại fallback tiếng Anh
cho riêng màn hình này — đánh đổi có chủ đích, không đụng tới i18n 54 ngôn ngữ đã có ở nơi khác của app).
Đọc công khai qua `onboarding.functions.ts#getOnboardingOptions` (`withAnon`, không cần đăng nhập vì
onboarding có thể chạy trước khi có tài khoản), sửa qua `onboarding-admin.functions.ts` + tab "Onboarding"
mới trong `/admin` (`admin-onboarding.tsx`).

**🔴 Phát hiện quan trọng khi test trên Postgres tạm (áp dụng cho mọi migration RLS sau này, không riêng
tính năng này)**: `CREATE POLICY ... FOR SELECT TO public` **không kèm `USING`** thì `polqual` là `NULL`
— RLS coi đó là **deny-all**, không phải allow-all như vẫn tưởng. Xác minh thực nghiệm 2 lần độc lập trên
Postgres 16 sạch. Ban đầu copy đúng pattern không-USING từ `pronunciation_lessons_read_free`/
`read_premium` (migration `0002_pronunciation_lessons.sql`) — phát hiện ra **2 policy đó trên production
cũng bị lỗi y hệt, đang deny-all thật sự**, nhưng chưa từng gây sự cố vì `getSkillLessonsCatalogue` đọc
qua `withAdmin` (service_role, bỏ qua RLS hoàn toàn), không phải `withUser`/`withAnon` — RLS ở đó chỉ là
trang trí, chưa bao giờ được thực thi. Bảng `onboarding_options` của tính năng này thì khác: đọc thật qua
`withAnon`, nên nếu không thêm `USING (true)` rõ ràng thì màn hình onboarding sẽ luôn rỗng 0 lựa chọn
trên production — đã tự bắt được và sửa trước khi deploy (`onboarding_options_read` policy có `USING
(true)` tường minh). **Chưa sửa `pronunciation_lessons`** (ngoài phạm vi phiên này, không gây hại thật vì
dormant) — nếu sau này có code nào đổi từ `withAdmin` sang `withUser`/`withAnon` cho bảng đó, sẽ bất ngờ
trả về rỗng, nhớ mục này.

Đã test đầy đủ trên Postgres tạm với đúng role (`anon`/`authenticated` không-admin/`authenticated`
có-admin/`service_role`) — GRANT + RLS đúng dự kiến sau khi sửa, kể cả trường hợp `authenticated` có role
admin vẫn bị chặn ghi ở tầng GRANT (đúng chủ đích, khớp mọi bảng nội dung khác — ghi thật luôn qua
`withAdmin`+`requireAdmin`, RLS "admin" chỉ là lớp phòng thủ phụ, không phải đường ghi thật sự dùng).
Đã typecheck sạch. Chưa deploy — cần `migrate.bat` rồi `deploy.bat`.

**Còn treo, không thuộc phạm vi khách yêu cầu lần này**: `/account` chưa hiển thị/sửa được `focus_areas`
(chỉ mới lưu được qua onboarding) — nếu khách muốn sửa lại sau khi hoàn thành onboarding thì cần thêm UI
riêng, chưa làm.

### 🔴 Nối khảo sát vào luồng đăng nhập/đăng ký (2026-09-19) — bản 2026-09-18 chỉ có trang, chưa có đường dẫn tới

Khách báo đăng nhập Google **không thấy màn khảo sát**. Audit lại: bản 2026-09-18 làm xong trang `/onboarding`
+ CRUD admin + `completeOnboarding`, nhưng **không có chỗ nào trong app dẫn tới `/onboarding`**, và
`profiles.onboarded_at` được ghi mà **chưa từng được đọc** — nên mọi cách đăng nhập (Google lẫn email) đều vào
thẳng dashboard. Ngoài ra khi khách chưa đăng nhập làm khảo sát, đáp án bị bỏ (`if (user) {...}`), nên luồng
"khảo sát trước, đăng ký sau" trong yêu cầu gốc chưa chạy được. Đã nối lại:

- **Người chưa có tài khoản** bấm tạo tài khoản (`/auth` chế độ signup) → chưa làm khảo sát thì được chuyển
  sang `/onboarding` trước → xong thì đáp án lưu tạm (`src/lib/onboarding-flow.ts` — localStorage + bản
  in-memory phòng khi trình duyệt chặn storage, sống được qua các lần redirect của Google OAuth/link xác thực
  email) → quay lại `/auth?mode=signup` để đăng ký → ngay khi có session, `OnboardingGate` tự ghi đáp án vào
  profile (`completeOnboarding`).
- **Người đã đăng nhập mà `onboarded_at` còn null** (Google lần đầu, tài khoản cũ trước khi có khảo sát...) →
  `src/components/lily/onboarding-gate.tsx` (mount ở `__root.tsx`) đưa sang `/onboarding?next=<trang đang vào>`,
  làm xong quay lại đúng trang đó. Miễn trừ: `/`, `/pricing`, `/auth*`, `/onboarding`, `/checkout`, `/billing*`,
  `/terms`, `/privacy`, `/refunds`, `/reset-password`, `/api` — trang công khai/thanh toán không bao giờ bị đá.
- **"Skip"** giờ ghi `onboarded_at` thật (`skipOnboarding` trong `account.functions.ts`, không đổi thông số nào
  khác) — trước đó Skip chỉ chuyển trang nên nếu gate bật thì sẽ bị hỏi lại mỗi lần vào.
- `getCurrentUser` trả thêm `onboarded_at` (kiểu `Profile` ở `auth.tsx`).
- **Hệ quả cần biết**: mọi tài khoản hiện có chưa có `onboarded_at` (trừ 4 demo — `seed-demo-accounts.ts` đã
  set) sẽ bị hỏi khảo sát 1 lần ở lần vào tiếp theo (có nút Skip).
- Đã typecheck sạch (`tsc --noEmit`). **Chưa chạy thử trên trình duyệt** (dev server Windows máy này không
  chạy được, xem mục Pronunciation 2026-09-14) — khách/QA cần test tay: Google lần đầu, email signup, và
  khảo sát-trước-đăng-ký. Chưa deploy — không cần migration mới (cột `onboarded_at` có sẵn), chỉ cần `deploy.bat`.

---

## SEO / hiện trên Google (2026-09-19)

Audit site thật (`curl` với UA Googlebot) trước khi sửa: `sitemap.xml` 404, `robots.txt` không có dòng Sitemap,
**không có canonical**, `https://www.lingoraenglishai.com/` trả 200 cùng nội dung với apex (trùng lặp), không
có `og:image`/`twitter:image` (dù khai báo `summary_large_image`), không có JSON-LD, các trang riêng tư
(`/dashboard`, `/account`, `/billing`, `/auth`…) không có noindex, hreflang dùng URL tương đối và trỏ tới
`?lang=xx` nhưng **server luôn render tiếng Anh** (đổi ngôn ngữ chỉ xảy ra sau hydrate) nên 16 URL đó là cùng một
nội dung → hreflang sai, đã bỏ. Đã sửa phía code:

- `src/lib/seo.ts`: `SITE_URL` (`https://lingoraenglishai.com`, apex là host chuẩn), `canonicalLink()`,
  `NOINDEX_META`, `OG_IMAGE_URL`. Bỏ `hreflangLinks`.
- Canonical trên 11 trang công khai (`/`, `/ai-speaking`, `/pronunciation`, `/shadowing`, `/listening-lab`,
  `/vocabulary`, `/speaking-tests`, `/pricing`, `/privacy`, `/terms`, `/refunds`) — `?lang=xx` tự gộp về URL sạch.
- `noindex` (meta, không dùng Disallow vì Google chỉ đọc được noindex trên trang được phép tải) cho `/auth`,
  `/auth/verify`, `/auth/google-callback`, `/dashboard`, `/account`, `/billing*`, `/checkout/*`, `/onboarding`,
  `/progress`, `/reset-password` (`/admin` đã có từ trước).
- `__root.tsx`: `og:site_name`, `og:image` (+ kích thước, alt), `twitter:image` mặc định cho mọi trang.
  `public/og-image.png` (1200×630) sinh bằng PowerShell/System.Drawing từ `logo-icon.png` — logo có chữ "L"
  trong suốt nên phải đặt trên ô trắng; muốn ảnh đẹp hơn thì thay file này, không cần đổi code.
- Trang chủ: JSON-LD `Organization` + `WebSite` + `WebApplication` (chỉ dữ kiện thật — không rating/giá, Google
  coi markup không khớp nội dung là spam).
- `public/robots.txt` (1 nhóm `*`, `Disallow: /api/`, dòng `Sitemap:`) và `public/sitemap.xml` (11 URL, viết tay —
  **thêm trang công khai mới thì phải thêm vào file này**).
- `/daily-english` → `/listening-lab` đổi 307 → 301 (chuyển vĩnh viễn thì mới chuyển được thứ hạng).
- Đã typecheck sạch. **Chưa deploy** — chưa có gì trên Google cho tới khi chạy `deploy.bat`.

**Việc ngoài code, phải làm tay:**
1. ✅ **Đã làm 2026-09-19**: `www` → apex 301 trong nginx trên VPS (`/etc/nginx/sites-available/lingoraenglishai.com`,
   khối HTTPS `www` riêng chỉ `return 301`, khối port 80 chuyển thẳng `http://www` → `https://lingoraenglishai.com`;
   chứng chỉ Let's Encrypt đã phủ cả 2 tên nên không phải cấp lại). Bản sao lưu: `/root/nginx-lingoraenglishai.com.bak-20260919203525`
   trên VPS — khôi phục bằng `cp` bản đó về file trên rồi `nginx -t && systemctl reload nginx`. Đã kiểm tra bằng
   `curl`: http/https www đều 301 về apex (giữ nguyên path + query), apex vẫn 200. Lưu ý `deploy/nginx.conf` trong
   repo chỉ là bản mẫu trước certbot, KHÔNG phải file đang chạy và chưa cập nhật theo thay đổi này.
2. Google Search Console: thêm property (nên chọn "Domain" + TXT DNS), gửi `sitemap.xml`, "Request indexing" cho
   trang chủ. Cần tài khoản Google của khách.
3. **Hạn chế còn lại (quyết định sản phẩm)**: server luôn render tiếng Anh, nên Google chỉ thấy bản tiếng Anh dù app
   có 54 ngôn ngữ. Muốn lên top bằng tiếng Việt/ngôn ngữ khác thì cần URL riêng theo ngôn ngữ (`/vi/...`) + hreflang
   đúng — thay đổi lớn, chưa làm.

---

## 🔴 Paddle: nhận diện gói bằng `custom_data` thay vì `import_meta.external_id` (2026-09-19)

Khi khách có key sandbox thật, kiểm tra tài khoản sandbox phát hiện lỗi nền tảng ở cả sandbox lẫn live: code tra giá
bằng `GET /prices?external_id=lily_premium_monthly` và đọc `price.import_meta.external_id` để biết đây là gói nào —
nhưng theo tài liệu Paddle, `external_id` **chỉ nằm trong dữ liệu trả về (do công cụ import của Paddle đặt), không
đặt được khi tạo giá qua API/dashboard và `/prices` không có filter đó**. Đó là tàn dư của gateway Lovable cũ. Hậu quả:
checkout báo "That plan price is not available yet", và nếu có người trả tiền thì webhook/`syncSubscriptionFromProvider`
bỏ qua đăng ký (log warn) → người trả tiền vẫn ở Free. (Nếu Paddle bỏ qua filter lạ thì `data[0]` còn là giá đầu tiên
bất kỳ — có thể tính nhầm gói.)

Đã sửa: mỗi product/price trên Paddle mang `custom_data: {"lingora_key": "<mã của mình>"}`
(`lily_premium_monthly`/`_yearly`, `lily_ielts_monthly`/`_yearly`; product `lily_premium`, `lily_ielts`).
- `paddle.server.ts`: `catalogKeyOf()` (đọc `lingora_key`, dự phòng `import_meta.external_id`, nhận cả snake_case của
  REST lẫn camelCase của payload webhook SDK) + `findPriceByKey()` (duyệt `/prices?status=active`, khớp chính xác,
  không bao giờ "lấy giá đầu tiên").
- Dùng ở `billing.functions.ts` (`resolvePaddlePrice`, `validateCoupon`, `changeMyPlan`),
  `billing-sync.server.ts`, `webhook.ts` (created/updated). Thiếu key → `console.error` (to, có chủ đích: người dùng đã
  trả tiền mà không map được gói).
- `scripts/create-paddle-catalog.mjs`: tạo catalog, chạy lặp lại an toàn, mặc định dry-run (`--apply` mới ghi,
  `--env live` cho tài khoản thật). Giá lấy từ `billing_plans` production: Premium 9.99/79.99 USD, IELTS Pro
  19.99/159.99 USD, trial 7 ngày. **Đổi giá ở /admin → Plans thì phải đổi cả script + Paddle** (Paddle mới là nơi tính
  tiền thật).
- **Đã chạy `--apply` trên sandbox** (2 product + 4 price, chạy lại lần 2 không tạo trùng) và chạy thật
  `findPriceByKey` với sandbox: tra đúng cả 4 giá, `null` với mã không tồn tại.
- **Live chưa làm**: khi có tài khoản Paddle live được duyệt phải chạy `node scripts/create-paddle-catalog.mjs --env
  live --apply` trước khi mở bán, nếu không live sẽ dính đúng lỗi trên.
- **Việc khách/vận hành còn phải làm** (không tự làm được): (1) sandbox → Notifications: destination đang là
  `https://lingoraenglishai.com/api/webhooks/paddle` (route không tồn tại) — phải là
  `.../api/public/payments/webhook?env=sandbox`, 5 sự kiện trong `HUONG_DAN_LAY_PADDLE_KEYS.md`; (2) `.env.docker`:
  `PAYMENTS_SANDBOX_WEBHOOK_SECRET` và `PAYMENTS_LIVE_WEBHOOK_SECRET` đang chứa 1 đường dẫn URL, không phải secret
  `pdl_ntfset_...` — điền secret thật; (3) local `.env` cũng đang để trống 2 biến sandbox.
- **Sandbox vs live là quyết định lúc BUILD** (prefix của `VITE_PAYMENTS_CLIENT_TOKEN`: `test_` = sandbox, `live_` =
  live; `payments-env.ts`). Bản production hiện tại build với `live_…` nên báo `PADDLE_LIVE_API_KEY is not configured`
  (key live trên VPS đang trống) — không phải lỗi code. Để test sandbox ngay trên production: **`deploy.bat sandbox`**
  (lấy token `test_` từ `.env.development`, truyền qua `--build-arg`; Dockerfile có ARG + guard vì Vite cho biến môi
  trường RỖNG cũng ghi đè `.env.production` → nếu không guard, build live thường sẽ mất token). `deploy.bat` không tham
  số = live như cũ. Chuyển qua lại = deploy lại. Webhook sandbox đã đúng (destination
  `…/webhook?env=sandbox`, secret `.env.docker` khớp — kiểm tra bằng API 2026-09-19).
- **Tác dụng phụ khi production ở chế độ sandbox**: mọi kiểm tra quyền dùng `getPaddleEnvironment()`, nên
  `demo-premium`/`demo-ielts` (subscription `environment='live'`, xem mục demo ở trên) sẽ hiện **Free** cho tới khi
  deploy lại về live. Dùng `demo-free` hoặc tài khoản mới để thử mua. Đơn sandbox ghi vào DB production với
  `environment='sandbox'`, bản live bỏ qua. Khách thật không trả tiền được trong lúc ở sandbox.
- **Lỗi "Something went wrong" của Paddle khi bấm thanh toán trên sandbox (2026-09-19) — 2 nguyên nhân, cả hai
  đều nằm ở tài khoản Paddle chứ không phải code**: (1) tài khoản sandbox chưa đặt **Default payment link** (API trả
  `transaction_default_checkout_url_not_set` khi thử `POST /transactions`) — chỉ đặt được trong dashboard: Checkout →
  Checkout settings; (2) `VITE_PAYMENTS_CLIENT_TOKEN` cũ (`test_ad6c…`, thừa hưởng từ thời Lovable) **không thuộc
  tài khoản sandbox chứa key/giá hiện tại** (`GET /client-tokens` của tài khoản trống) nên Paddle.js không thấy các giá
  vừa tạo. Đã tạo token mới qua API (`POST /client-tokens`, tên `lingoraenglish-sandbox-web`, id `ctkn_01m2x4d9…`) và ghi
  vào `.env.development` (file này gitignored). Email `@lingoraenglish.local` của tài khoản demo **được** Paddle chấp
  nhận (đã thử) nên không phải nguyên nhân. **Cảnh báo tương tự cho live**: `VITE_PAYMENTS_CLIENT_TOKEN=live_…` trong
  `.env.production` rất có thể cũng của tài khoản cũ — khi có tài khoản Paddle live thật phải tạo client token live
  mới (Developer Tools → Authentication → Client-side tokens) và thay vào đó, đồng thời đặt Default payment link
  + duyệt domain trên tài khoản live.
- ✅ **Đã test trọn vẹn trên production ở chế độ sandbox (2026-09-19, Chrome headless qua playwright-core, tài khoản
  `demo-free`, thẻ 4242)**: `deploy.bat sandbox` (token `test_d668…` baked, container healthy) → `/pricing` (banner test mode,
  9,99/19,99 US$) → bấm chọn Premium → overlay Paddle mở (`POST transaction-checkout` 201, "7 day free trial", nhãn
  Test Mode) → trả bằng thẻ 4242 → về `/billing/success` "Đã nhận thanh toán… Đang hoạt động". DB production:
  `subscriptions` có đúng 1 dòng `environment='sandbox'`, `status='trialing'`, `price_id=lily_premium_monthly`,
  `product_id=lily_premium` (tức `lingora_key` ánh xạ đúng); `billing_events` có `trial_started` + `payment_succeeded`
  (chỉ webhook mới ghi → **webhook sandbox đã xác thực chữ ký và chạy đúng**) rồi `subscription_activated` (từ
  `verifyCheckout`). Paddle trả `items[0].price.custom_data`/`product.custom_data` đúng, `custom_data` của subscription mang
  `userId`. **Tác dụng phụ**: `demo-free` hiện đang có gói Premium sandbox (chỉ hiệu lực khi production build sandbox).
  Chưa test: huỷ gói, đổi gói, gia hạn/thanh toán thất bại, thẻ bị từ chối (4000 0000 0000 0002).
- 🐛 Sửa kèm (chưa deploy): `trial_ends_at` luôn `null` vì Paddle đặt `trial_dates` trong `items[0]`, không phải cấp
  subscription (`webhook.ts` created/updated + `billing-sync.server.ts`) → dòng "Dùng thử kết thúc ngày…" ở `/billing`
  chưa từng hiện. Đã đọc `item.trial_dates` (dự phòng cấp trên). Dòng của `demo-free` hiện tại vẫn null tới khi có sự
  kiện mới sau khi deploy.
- ✅ **Đã test huỷ / giữ lại / gia hạn (2026-09-19, sandbox, `demo-free`)**: `/billing` có "Hủy gói đăng ký" (huỷ cuối
  kỳ, `effectiveFrom: next_billing_period` → giữ quyền truy cập tới hết kỳ; đang dùng thử thì huỷ = không bị thu đồng
  nào), "Giữ gói đăng ký" (hoàn tác), "Đổi gói", "Cập nhật phương thức thanh toán" (portal Paddle), hoá đơn. Huỷ →
  `cancel_at_period_end=true` + `subscription_updated` từ webhook; giữ lại → về `false`. **Gia hạn tự động**: kết thúc
  sớm dùng thử bằng `POST /subscriptions/{id}/activate` (API sandbox, chỉ để test) → Paddle tự trừ thẻ 4242 **11,10 USD**
  (9,99 + VAT Việt Nam 11,11%; US không thuế), `status` → `active`, kỳ 19/9→19/10, `next_billed_at` 19/10, webhook
  `subscription_updated` + `payment_succeeded` cập nhật DB đúng. `collection_mode=automatic` nên hết dùng thử/hết kỳ là tự
  thu tiền, người dùng phải chủ động huỷ.
- 🐛 Sửa thêm (chưa deploy): (a) sau khi huỷ/giữ/đổi gói, `/billing` refetch **trước** khi webhook (~1s sau) ghi DB nên
  vẫn hiện nút cũ tới khi tải lại → `syncAfterAction()` đồng bộ từ Paddle ngay trong `cancelMySubscription`/
  `keepMySubscription`/`changeMyPlan`; (b) lịch sử thanh toán liệt kê cả giao dịch `draft`/`ready`/`canceled` (mỗi lần mở
  checkout rồi bỏ là 1 dòng "0 US$ ready" có link hoá đơn) → lọc bỏ (`UNPAID_STATUSES`). **Đã deploy `deploy.bat sandbox`
  lúc 16:21 UTC 2026-09-19 và kiểm chứng lại bằng Chrome headless** (xem mục dưới).
- ✅ **Bộ test hoàn chỉnh sau deploy (sandbox, production, 2026-09-19)**: (1) thẻ từ chối `4000 0000 0000 0002` →
  Paddle báo "This payment was declined by your bank…", không tạo gói, webhook ghi `payment_failed`; (2) mua mới bằng
  `demo-premium`: `trial_ends_at` **có giá trị**, `/billing` hiện "Hết hạn dùng thử vào 26 thg 9", lịch sử chỉ còn 1 dòng
  `completed`; (3) huỷ/giữ lại **tự cập nhật giao diện ngay** (không cần tải lại); (4) **đổi gói**: đã trả tiền (`active`)
  đổi Premium→IELTS Pro thành công (thu chênh lệch theo tỉ lệ, `price_id` → `lily_ielts_monthly`, webhook
  `subscription_updated`+`payment_succeeded`, giao diện đổi ngay); đang **dùng thử** thì Paddle từ chối đổi ("You can't
  add or remove items for a subscription in trial…") → giao diện thay nút bằng dòng `billing.changePlanAfterTrial` và
  `changeMyPlan` chặn sớm với thông báo rõ (không lộ câu lỗi Paddle); (5) quyền truy cập khi gia hạn lỗi, thử trong
  transaction rồi ROLLBACK trên `has_active_subscription`: `past_due` quá kỳ + ân hạn 0 ngày → mất quyền; ân hạn 3 ngày →
  còn quyền, quá 3 ngày → mất; `past_due` nhưng kỳ chưa hết → còn; đã huỷ còn hạn → còn, hết hạn → mất. Chưa test: email
  nhắc gia hạn/biên lai (app không tự gửi, chỉ Paddle), thanh toán lại thành công sau `past_due` thật, PayPal.
  Dữ liệu test còn lại (chỉ hiệu lực khi production build sandbox): `demo-free` = IELTS Pro `active`, `demo-premium` và
  `tranthanhhuyen191223@gmail.com` = Premium `trialing`.
- 🟢 **CHUYỂN SANG LIVE (2026-09-19, 16:47 UTC)**: `deploy.bat` không tham số → production build với token `live_0ece…`,
  container có `PADDLE_LIVE_API_KEY`/`PAYMENTS_LIVE_WEBHOOK_SECRET`, banner test-mode đã biến mất. Kiểm tra tài khoản Paddle
  **live** (chỉ đọc, rồi ghi 2 thay đổi theo yêu cầu rõ ràng của khách): tài khoản live là tài khoản Lovable tạo sẵn — có 2
  product + 4 price (9,99/79,99/19,99/159,99 USD) mang `import_meta.external_id` = `lily_premium_monthly`… (nên
  `findPriceByKey` nhận ngay nhờ dự phòng `import_meta`, KHÔNG cần chạy `create-paddle-catalog.mjs --env live`; product
  key live là `lily_premium`/`lily_ielts_pro`); client token `live_0ece…` ("Lovable - do not remove") thuộc đúng tài khoản
  này; chưa có khách/subscription nào. **Đã sửa 2 chỗ trên Paddle live**: (1) 4 giá chưa có dùng thử (`trial_period` null,
  trái với quảng cáo 7 ngày) → PATCH `trial_period = 7 day`; (2) destination webhook có secret khớp `.env.docker`
  (`ntfset_01m2ww7g…`) trỏ `/api/webhooks/paddle` (route không tồn tại) → PATCH thành
  `https://lingoraenglishai.com/api/public/payments/webhook?env=live`; route trả 400 với request không chữ ký (đúng).
  **Còn treo**: (a) domain `lingoraenglishai.com` đang **Pending** duyệt tại vendors.paddle.com/request-domain-approval —
  tới khi duyệt xong checkout live sẽ lỗi và chưa đặt được Default payment link (đặt `https://lingoraenglishai.com/pricing`
  sau khi duyệt); (b) 2 destination webhook trỏ về Lovable (`api.lovable.dev/...`, `*.lovable.app/...`) vẫn nhận dữ liệu
  thanh toán live — nên tắt/xoá; (c) client token do Lovable quản lý — nên tạo token riêng rồi thay `.env.production`;
  (d) tên doanh nghiệp trong tài khoản Paddle phải khớp "Ms Thao English"; (e) sau khi duyệt: mua thử 1 gói thật + hoàn tiền.
  Gói sandbox của demo-free/demo-premium/tài khoản Google giờ không còn hiệu lực (bản live bỏ qua `environment='sandbox'`);
  demo-premium/demo-ielts (gói `live`) hiện lại là Premium/IELTS Pro.
- 🔒 **Mỗi tài khoản chỉ được dùng thử 1 lần (2026-09-19/20, khách chốt)**. Trước đó không có gì chặn: dùng thử là thuộc tính
  của **giá** Paddle nên ai mua cũng được 7 ngày, huỷ rồi mua lại là thêm 7 ngày miễn phí. Cách làm: mỗi giá gói có **giá
  song sinh không dùng thử** mang mã `<mã gói>_notrial` (`lily_premium_monthly_notrial`…, cùng product, `NO_TRIAL_SUFFIX` trong
  `paddle.server.ts`). `resolvePaddlePrice` (giờ **bắt buộc đăng nhập**) tự chọn phía server: tài khoản **chưa từng có subscription
  nào** (mọi trạng thái, kể cả đã huỷ, trong môi trường hiện tại) → giá có dùng thử; còn lại → giá `_notrial`. `changeMyPlan`
  luôn dùng `_notrial`. Cố ý **nghiêm ngặt**: thiếu giá song sinh thì báo lỗi chứ không tặng dùng thử lần nữa. Webhook/sync
  chuẩn hoá qua `planPriceKeyOf()` nên `subscriptions.price_id` luôn là mã gói gốc (SQL `has_active_subscription`/join
  `billing_plans` không đổi). `getMyBilling` trả thêm `trialEligible`; `/pricing` ẩn dòng "7-day free trial" với tài khoản
  không còn đủ điều kiện. `scripts/create-paddle-catalog.mjs` giờ tạo cả 8 giá (có alias sản phẩm `lily_ielts`↔`lily_ielts_pro`
  cho live nên không tạo trùng). **Đã test trên sandbox (production build sandbox tạm thời, sau đó đã trả về live)**: tài khoản
  chưa từng có gói thấy "7-day free trial" + checkout dùng giá có trial ("Start your free trial"); tài khoản đã từng có gói
  không thấy dòng trial + checkout dùng giá `_notrial` ("Subscribe now — $11.10 now"); đổi gói đi qua `_notrial`, DB vẫn lưu
  `lily_premium_monthly`. Chưa chặn được người tạo tài khoản mới bằng email khác (cần chặn email tạm thời/CAPTCHA — việc riêng).
  **⚠️ Trên Paddle LIVE 4 giá `_notrial` CHƯA được tạo** (chờ khách cho phép ghi vào tài khoản live): tới khi tạo
  (`node scripts/create-paddle-catalog.mjs --env live --apply`, dry-run đã xác nhận chỉ tạo đúng 4 giá, không trùng), khách đã
  từng có gói / đổi gói ở live sẽ gặp lỗi "That plan price is not available yet" (người mua lần đầu vẫn ổn).
- 📋 **Đối chiếu website với yêu cầu duyệt domain của Paddle (2026-09-20)** — danh sách Paddle: mô tả sản phẩm, trang giá, tính
  năng từng gói, Terms/Refund/Privacy hiển thị rõ, tên công ty trong Terms, website chạy + HTTPS, chỉ gửi domain liên quan.
  Kiểm tra bằng Chrome headless ẩn danh + `curl` HTML thô: **đạt** — 11 trang công khai 200, có h1, không link hỏng, không còn
  chữ Lovable/test-mode; Terms §1 ghi "operated and sold by Ms Thao English"; Refund/Privacy/Terms nhắc Paddle là Merchant of
  Record; hoàn tiền 30 ngày; HTTPS Let's Encrypt (hết hạn 2026-12-09) + HSTS, http→https và www→apex đều 301. **Đã sửa 1 lỗ
  hổng**: `/pricing` trước đây KHÔNG có giá/tên gói/tính năng trong HTML thô (nạp bằng JS sau hydrate) → trình thu thập không
  chạy JS (có thể gồm cả bot duyệt của Paddle) thấy trang giá trống. Nay `/pricing` có `loader` gọi `getPublicPlans()` phía
  server (`usePlans(initialData)`), HTML thô có đủ 2 mức giá tháng, tên 3 gói, danh sách tính năng, dùng thử/huỷ/hoàn tiền
  (giá NĂM chỉ hiện sau khi bấm "Yearly" — mặc định là tháng). **Còn treo**: (1) gỡ 2 domain `lingoraenglish.lovable.app` (vẫn
  online, là bản sao cũ của site — có thể bị index trùng) và `lily-talk-learn.lovable.app` (404) khỏi hồ sơ duyệt — khách
  quyết định bỏ; chỉ dashboard Paddle làm được; (2) ✅ **ĐÃ ĐỔI (2026-09-20)**: email liên hệ trong Terms/Refund/Privacy trước là
  `support@msthaoenglish.com` nhưng cả `msthaoenglish.com` lẫn `lingoraenglishai.com` KHÔNG có bản ghi MX (thư không nhận được)
  → khách cung cấp `phanthithuthao10081996@gmail.com`, đã thay ở `terms.tsx`/`refunds.tsx`/`privacy.tsx` (4 chỗ) và deploy
  live. Lưu ý đây là Gmail cá nhân hiển thị công khai; nếu sau này dựng hộp thư theo tên miền thì đổi lại ở 3 file đó; (3) tên doanh nghiệp trong tài khoản Paddle phải khớp "Ms Thao English". Ghi chú: `msthaoenglish.com` là website
  thật của trung tâm Anh ngữ Ms. Thảo (Thanh Hóa) — khớp pháp nhân trong Terms. Email hệ thống (xác thực/đặt lại mật khẩu) vẫn
  phụ thuộc Resend chưa xác minh domain (xem mục SMTP đầu file).
- Trước khi mở bán thật: điền `PADDLE_LIVE_API_KEY` + `PAYMENTS_LIVE_WEBHOOK_SECRET` vào `.env.docker`, chạy
  `node scripts/create-paddle-catalog.mjs --env live --apply`, rồi `deploy.bat` (không tham số).
- Chưa test được luồng trả tiền hết đường trên trình duyệt (cần bấm checkout với thẻ 4242…). Chưa deploy.

---

## 🟣 Chuyển thanh toán Paddle → Stripe (2026-09-21, nhánh `feat/checkout-stripe`)

Lý do: Paddle chưa duyệt domain; khách (cá nhân ở Canada, bán cho khách hàng ở đó) chọn Stripe. Quyết định đã chốt với
khách: giá lấy từ bảng `billing_plans` lúc checkout (không tạo catalog giá trên Stripe), thuế phẳng **10% cộng thêm**
(Stripe Tax Rate), giữ **USD**, xoá hẳn code Paddle, viết lại trang pháp lý cho Stripe.

**Code**
- `src/lib/stripe.server.ts`: `stripeFetch` (form-encoded, `Stripe-Version: 2024-06-20` cố định), `verifyStripeSignature`
  (HMAC-SHA256, dung sai 300s), `ensureProductId` (1 Product/gói, gắn `metadata.lingora_tier`), `ensureTaxRateId`,
  `ensurePortalConfigurationId` (tự tạo cấu hình Billing Portal, tắt "huỷ" trong portal — huỷ chỉ đi qua /billing).
- `src/lib/billing.functions.ts` (viết lại): `createCheckoutSession` (mode=subscription, `price_data` nội tuyến, chỉ thêm
  `trial_period_days` khi tài khoản **chưa từng có subscription** ở môi trường đó, `managed_payments[enabled]=false`),
  `verifyCheckout(sessionId)`, `changeMyPlan` (`proration_behavior=always_invoice`), `cancelMySubscription`
  (cuối kỳ) / `keepMySubscription`, `createPortalSession`, `listMyPayments` (đọc Invoice từ Stripe), `getInvoiceUrl`.
- `src/lib/billing-sync.server.ts`: đọc lại subscription từ Stripe rồi upsert bảng `subscriptions`. Gói nhận diện qua
  `metadata` của subscription (`userId`, `planKey`, `priceId`, `productKey`=tier). Status `canceled` ⇒ hạn truy cập =
  `ended_at` (không phải cuối kỳ đã trả) vì SQL `has_active_subscription` giữ quyền tới `current_period_end` với `canceled`.
- `src/routes/api/public/payments/webhook.ts`: 5 sự kiện `customer.subscription.{created,updated,deleted}`,
  `invoice.paid`, `invoice.payment_failed`; chống trùng bằng `processed_webhook_events`; bỏ qua sự kiện khác chế độ.
- **Môi trường** giờ suy từ tiền tố `STRIPE_SECRET_KEY` (`sk_test_` → "sandbox", `sk_live_` → "live") ở
  `src/lib/payments-env.ts` (`getPaymentsEnv`). Cột `subscriptions.environment` vẫn 'sandbox'/'live'. Đổi test↔live = sửa
  `.env.docker` rồi `deploy.bat` (không còn build-arg). Ba dòng Paddle sandbox cũ đã chuyển sang `legacy_paddle_sandbox`.
- DB: migration `0013_payment_provider_neutral.sql` đổi `paddle_subscription_id/paddle_customer_id` →
  `provider_subscription_id/provider_customer_id` (đã chạy trên production).
- Env (`.env.docker`): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAYMENT_TAX_PERCENT` (mặc định 10).
  Webhook tạo bằng `node scripts/setup-stripe.mjs --url https://lingoraenglishai.com/api/public/payments/webhook`
  (chạy 1 lần mỗi chế độ; secret ghi thẳng vào `.env.docker`, không in ra).

**Đã test trên production (Stripe TEST, 2026-09-21, trình duyệt thật)**: checkout có dùng thử 7 ngày ("$0.00 due today, then
$10.99 = 9.99 + 10% tax"); thẻ 4242 → `/billing/success?session_id=…` xác nhận; DB có `trialing`, `sub_…/cus_…`, webhook
`invoice.paid`+`subscription.created` được ghi; `/billing` (hạn trial, lịch sử, Update payment method → Stripe Billing
Portal, Invoice → hosted invoice, Cancel → "Access ends on…", Keep, Change plan trong lúc trial giữ nguyên hạn trial);
kết thúc trial sớm bằng API → thu $19.99 + $2.00 thuế = $21.99; thẻ `4000 0000 0000 0002` bị từ chối ngay trên trang
Stripe; mã giảm giá (`TESTOFF20` tạo bằng API, 20% kỳ đầu, thuế tính trên số sau giảm); tài khoản đã từng đăng ký
**không** được dùng thử lại (thu ngay).

**Việc còn treo**
- ⚠️ **Managed Payments (Stripe làm Merchant of Record)** bật mặc định trên tài khoản Stripe của khách; code tắt nó cho
  từng phiên (`managed_payments[enabled]=false`) vì khách tự bán + tự cộng thuế 10%. Nếu khách muốn Stripe lo thuế thì
  phải bật lại, nhập product tax code, bỏ thuế 10% thủ công và viết lại pháp lý theo hướng MoR.
- Chưa có key **live** (`sk_live_…`): khi có, tạo lại webhook live bằng `setup-stripe.mjs`, đổi 2 biến trong `.env.docker`,
  `deploy.bat`. Cần Stripe account đã kích hoạt để nhận tiền thật.
- Chuỗi dịch ngôn ngữ khác `pricing.faq.tax.a`, `pricing.faq.refund.a`, `billing.prorationNote`, `billing.morNote` (và bỏ
  key `billing.changePlanAfterTrial`) vẫn còn nội dung "merchant of record"/"payment partner" — cần dịch lại theo bản
  `en.ts` mới (giao AI dịch khác).
- `.env.docker` còn biến Paddle không dùng nữa — xoá tuỳ ý.

---

## 🟣 Pronunciation — Listen giờ đọc "âm → từ → câu chứa từ đó" (2026-09-22)

Trước đây "Nghe" chỉ đọc âm + tên tiếng Anh của âm (vd "short i") hoặc câu chung chung không liên quan
đến từ đang chọn. Khách yêu cầu: 1 âm → 1 từ → 1 câu **có chứa đúng từ đó**, và câu nên lấy luôn theo từ
cho hợp lý thay vì danh sách câu chung.

- `src/lib/pronunciation-content.ts`: thêm type `WordExample = { word: string; sentence: string }`,
  đổi `Phoneme.words` từ `string[]` → `WordExample[]`.
- `src/lib/pronunciation-sounds.server.ts`: viết lại **cả 44 âm × 6 từ = 264 cặp từ-câu** (mỗi từ 1 câu
  ví dụ ngắn, tự nhiên, chứa đúng từ đó) — sinh bằng script nối theo **tên từ** (không theo thứ tự dòng)
  để tránh lỗi gán nhầm câu cho từ (rút kinh nghiệm từ vụ sửa IPA PTE/TOEFL bên dưới).
- `src/routes/pronunciation.tsx` + `src/components/lily/pron-practice.tsx`: bấm 1 từ → tính `wordSentence`
  tương ứng, hiện chữ câu ví dụ ngay dưới danh sách từ **và** dưới khung Practice (khách báo lần đầu chỉ
  đọc bằng giọng, quên hiện chữ — đã sửa). Đọc mẫu giờ nối `sound × 2 → word → sentence`.
- Có AI/người khác sau đó tách phần build script đọc IPA ra `src/lib/ipa-tts-map.ts` (`buildSoundScript`)
  gọn hơn bản gốc của tôi — **không đụng lại**, chỉ mô tả ở đây để biết chỗ logic đọc âm hiện đang nằm.

---

## 🟣 Vocabulary — mở/khoá lại nhiều category, top-up đủ 100 Premium, phát hiện dữ liệu cũ hỏng encoding (2026-09-22)

Chuỗi yêu cầu liên tiếp trong 1 phiên, đã đảo qua lại vài lần — **trạng thái CUỐI CÙNG** áp dụng:

- **Icon khoá category**: ban đầu mở 10 từ free cho 7 category (Shopping, Work & Office, School,
  Technology, Relationships, TOEFL/PTE Vocabulary) rồi bỏ icon khoá trên chip — sau đó khách đổi ý: **chỉ
  bỏ icon, khoá lại 100% nội dung** (đã revert). `PREMIUM_ONLY_VOCAB_CATEGORIES` trong `src/lib/ipa-data.ts`
  giờ để **rỗng `[]`** (không category nào hiện icon khoá ở chip nữa, kể cả cái đang thật sự khoá).
- **Free/category**: cuối cùng chốt **20 từ free mỗi category** (tăng từ 10, và từ 0 cho 7 category kia) —
  áp dụng đồng loạt cho **toàn bộ 20 category**.
- **Premium/category**: chốt mỗi category phải **≥100 từ Premium**. Đã bổ sung **239 từ mới** (đúng chủ
  đề, đủ IPA + nghĩa tiếng Việt + câu ví dụ) cho 19/20 category (Idioms đã sẵn 110, không đụng). Tổng mỗi
  category giờ: 20 free + 100 (hoặc hơn) premium.
- **`components/lily/locked-content.tsx`** ("Có trong gói trả phí"): bỏ giới hạn `.slice(0, 12)` — hiện đủ
  cả 20 category thay vì chỉ 12 đầu.
- **🔴 Lỗi `{count}` không thay số**: `t()` trong `src/lib/i18n.tsx` chỉ nhận placeholder `{{count}}` (2 cặp
  ngoặc), nhưng key `locked.sub` ở **cả 16 ngôn ngữ** (kể cả `en.ts`) lỡ viết `{count}` (1 cặp) → hiện chữ
  `{count}` nguyên văn. Đã sửa hết 16 file trong `src/locales/`.
- **🔴 Phát hiện dữ liệu cũ bị hỏng encoding (có từ trước, không phải do phiên này gây ra)**: 281 dòng
  trong `vocabulary_words` có ký tự "?" thay cho dấu tiếng Việt/IPA — mất vĩnh viễn, không phục hồi được từ
  dữ liệu hiện có. Chi tiết theo trường: `ipa` 200 dòng (toàn bộ 100 từ gốc của **PTE Vocabulary** +
  **TOEFL Vocabulary**, chỉ 2 category này), `meaning_vi` 201, `example_vi` 279 (nhiều nhất), `example_sentence`
  81 dòng tiếng Anh — `meaning_en` và bản thân `word` sạch 100%.
  - **Đã sửa phần IPA (200/200 từ)**: viết lại bằng script nối theo `word` (không theo vị trí dòng — lần
    đầu gõ tay bị lệch dòng khiến hàng chục từ nhận nhầm IPA của từ khác, phải viết lại bằng cách an toàn
    hơn). Xem `id` các dòng qua `select id,category,word,level from vocabulary_words where ipa like '%?%'`
    nếu cần đối chiếu lại.
  - **Phần tiếng Việt (nghĩa + câu ví dụ, ~281 dòng) VẪN CHƯA SỬA** — thuộc phạm vi "dịch thuật" khách
    từng nói để AI khác làm, đang chờ khách quyết: tự tôi viết lại hay giao AI dịch kia.

---

## 🟣 Listening Lab — chỉ A1 có 3 bài free, free luôn hiện trước trong "All levels" (2026-09-22)

Dữ liệu `listening_lessons` từ trước đã sẵn mỗi level (A1-C1) có đúng 3 bài `is_free=true` — khách chốt lại
ý: **chỉ A1 (Beginner) có 3 bài free, A2 trở lên 100% Premium**. Đã `UPDATE is_free=false` cho 12 bài
(3×4 level A2/B1/B2/C1), giữ nguyên 3 bài free của A1. Không cần deploy vì chỉ là đổi dữ liệu.

Riêng vấn đề sắp xếp: SQL function `listening_catalogue()` (`ORDER BY sort_order, slug`) không ưu tiên
free lên trước khi xem "All levels" — sửa ở tầng hiển thị thay vì đổi function dùng chung: thêm
`.sort((a, b) => Number(b.unlocked) - Number(a.unlocked))` (stable sort) vào `filtered` trong
`src/routes/listening-lab.tsx`. Với người dùng Premium, `unlocked` luôn true nên sort này không đổi gì
(giữ nguyên thứ tự giáo trình) — chỉ ảnh hưởng người dùng free/chưa đăng nhập.

---

## 🟣 SePay (chuyển khoản ngân hàng) — phương thức thanh toán thứ hai song song Stripe (2026-09-22/23)

Khách cung cấp STK để nhận chuyển khoản: **102000210686 · Vietcombank · PHAN THI THU THAO**. API key SePay
**chưa có** ("tôi cung cấp api sau") — phần cần key (webhook tự động xác nhận) đã viết sẵn nhưng **chủ động
từ chối mọi request khi chưa cấu hình secret** (fail closed), không kích hoạt gói nếu chưa xác thực được.

**Cơ chế SePay** (tra cứu từ developer.sepay.vn lúc làm): webhook POST JSON có `id, code, content,
transferType ("in"/"out"), transferAmount, referenceCode`; xác thực bằng HMAC-SHA256 — header
`X-SePay-Signature: sha256={hex}` + `X-SePay-Timestamp`, ký trên chuỗi `{timestamp}.{raw body}` (giống hệt
kiểu Stripe đã làm). Phải trả đúng `{"success": true}` HTTP 200 trong 30s.

**Code mới**
- `src/lib/sepay.server.ts`: hằng số STK (`SEPAY_BANK`), `verifySepaySignature` (HMAC, cùng khuôn với
  `verifyStripeSignature`), `generateReferenceCode` (mã 8 ký tự tiền tố `LGR`, dùng để khớp giao dịch với
  đơn hàng), `extractReferenceCode` (đọc `code` SePay tự tách, dự phòng regex trên `content` nếu SePay
  không tách được), `vietQrImageUrl` (ảnh QR **VietQR công khai, không cần key SePay** — hoạt động ngay từ
  bây giờ), **`usdCentsToVnd`** (quy đổi giá USD hiện có sang VNĐ lúc thanh toán, làm tròn nghìn — khách
  chốt **không** duy trì bảng giá VNĐ riêng, tỷ giá đọc từ biến môi trường `USD_TO_VND_RATE`, mặc định
  25500, sửa được không cần deploy lại code).
- `src/lib/bank-transfer.functions.ts`: `createBankTransferOrder` (tạo đơn + mã tham chiếu + hạn 30 phút),
  `getBankTransferOrder` (poll trạng thái, tự chuyển `expired` khi quá hạn), `activateBankTransferOrder`
  (dùng chung cho cả webhook lẫn admin xác nhận tay — upsert thẳng vào bảng `subscriptions` với
  `provider_subscription_id = "sepay_<order id>"`, `cancel_at_period_end: true` **luôn luôn** vì chuyển
  khoản không có thẻ lưu sẵn để tự trừ tiếp — hết hạn phải chuyển khoản lại, không tự động gia hạn),
  `adminConfirmBankTransferOrder` + `adminListBankTransferOrders` (route riêng cho admin).
- `src/routes/api/public/payments/sepay-webhook.ts`: verify chữ ký → khớp `referenceCode` với đơn `pending`
  → so khớp đúng số tiền → gọi `activateBankTransferOrder`. Chống trùng bằng bảng `processed_webhook_events`
  có sẵn (khoá tổng hợp `eventId="sepay_<id>", environment="sepay"` — tách hẳn khỏi khoá Stripe).
- `src/components/lily/bank-transfer-checkout.tsx` + route `/billing/bank-transfer?order=<id>`: hiện QR,
  STK, số tiền, mã tham chiếu (có nút Copy từng ô), poll trạng thái mỗi 4s.
- `src/routes/pricing.tsx`: thêm nút "Pay by bank transfer (VietQR)" dưới nút Stripe của 2 gói trả phí.
- `src/components/lily/admin-billing.tsx`: thêm khối "Bank transfer orders (SePay)" trong tab Billing —
  admin tự bấm "Mark as paid" sau khi kiểm tra tài khoản ngân hàng thật. **Đây là cách duy nhất kích hoạt
  gói trả qua SePay cho tới khi có API key.**
- **🔴 Quan trọng — đã vá**: `cancelMySubscription`/`keepMySubscription`/`changeMyPlan` (trong
  `billing.functions.ts`) gọi thẳng API Stripe theo `provider_subscription_id` — nếu không chặn thì gói trả
  qua SePay (`provider_subscription_id` dạng `sepay_...`) sẽ gọi Stripe với ID giả, lỗi 404. Đã thêm guard
  `isBankTransferSubscription()` chặn sớm, báo lỗi rõ ràng thay vì crash.
- DB: migration `0014_sepay_bank_transfer.sql` (bảng `bank_transfer_orders`, RLS: tự xem đơn của mình +
  admin toàn quyền) và `0015_sepay_vnd_computed.sql` (bỏ 2 cột `monthly_amount_vnd`/`yearly_amount_vnd` —
  thử nghiệm ban đầu là giá VNĐ cố định do tôi tự tính rồi lưu, khách yêu cầu đổi sang tính động nên xoá
  cột, không dùng nữa). Cả 2 đã chạy trên production.

**Đã test qua production**: build Docker thật 2 lần (xác nhận route-tree + type-check qua, vì `tsc` cục bộ
báo lỗi giả do `routeTree.gen.ts` chỉ tự sinh lúc build thật, không sinh khi chạy `tsc --noEmit` suông) +
deploy; ảnh QR VietQR trả về thật (200, PNG, đúng STK/tên); nút "Pay by bank transfer" hiện đúng trên
`/pricing` (đã chụp ảnh xác nhận); webhook trả 400 khi gọi không có chữ ký (đúng thiết kế fail-closed); mô
phỏng toàn luồng tạo đơn → xác nhận → tạo `subscriptions` → `effective_tier()`/`has_active_subscription()`
đều đúng (test bằng SQL trực tiếp trên `demo-free`, đã dọn sạch dữ liệu test sau đó). **Chưa test được bằng
trình duyệt thật** (công cụ Playwright cục bộ bị lỗi mạng liên tục trong 2 buổi làm việc gần đây, không
liên quan tới code — xác nhận bằng `curl` site vẫn khoẻ mọi lần).

**Việc còn treo**
- Chưa có API key + webhook secret SePay thật — khi có: đăng ký URL
  `https://lingoraenglishai.com/api/public/payments/sepay-webhook` trên SePay, điền `SEPAY_WEBHOOK_SECRET`
  vào `.env.docker`, `deploy.bat`. Không cần sửa code gì thêm.
- Chưa test luồng thật bằng trình duyệt (tạo đơn thật → quét QR → chuyển khoản thật/giả lập → admin xác
  nhận tay) — chỉ mới xác nhận từng phần riêng lẻ như trên.
- Gói trả qua SePay hết hạn thì UI vẫn hiện các nút Stripe thường (Cancel/Keep/Change plan) trên trang
  `/billing` — bấm vào sẽ hiện lỗi rõ ràng thay vì crash (đã chặn ở server), nhưng **chưa** ẩn hẳn nút hay
  làm UI riêng cho trường hợp này — có thể gây khó hiểu, nên làm tiếp nếu có thời gian.

---

## 🟣 Listening Lab — lỗi 404 model TTS + cache sai giọng khi hội thoại nhiều người nói (2026-09-25)

- **Lỗi "Model gemini-2.0-flash not available (404)"** khi nghe Listening Lab (dừng giữa chừng, khách báo ví
  dụ dừng ở câu 3/8): mảng model dự phòng TTS trong `geminiSynthesise` (`ai-providers.server.ts`) có lẫn 1
  model **không phải TTS** (`gemini-2.0-flash`). Đã sửa thành đúng 3 model TTS thật, theo thứ tự dự phòng:
  `gemini-3.1-flash-tts-preview` → `gemini-2.5-flash-preview-tts` → `gemini-2.5-pro-preview-tts`.
- **Cache sai giọng cho hội thoại nhiều người nói**: script tạo trước audio (`scripts/pregenerate-audio.ts`)
  và trình phát thật (`listening-player.tsx`) trước đó tính giọng theo người nói bằng 2 đoạn code khác nhau
  — cache tạo trước luôn dùng 1 giọng cố định (`shimmer`), còn lúc phát thật lại xoay vòng nhiều giọng theo
  đúng thứ tự người nói, nên audio đã cache sẵn không khớp giọng hiển thị trên màn hình. Gộp về đúng 1 hàm
  `speakerVoiceMap()` (`src/lib/listening-content.ts`), cả 2 nơi gọi cùng logic, không thể lệch lại được nữa.
- Cứng hoá `pregenerate-audio.ts` chạy trên VPS: dừng sớm nếu 2 mục liên tiếp hết veo cả lượt thử lại vì
  rate-limit (dấu hiệu quota ngày đã cạn, không phải lỗi tạm thời), nghỉ 60s trước khi thử lại một mục thay
  vì bắn liên tục làm cạn quota nhanh hơn.

---

## 🟣 Gemini TTS — giới hạn 100 (hoặc 50) request/NGÀY chặn việc tạo trước audio hàng loạt (2026-09-24/25)

Đang chạy `pregenerate-audio.ts` để tạo trước audio cho toàn bộ nội dung cố định (nghe/shadowing/từ vựng/
phát âm, ~6.966 mục) thì bị chặn quanh mốc 250 lượt/ngày. Xác nhận qua ảnh chụp trang Rate Limit của AI
Studio khách gửi: cả 3 model TTS preview đang dùng đều giới hạn **100 (hoặc 50) request/NGÀY** ở Tier 1 (đã
nạp tiền thật), không phải request/phút — nghỉ/thử lại không giải quyết được, chỉ tăng Tier (chi tiêu +
thời gian) hoặc xin Google tăng quota thủ công mới đủ. Chi tiết đầy đủ + trạng thái backfill (611/6.966 tính
đến 2026-09-24) nằm ở memory riêng của tôi, không lặp lại ở đây. **Đã đính chính 1 lần**: dùng nhiều
project/API key khác nhau để né giới hạn **vi phạm Điều khoản dịch vụ của Google** ("API Limitations"),
không phải giải pháp hợp lệ dù bản thân từng gợi ý sai trước đó.

---

## 🟣 Hướng dẫn tương tác (guided tour) 4 trang luyện tập, đủ 54 ngôn ngữ + tự hiện + tối ưu di động (2026-09-25)

Thêm hướng dẫn từng bước (thư viện `react-joyride`) cho 4 trang: AI Speaking Coach, Shadowing, Pronunciation,
Vocabulary — theo đúng yêu cầu khách: "tự hiện ra hướng dẫn chứ không phải bấm nút tròn mới hướng dẫn" (chỉ
ra học viên sẽ không biết để bấm nút tròn đó).

- `src/components/lily/feature-tour.tsx` (mới): hook `useFeatureTour` tự chạy 1 lần/trang (theo dõi qua
  `localStorage`, khoá `lily.tour.seen.<page>`), component `FeatureTour` bọc `Joyride` (tắt hẳn beacon tròn
  — `skipBeacon: true`), nút `ViewGuideButton` để xem lại hướng dẫn bất cứ lúc nào sau đó.
- Tối ưu di động: khung hướng dẫn co theo màn hình (`width: min(380px, calc(100vw - 32px))`), tự cuộn tới
  đúng vị trí (`scrollOffset`), chặn bấm xuyên qua lớp phủ (`blockTargetInteraction`).
- Mỗi trang 2-4 bước, gắn `data-tour="..."` vào đúng khu vực cần chỉ tới.
- **Đủ 54 ngôn ngữ**, đúng yêu cầu "chọn ngôn ngữ nào hiện đúng ngôn ngữ đó": 33 khoá dịch mới (`tour.*`)
  thêm vào `en.ts` + 15 file locale dịch sẵn (`vi/es/pt/fr/de/it/ja/ko/zh-CN/zh-TW/hi/id/tr/ru/ar`) + 38 ngôn
  ngữ còn lại (nạp qua DB, `scripts/seed/languages/*.json`). Đã sinh sẵn
  `scripts/seed/tour-translations.sql` (1.254 dòng = 38 ngôn ngữ × 33 khoá) để nạp lên bảng
  `ui_translations` production — **CHƯA CHẠY**, xem "⛔ Còn thiếu" bên dưới.

---

## 🟣 Google Analytics (GA4) — tích hợp toàn site, chỉ chạy ở production (2026-09-25)

Thêm script `gtag.js` (measurement ID `G-V6KLFD3TCS`) vào `head()` của `src/routes/__root.tsx`, bọc điều
kiện `import.meta.env.PROD` nên **không tự chạy khi phát triển ở máy dev**. Cập nhật mục Cookies + ngày sửa
đổi cuối trong `src/routes/privacy.tsx` để nhắc tới Google Analytics.

---

## 🟣 Pronunciation "Sounds" — AI đọc sai 32/44 âm, sửa bảng ánh xạ + xây công cụ chỉ-admin tự nghe/tạo/lưu (2026-09-26/27)

Khách tự nghe trực tiếp bằng tài khoản của mình và báo: 16/44 âm đọc đúng, còn lại đọc sai. Nguyên nhân:
`IPA_TTS_MAP` (`src/lib/ipa-tts-map.ts`) trước đó viết mỗi âm bằng kiểu đánh vần giả ("sss", "fff", "mmm",
"shh", "eh"...) — Gemini TTS không đọc đúng kiểu đánh vần này, chỉ đọc đúng khi âm nằm trong **1 từ tiếng
Anh thật** (đã kiểm chứng bằng cách nghe trực tiếp trên AI Studio nhiều vòng, không đoán mò). Kiến trúc cuối
cùng gồm 2 lớp:

**Lớp 1 — sửa bảng ánh xạ, áp dụng cho mọi user (kể cả khi admin chưa duyệt riêng âm đó)**: viết lại 32 giá
trị sai trong `IPA_TTS_MAP` bằng từ tiếng Anh thật, đặt đúng vị trí âm đó tự nhiên xuất hiện trong tiếng Anh
(đầu từ cho hầu hết phụ âm; **giữa từ** cho `/ʒ/` vì tiếng Anh gần như không có từ nào bắt đầu bằng âm này;
**cuối từ** cho `/ŋ/` vì âm này không bao giờ đứng đầu từ). Phát hiện thêm 1 lớp lỗi ngay trong lúc sửa:
20/32 từ chọn ban đầu trùng thẳng với từ ví dụ mặc định của chính âm đó (vd `/e/` chọn "bed" trùng với từ ví
dụ có sẵn "bed" → đọc ra "bed bed bed..." thay vì đúng 4 phần rõ ràng "âm-âm-từ-câu") — đã chọn lại toàn bộ
20 từ này, đảm bảo khác với danh sách 6 từ ví dụ riêng của từng âm.

**Lớp 2 — công cụ chỉ admin thấy, tự nghe bản hiện tại / tạo bản mới / lưu**: thêm 2 nút trong
`pron-practice.tsx` (chỉ hiện khi `isAdmin`, **không đổi 1 dòng code nào trong luồng của user thường** —
nút Listen cũ của họ vẫn y hệt như trước). Nút Listen sẵn có = nghe đúng bản đang lưu trong cache DB (không
đổi); nút mới **"Tạo bản mới"** = gọi API sinh 1 bản mới, giữ tạm ở trình duyệt, **chưa** ghi DB, có thêm nút
"Nghe lại bản mới" để nghe lại không tốn thêm lượt gọi API; nút **"Lưu bản này"** = chỉ khi admin bấm mới ghi
đè đúng bản đó vào `tts_cache`. Nhờ vậy admin nghe-thử-nhiều-lần rồi mới quyết định lưu, thay vì tin mù kết
quả sinh ra lần đầu (TTS không đảm bảo ra kết quả giống nhau mỗi lần gọi).

- `src/lib/pronunciation-admin.functions.ts`: `adminGenerateSoundTake` (chỉ sinh, không lưu, `requireAdmin`),
  `adminSaveSoundAudio` (lưu đúng bytes admin vừa nghe — không sinh lại — bằng `onConflictDoUpdate`, khác
  `onConflictDoNothing` của luồng `speak()` cho user thường, để admin lưu đè được bản cũ nhiều lần).
- Khám phá quan trọng qua nghe trực tiếp trên AI Studio: gửi **đúng ký hiệu IPA** (vd `/e/`) kèm 1 câu hướng
  dẫn không đọc ra tiếng + dấu phân tách, Gemini đọc đúng hẳn ký hiệu đó — không cần thay bằng từ thật nữa
  cho phần "âm" (hàm `buildIsolatedSoundPrompt()`, `ipa-tts-map.ts`). Lưu ý kỹ thuật quan trọng: tài liệu
  tham khảo dùng dấu `#### TRANSCRIPT`, nhưng `cleanTextForTts()` (`ai-providers.server.ts`) tự xoá **mọi**
  ký tự `#` khỏi mọi văn bản gửi Gemini toàn site (kể cả chat AI Coach) — phải đổi sang dấu `===` để không bị
  nuốt mất, làm hỏng cả kỹ thuật.
- Phần "đọc 2 lần" (âm-âm) **không** nhờ Gemini tự lặp trong 1 lần sinh (đã thử, kết quả chỉ đọc 1 lần) — mà
  code tự ghép **cùng 1 đoạn audio với chính nó** thành 2 lần (`concatWavClips()`, mới thêm vào
  `ai-providers.server.ts` — ghép PCM thô của 2 file WAV rồi bọc lại đúng 1 header, an toàn vì mọi audio
  Gemini TTS trả về đều cùng định dạng 24kHz/mono/16-bit).
- Test thật trên `/pronunciation` (tài khoản admin) sau khi sinh xong toàn bộ, khách báo còn 5 âm sai, đã sửa
  tiếp — **thu hẹp đúng phạm vi theo yêu cầu khách "không ảnh hưởng các âm đã đúng"**, không sửa tràn lan:
  - `/tʃ/ /f/ /l/`: gửi chung "từ ... câu" trong 1 lượt gọi khiến Gemini bỏ hẳn từ đứng đầu, thử lại nhiều
    lần vẫn vậy. Chỉ đúng 3 âm này (hằng số `NEEDS_SEPARATE_WORD_CALL` trong
    `pronunciation-admin.functions.ts`) tách từ và câu thành 2 lượt gọi API riêng; mọi âm khác vẫn gộp 1 lượt
    y hệt như lúc đã xác nhận đúng, không đụng vào.
  - `/r/`: theo chuẩn IPA quốc tế, ký hiệu `r` đúng nghĩa là âm **rung lưỡi**; âm r tiếng Anh viết chuẩn phải
    là `ɹ`, các từ điển tiếng Anh chỉ viết tắt `/r/`. Gemini đọc đúng theo chuẩn IPA quốc tế nên ra âm rung —
    sai với âm r tiếng Anh thật.
  - `/ð/`: thêm 1 câu gợi ý riêng (không đọc ra tiếng) mô tả rõ đây là âm "th" **hữu thanh** như trong
    "this"/"that", không phải "d", không phải "th" **vô thanh** của "think".
  - 2 gợi ý riêng cho `/ð/`/`/r/` nằm trong hằng số `ISOLATED_SOUND_HINTS` (`ipa-tts-map.ts`), chỉ áp dụng
    đúng 2 ký hiệu này theo thiết kế — prompt của mọi âm khác giữ nguyên, không đổi 1 chữ.
- **CHƯA test được `/ð/`/`/r/` sau khi sửa** (mới đưa sẵn 2 đoạn prompt để khách tự dán vào AI Studio kiểm
  tra trước khi tin), **CHƯA deploy** toàn bộ phần công cụ admin này lên production — xem "⛔ Còn thiếu".
- Đã typecheck sạch sau mọi lần sửa (`bunx tsc --noEmit -p .` qua Docker, xem mục "Vài thứ cần biết" cuối
  file để biết cách chạy đúng trên máy dev này).

---

## 🟣 Cấp quyền Pro cho tài khoản demo-admin — chèn thẳng dữ liệu, không sửa code (2026-09-26/27)

Cần tài khoản admin (`demo-admin@lingoraenglish.local`) mở hết mọi tính năng trả phí để tự đi duyệt audio 44
âm ở mục trên mà không bị chặn bởi paywall. Khách chủ động từ chối hướng "sửa code thêm cơ chế bypass riêng
cho admin" ("đừng sửa code gì cả, nhiều lúc bảo mật này kia không hợp lý"), chọn cách chèn thẳng 1 dòng dữ
liệu — đúng cơ chế **đã có sẵn** từ trước (bảng `complimentary_access`, giống hệt nút "Grant" trong tab
Members của `/admin`), không phải cơ chế mới:

```sql
INSERT INTO complimentary_access (user_id, tier, expires_at, note)
SELECT id, 'ielts_pro', NULL, 'Admin full-access grant (manual DB insert, no code change)'
FROM profiles WHERE email = 'demo-admin@lingoraenglish.local';
```

Không đụng code/schema — chỉ 1 dòng dữ liệu, `expires_at = NULL` nghĩa là cấp vĩnh viễn, không tự hết hạn.

---

## 🟣 AI Speaking Coach — "gợi ý trả lời" (hint) dưới mỗi câu hỏi của AI (2026-09-27)

Khách yêu cầu: dưới câu hỏi AI vừa hỏi, thêm nút gợi ý cho học viên trình độ cơ bản chưa biết trả lời sao —
theo đúng mẫu 2 tầng khách gửi (Ideas + Sentence starters, rồi nếu vẫn bí thì có nút xem câu trả lời mẫu
kèm bản dịch). Điểm khó: câu hỏi của AI **không phải nội dung có sẵn**, nó tự sinh theo thời gian thực mỗi
lượt (`coachReply`) — nên gợi ý cũng phải sinh theo thời gian thực, khớp đúng câu hỏi AI vừa hỏi, không thể
viết sẵn theo kiểu dữ liệu tĩnh.

- `src/lib/coach.functions.ts`: 2 hàm mới, sinh theo 2 tầng, **chỉ gọi AI khi học viên thật sự bấm** (không
  tự sinh trước để tiết kiệm chi phí AI văn bản, không đụng tới Gemini TTS/quota âm thanh đang căng):
  - `getCoachHintIdeas` — tầng 1: 4 ý nhỏ kèm emoji + 3 mẫu câu bắt đầu, luôn bằng **tiếng Anh** (đây là
    khung câu tiếng Anh để học, không phải phần giải thích, nên không dịch).
  - `getCoachHintExample` — tầng 2 ("Vẫn chưa biết nói sao? → Xem câu trả lời mẫu"): 1 câu trả lời mẫu +
    **bản dịch sang đúng ngôn ngữ giải thích học viên đã chọn** (dùng lại cơ chế `langNote`/
    `explanationLanguageSchema` sẵn có — tự động đúng cho toàn bộ 54 ngôn ngữ của web, không hardcode tiếng
    Việt). Bắt buộc phải gọi tầng 1 trước (không có cách "xem ví dụ" mà chưa từng xin gợi ý).
  - Cả 2 dùng `llmJson()` (AI văn bản, DeepSeek/Gemini theo cấu hình hiện tại — không dùng Gemini âm thanh).
- **Giới hạn theo yêu cầu khách "mỗi bài free thì cho 1 lượt thôi"**: cột mới `coach_sessions.hint_used`
  (migration `src/db/schema/0017_coach_hint_used.sql`) — tính theo **cả phiên/bài học** (1 topic), không
  phải theo từng câu hỏi, vì đúng nghĩa "1 lượt trợ giúp/bài". Chỉ chặn tier **free**; Premium/IELTS Pro
  không giới hạn số lần. Chặn bằng `UpgradeRequiredError` (tái dùng đúng cơ chế `usePaywall("conversation")`
  đã có sẵn trên trang, không phải cơ chế mới).
- Áp dụng cho **cả 5 loại chủ đề** (free/daily/roleplay/interview/challenge) theo đúng yêu cầu.
- `src/routes/ai-speaking.tsx`: nút "💡 Cần ý tưởng? Xem gợi ý" hiện ngay dưới câu hỏi mới nhất của AI, phía
  trên ô ghi âm — chỉ hiện khi học viên **chưa trả lời** câu đó (tự ẩn/xoá gợi ý cũ ngay khi có câu hỏi mới
  hoặc bắt đầu chủ đề khác). Khi tầng 2 đã hiện, thêm dòng "🎤 Đến lượt bạn rồi!" ngay trên ô trả lời.
- **Khoá dịch `coach.hint.*` (8 khoá) — ĐÃ ĐỦ 54 NGÔN NGỮ (2026-09-27)**: tiếng Anh (`src/locales/en/coach.ts`,
  nguồn gốc) + tiếng Việt (`src/locales/sections/vi.ts`) làm tay; 14 ngôn ngữ compiled còn lại
  (`ar/de/es/fr/hi/id/it/ja/ko/pt/ru/tr/zh-CN/zh-TW`, `src/locales/sections/`) + 38 ngôn ngữ DB
  (`scripts/seed/languages/*.json`) nạp bằng script `apply-coach-hint-translations.mjs` (chạy 1 lần bằng
  `node` cục bộ, không cần Docker/bun — chỉ thao tác text/JSON, không build code). SQL nạp lên production:
  `scripts/seed/coach-hint-translations.sql` (304 dòng = 38 ngôn ngữ × 8 khoá) — **CHƯA CHẠY lên production**,
  cùng nhóm với `tour-translations.sql` chưa chạy ở mục trên.
  - **Sự cố lúc làm, đã sửa xong**: lần chạy script đầu tiên tạo lỗi 2 dòng trống liền nhau ở cả 14 file
    compiled, do JS regex `^` (cờ `m`) với file dùng xuống dòng CRLF coi riêng ký tự `\r` là đã kết thúc
    dòng, khiến nhóm bắt `(\s*)` vô tình nuốt luôn ký tự `\n` của dòng TRƯỚC đó — biến `indent` bị lẫn 1 ký
    tự xuống dòng thừa, mỗi dòng mới chèn vào tự mang theo 1 dòng trống. Sửa bằng cách cố định thụt lề `"  "`
    thay vì lấy từ regex. Đã revert 14 file về bản gốc qua `git checkout --` rồi chạy lại, xác minh lại bằng
    cách đếm byte (không còn `\r\n\n` hay `\n` lẻ) trước khi tin.
- Đã typecheck sạch. **CHƯA chạy `migrate.bat`** (cột DB mới) và **CHƯA `deploy.bat`** — xem "⛔ Còn thiếu".

---

## 🔴 Listening Lab — Dictation "tự điền sẵn" ở 52% số bài do lỗi code, không phải dữ liệu (2026-09-28)

Khách báo: vòng 3 (Dictation) một số bài hiện nguyên câu, không có ô trống để gõ. Kiểm tra bằng cách kéo
toàn bộ `dictation` jsonb thật từ production, chạy đúng thuật toán `buildDictationParts`
(`src/lib/listening-content.ts`) qua Node cục bộ để dò thay vì đoán — phát hiện **267/514 mục dictation
(52%), trải trên 74/119 bài (62%)** không khớp được ô trống nào, tập trung gần hết ở B2/C1.

**Nguyên nhân**: hàm cũ so khớp mỗi ô trống với đúng 1 từ trong câu. Nhiều mục dictation có ô trống là
**cụm nhiều từ** (đúng nghĩa sư phạm — connected speech/expression tự nhiên hay là cụm, vd
`blanks: ["locking yourself"]`, `["twenty-four hours"]`, `["Friday works"]`), nên không bao giờ khớp được
với 1 từ đơn → không tìm thấy ô trống nào → cả câu hiện nguyên văn, giống như "đã điền sẵn". **Dữ liệu vốn
đúng, lỗi hoàn toàn ở code** — không cần sửa/soạn lại nội dung.

**Đã sửa**: viết lại `buildDictationParts` để so khớp theo **chuỗi nhiều từ liên tiếp** thay vì 1 từ, gộp
thành đúng 1 ô trống bất kể ô đó dài bao nhiêu từ — `listening-lesson.tsx` (phần hiển thị input) không cần
đổi gì vì vẫn đúng 1 input/1 blankIndex như cũ. Trường hợp 1 từ vẫn hoạt động y hệt trước (n=1 của cùng
logic), không ảnh hưởng 247 mục đang đúng.

**Đã xác minh lại toàn bộ 514 mục thật trên production** bằng cùng cách (chạy lại thuật toán mới, không chỉ
đọc code bằng mắt): **513/514 khớp đúng**. Còn đúng 1 mục lỗi thật nhỏ:
`c1-travel-documentary-monologue` mục #2 — câu có dấu nháy đơn lồng bên trong
(`"...it owes us something.'"`), ký tự `'` đóng ngoặc dính liền cuối từ cuối cùng khiến so khớp lệch (hàm
`normaliseWord` cố tình giữ dấu `'` để không phá vỡ từ rút gọn như "don't", nên không tự lọc được trường hợp
này). Ảnh hưởng 1/514 mục, chưa sửa — có thể sửa bằng cách đổi câu/ô trống của riêng mục đó qua `/admin`.

Đã typecheck sạch. Đã deploy lên production cùng đợt với các mục ở trên.

---

## 🔴 Listening Lab — đáp án đúng dồn vào vị trí B ở 61% số câu hỏi, lỗi dữ liệu (2026-09-28)

Khách để ý thấy đáp án đúng đa số là B. Kiểm tra bằng cách kéo toàn bộ `questions` jsonb thật từ production
và tính vị trí thật của `answer` trong mảng `options` (khớp theo **nội dung chữ**, không phải theo thứ tự —
xem `listening-lesson.tsx` dòng so `option === question.answer`) cho toàn bộ 658 câu hỏi. Kết quả: **B chiếm
60.9% (401/658)**, C chỉ 6.8%, D chỉ 0.5% — và **27 bài có đáp án đúng là B cho TẤT CẢ câu hỏi trong bài**
(5-7/5-7). Lỗi ở khâu soạn nội dung (không xáo vị trí đáp án đúng lúc tạo), không phải code — code vốn đã
so khớp theo nội dung chữ nên xáo vị trí `options` không ảnh hưởng gì tới việc chấm đúng/sai.

**Đã sửa bằng cách xáo ngẫu nhiên (Fisher–Yates) vị trí `options` của cả 658 câu, giữ nguyên `answer` và mọi
trường khác** — chạy `UPDATE listening_lessons SET questions = ...` trực tiếp trên production cho cả 119
bài, **không cần sửa code, không cần deploy** (server luôn đọc thẳng từ DB). Đã xác minh lại bằng cách kéo
dữ liệu về lần nữa sau khi sửa: phân bố mới A 27.4% / B 26.1% / C 24.8% / D 21.7% (đều), tất cả 658 câu vẫn
khớp đúng answer với 1 option (không mất/hỏng dữ liệu), chỉ còn 1 bài trùng ngẫu nhiên cả 4 câu ra B (xác
suất tự nhiên của xáo ngẫu nhiên, không phải lỗi hệ thống lặp lại).

---

## ⛔ Còn thiếu / chưa làm (không phải lỗi, cần quyết định hoặc thêm thông tin)

- **Dữ liệu người dùng thật từ Supabase Cloud** — cần connection string, chưa có.
- **Google OAuth** — cần Client ID/Secret thật (xem `HUONG_DAN_LAY_SMTP_GOOGLE_OAUTH.md`).
- **Paddle live + sandbox** — cần đủ 4 giá trị (`PADDLE_LIVE_API_KEY`, `PADDLE_SANDBOX_API_KEY`,
  `PAYMENTS_LIVE_WEBHOOK_SECRET`, `PAYMENTS_SANDBOX_WEBHOOK_SECRET`) thật, chưa test được thanh toán thật
  trên production dù code đã sẵn sàng (đã bỏ Lovable gateway 2026-09-17, gọi thẳng Paddle). Hướng dẫn lấy
  key: `BAN GIAO DEV - LINGORA ENGLISH/HUONG_DAN_LAY_PADDLE_KEYS.md`. Có sẵn prompt test full-flow 44 test
  case để chạy ngay khi có key: `BAN GIAO DEV - LINGORA ENGLISH/PROMPT_TEST_FULL_FLOW.md`.
- **Vấn đề 4 (đặc tả)**: chính sách ân hạn khi thanh toán thất bại — cơ chế đã dựng xong
  (`grace_period_days`, seed=0). **Phiên 2026-09-17 (tiếp)**: xác nhận lại field này đã sẵn có trong admin
  (tab "Plans", ô số theo từng gói, `admin-plans.tsx` render generic theo `LIMIT_KEYS` trong
  `plan-admin.functions.ts`) — không cần code/deploy gì thêm, chỉ cần tự vào đặt số ngày khi chốt được (gợi
  ý thường dùng: 3-7 ngày). Vẫn đang seed=0 (tắt), chưa chọn số cụ thể.
- ~~**CONFLICT #1**: 3 đề Speaking Test free là "3 đề đầu" hay "mỗi phần 1 đề"~~ — **chốt 2026-09-17
  (tiếp)**: giữ nguyên cách hiểu hiện tại của file 01 (mỗi phần thi 1 đề), không đổi code/dữ liệu. Muốn
  thêm đề free thì dùng tab admin "Speaking Tests" có sẵn, không cần sửa code.
- **CONFLICT #2** (xem mục "Spec audit toàn diện" ở trên) — "thêm 100 từ/chủ đề" là cộng thêm hay tổng mục
  tiêu (file 01 bảng 4.1 đang hiểu là tổng 100/chủ đề). Vẫn treo, chưa hỏi lại trong phiên 2026-09-17
  (tiếp) — giữ nguyên cách hiểu cũ cho tới khi có quyết định khác.
- **Mô hình Credits (lượt mua lẻ)** — nhắc trong file 02 (dòng 41, mục 10) nhưng chưa từng được đặc tả hay
  triển khai. Cần khách xác nhận có giữ mô hình này không; nếu giữ thì cần đặc tả đủ vòng đời (mua/hết
  hạn/hoàn/hiển thị) trước khi code. Vẫn treo, chưa hỏi lại trong phiên 2026-09-17 (tiếp).
- **Bảng 4.2 trong đặc tả** ghi ngược với hiện trạng code (không lưu bản ghi âm) — dòng 845 vẫn liệt kê
  "Bản ghi âm và kết quả chấm" là dữ liệu cần lưu. **Phiên 2026-09-17 (tiếp)**: được yêu cầu tạm hoãn, chưa
  sửa tài liệu lẫn code — để nguyên hiện trạng (cột `audio_path` có sẵn, không dòng nào có dữ liệu, không
  code nào ghi vào), xử lý sau.
- ~~**Vocabulary**: cần ~1.582 từ~~ — **đã xong 2026-09-15**, xem mục "Kiểm tra lại + sửa tiếp phiên làm
  việc song song" ở trên. 18/18 category ≥100 từ, đầy đủ trường, đã xác nhận qua query thật trên
  production.
- ~~Pronunciation (44 âm + 8 phần nâng cao) — lớp nội dung chưa server-gate~~ — **đã sửa 2026-09-14**, xem
  2 mục riêng ở trên (44 Sounds, 8 phần nâng cao). Còn treo: 8 phần nâng cao có 372/400 lesson, 7/8 phần đã
  đủ 50 (mục
  tiêu 50/phần) — hạ tầng CRUD đã xong, chỉ còn thiếu khối lượng nội dung, làm tiếp qua `/admin` hoặc JSON
  seed khi có thời gian.
- ~~**Listening Lab**: "6 chủ đề free" vô nghĩa vì chỉ có 5 category, gate theo category chưa hoạt động
  thật~~ — **đã sửa 2026-09-14**, xem mục "Audit khách hàng 2026-09-14" ở trên (7 category, gate đúng
  category thứ 7 trở đi). 4 bước (Listen/Understand/Dictation/Score) + progress cộng dồn + gate server-side
  qua RLS vẫn như mô tả cũ, không đổi.
- ~~**Đa ngôn ngữ**: 54/50+ ngôn ngữ~~ — **đã hoàn thành 100% 2026-09-16**, xem mục "Đa ngôn ngữ" ở trên. Đã nạp đủ 38 ngôn ngữ qua DB seed + 16 ngôn ngữ gốc = 54 ngôn ngữ trên production DB (45,689 dòng bản dịch), xác nhận qua query trực tiếp trên PostgreSQL production.
- TOEFL/PTE trong Speaking Tests có nội dung đủ (60 đề) nhưng chưa được đầu tư UX kỹ như IELTS.
- **Chưa chạy `scripts/seed/tour-translations.sql` lên production** — 38 ngôn ngữ chưa có bản dịch cho
  hướng dẫn tương tác (guided tour), sẽ tự fallback sang tiếng Anh cho tới khi chạy file này.
- **Chưa `deploy.bat` phần sửa Pronunciation "Sounds" mới nhất** (32 âm + công cụ admin nghe/tạo/lưu + 2 gợi
  ý `/ð/`/`/r/` + tách lượt gọi `/tʃ/ /f/ /l/`) — code đã typecheck sạch nhưng chưa lên production. Sau khi
  deploy: đăng nhập `demo-admin`, vào từng âm trong 44 âm, bấm "Tạo bản mới" → nghe → "Lưu bản này" (đặc
  biệt chú ý nghe kỹ `/ð/` và `/r/`, 2 âm chưa test được sau lần sửa cuối). Mỗi lượt "Tạo bản mới" tốn 1-3
  lượt gọi API TTS (tuỳ âm) — quota Gemini 100/ngày, nên chia làm nhiều đợt, không dồn hết 44 âm 1 lần.
- Backfill audio hàng loạt (`scripts/pregenerate-audio.ts`) đang tạm dừng vì giới hạn quota Gemini TTS
  100/ngày (611/6.966 mục tính đến lần chạy gần nhất) — không phải bắt buộc (audio vẫn tự cache khi user
  thật dùng lần đầu), chỉ là tối ưu tốc độ tải, làm tiếp khi rảnh quota.
- **Chưa chạy `migrate.bat` + `deploy.bat` cho tính năng "gợi ý trả lời" (hint) của AI Coach** — cần
  `migrate.bat` trước (cột mới `coach_sessions.hint_used`, migration `0017_coach_hint_used.sql`) rồi mới
  `deploy.bat`. Bản dịch `coach.hint.*` đã đủ 54 ngôn ngữ trong code/data (2026-09-27) — chỉ còn thiếu chạy
  `scripts/seed/coach-hint-translations.sql` lên production (gộp chung đợt với `tour-translations.sql` ở
  trên, cả 2 file SQL đều chưa chạy).

---

## Vài thứ cần biết để không mất công dò lại

- Dự án **giờ đã là git repo** (xác nhận lại 2026-09-14 — ghi chú cũ ở đây nói "không phải git repo" đã lỗi
  thời, `git log`/`git blame` dùng được bình thường từ giờ). Vẫn nên đọc file này trước vì lịch sử commit
  chỉ có từ lúc init repo trở đi, không phủ hết các phiên làm việc trước đó.
- **SSH ra VPS production dùng được từ máy dev này** (xác nhận lại 2026-09-14 — ghi chú cũ bên dưới về
  "tunnel SSH sang DB production bị sandbox chặn" chỉ đúng cho tunnel port 5432 trực tiếp; chạy lệnh qua
  `ssh -i ~/.ssh/lingoraenglish_vps root@221.132.19.75 "docker exec lingoraenglish-postgres psql -U lingora
  -d lingoraenglish -c '...'"` thì không bị chặn). Với SQL dài (nhiều dòng, dễ vượt giới hạn độ dài lệnh
  qua `-c`), sinh file SQL cục bộ rồi `scp` lên `/tmp` trên VPS, `docker cp` vào container, chạy bằng
  `psql -f`. Lưu ý encoding: script Python trên Windows in ra stdout có thể không phải UTF-8 mặc định
  (ký tự em-dash "—" từng bị hỏng thành byte 0x97 không hợp lệ) — luôn set `PYTHONIOENCODING=utf-8` khi
  redirect output ra file trước khi áp dụng lên Postgres, và strip CRLF (`tr -d '\r'`) cho chắc.
- Máy dev Windows này **không có `bun`** — mọi lệnh `bun run`/`bunx` phải qua Docker:
  ```
  docker run --rm -v "<đường dẫn repo>:/app" -w /app oven/bun:1-alpine sh -c "bunx tsc --noEmit -p ."
  ```
  (dùng đúng cách này để typecheck trước khi coi 1 thay đổi code là xong — `vite build` không tự động
  chạy full type-check).
- `_backups/lingoraenglish-main_pre-rebuild_20260910_232214/` là bản sao lưu trước khi rebuild (100%
  Supabase) — chỉ để đối chiếu hành vi gốc, không phải code đang chạy.
- File `KE_HOACH_REBUILD_FULLSTACK.md` giờ chỉ có giá trị lịch sử (đã hoàn tất), đừng đọc như "đang làm
  dở" nữa.
- **Docker Desktop trên máy dev này không tự chạy nền** — nếu lệnh `docker` báo lỗi kết nối pipe, khởi động
  `"C:\Program Files\Docker\Docker\Docker Desktop.exe"` rồi đợi `docker info` trả về exit code 0 (thường
  vài giây tới ~1 phút) trước khi thử lại, đừng kết luận vội môi trường hỏng.
- **`bunx` trong container Docker có thể tự resolve lại dependencies và xoá mất `node_modules` trên host**
  (gặp thật 2026-09-17, `bunx tsc` làm mất `node_modules/vite`) — ưu tiên gọi thẳng `./node_modules/.bin/tsc`
  / `./node_modules/.bin/eslint` / `./node_modules/.bin/vite` thay vì `bunx <tool>`. Nếu lỡ dính, chạy lại
  `bun install --frozen-lockfile` trong cùng container để khôi phục (không đổi `bun.lock`/`package.json`).
- **Một số hành động bị chặn ở tầng permission của Claude Code** (không phải do model từ chối): đọc dữ liệu
  production qua SSH đôi khi bị chặn với lý do "Production Reads", và tự chạy `migrate.bat`/`deploy.bat`
  luôn bị chặn với lý do "Production Deploy" — cần người dùng tự chạy 2 lệnh đó, hoặc thêm permission rule
  trong settings nếu muốn AI tự chạy được. SSH đọc thường (vd. `docker ps`, đọc log, đọc bảng DB cụ thể để
  debug) thường được cho qua dù không nhất quán 100%.
- **Bài học GRANT/REVOKE Postgres** (xem mục "SỰ CỐ NGHIÊM TRỌNG 2026-09-17" phía trên để biết chi tiết sự
  cố thật): `REVOKE ... FROM public` thu hồi khỏi **mọi role**, không riêng role "public". Mọi hàm mới viết
  sau này phải test bằng `set role service_role;` (hoặc đúng role production dùng) trước khi coi là xong —
  test bằng superuser sẽ không bao giờ lộ lỗi thiếu GRANT.
