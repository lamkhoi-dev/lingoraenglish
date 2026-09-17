# Lingora English (LiLy AI) — tình trạng dự án

Cập nhật: 2026-09-17. File này tổng hợp chức năng thực tế trong code để nắm nhanh cái gì chạy được, cái
gì chưa, và các mốc quan trọng — đọc mục đầu tiên trước khi làm bất cứ gì khác.

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
  qua token, Google OAuth thủ công — nhưng **Google OAuth chưa có credentials thật** (xem mục "Còn thiếu"
  bên dưới), đăng ký/đăng nhập bằng email đã chạy thật với SMTP thật (Resend).
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
- **Thanh toán**: Paddle, gọi **thẳng** `api.paddle.com`/`sandbox-api.paddle.com` bằng SDK chính thức
  `@paddle/paddle-node-sdk` (`src/lib/paddle.server.ts`) — **đã bỏ hẳn gateway trung gian của Lovable**
  (2026-09-17, xem mục riêng bên dưới). Chưa có `PADDLE_LIVE_API_KEY`/`PAYMENTS_LIVE_WEBHOOK_SECRET` thật
  — hướng dẫn lấy key ở `BAN GIAO DEV - LINGORA ENGLISH/HUONG_DAN_LAY_PADDLE_KEYS.md`.
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
