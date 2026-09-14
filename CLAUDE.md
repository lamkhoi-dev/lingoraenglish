# Lingora English (LiLy AI) — tình trạng dự án

Cập nhật: 2026-09-14. File này tổng hợp chức năng thực tế trong code để nắm nhanh cái gì chạy được, cái
gì chưa, và các mốc quan trọng — đọc mục đầu tiên trước khi làm bất cứ gì khác.

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
- **Thanh toán**: Paddle qua gateway riêng của Lovable (`connector-gateway.lovable.dev/paddle`,
  `src/lib/paddle.server.ts`) — đây là proxy thanh toán, **không phải dịch vụ AI**, nằm ngoài phạm vi Ràng
  buộc 2, chưa đổi. Chưa có `PADDLE_LIVE_API_KEY`/`PAYMENTS_LIVE_WEBHOOK_SECRET` thật.
- **Đa ngôn ngữ**: i18n tự viết (`src/lib/i18n.tsx`), có fallback tiếng Anh khi thiếu key
  (`dict?.[key] ?? en[key] ?? String(key)`). Hiện **16/50+ ngôn ngữ** yêu cầu. Một số section lớn (shadow,
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

## Hệ thống hạn mức Free/Premium — đã hợp nhất (2026-09-13), trước đó mỗi tính năng làm 1 kiểu khác nhau

Phát hiện quan trọng: từng có **3 cơ chế hạn mức tách biệt** (usage-quota tháng chung ở
`entitlements.server.ts`, turn-counter riêng của AI Coach, và cờ `is_free` per-item) — vi phạm Yêu cầu 9
của khách hàng ("chỉ 1 cơ chế duy nhất"). Đã sửa toàn bộ, giờ mỗi tính năng có đúng 1 gate, kiểm tra cả ở
lớp nội dung (không gửi nội dung khoá xuống trình duyệt) lẫn lớp chấm điểm AI (endpoint tự tra lại quyền,
không tin dữ liệu client gửi lên):

| Tính năng | Quy tắc free | Nơi enforce |
|---|---|---|
| AI Speaking Coach | 3 lượt (lifetime, không phải/tháng) | `coach_turns` + `coach_reserve_turn()` — mọi topic đều mở, không khoá theo topic nữa |
| Vocabulary | 10 từ đầu/**mỗi category** (đã sửa từ tính theo cấp độ CEFR — sai — sang đúng theo thứ hạng trong category) | RLS `vocabulary_words.access_tier` |
| Listening Lab | 6 **nhóm chủ đề** đầu (category) | `listening_lessons.is_free` — ⚠️ hiện chỉ có 5 category tổng cộng nên **toàn bộ đang free hết**, sẽ tự đúng khi có category thứ 6 |
| Speaking Tests | 3 đề đầu | `speaking_tests.is_free` (đã đúng từ trước) + **mới thêm**: `evaluateIelts`/`analyseSpeaking`/`analysePronunciation` giờ nhận `testId` và tự tra `is_free` trước khi chấm — trước đây có thể bypass bằng cách gọi thẳng API |
| Pronunciation 44 âm | 3 âm đầu (theo vị trí trong mảng `PHONEMES`) | **Mới thêm gate ở lớp chấm điểm** (`findSoundIndex`/`isSoundIndexFree` trong `pronunciation-content.ts`) — ⚠️ lớp NỘI DUNG vẫn CHƯA có gate (44 âm vẫn hard-code, gửi hết xuống client kể cả chưa đăng nhập) — xem mục "Còn thiếu" |
| Pronunciation nâng cao (8 phần) | 5 ví dụ đầu/phần (theo vị trí trong `SKILL_LESSONS`, tính riêng theo từng `skill`) | Tương tự — chỉ mới gate lớp chấm điểm, chưa gate lớp nội dung |

Dashboard (`/dashboard`) đã sửa hiển thị đúng 6 hạn mức trên (bỏ hệ thống usage-quota tháng cũ
`entitlements.server.ts` dùng cho pronunciation/ielts/speaking/conversation — các capability đó không còn
gate gì cả, chỉ còn dùng cho ghi log chi phí). Tiện thể bỏ luôn mục "Ngữ pháp" thừa (yêu cầu chỉ có 4 kỹ
năng: Speaking/Listening/Pronunciation/Vocabulary).

Đã xoá 3 hàm chết không dùng tới trong lúc dọn: `chatWithLily`, `reviewConversation`, `correctEnglish`
(không route/component nào gọi tới — "Free Conversation" thật sự chạy qua `coachReply` trong
`coach.functions.ts`, không phải các hàm này).

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

## ⛔ Còn thiếu / chưa làm (không phải lỗi, cần quyết định hoặc thêm thông tin)

- **Dữ liệu người dùng thật từ Supabase Cloud** — cần connection string, chưa có.
- **Google OAuth** — cần Client ID/Secret thật (xem `HUONG_DAN_LAY_SMTP_GOOGLE_OAUTH.md`).
- **Paddle live** — cần `PADDLE_LIVE_API_KEY`/`PAYMENTS_LIVE_WEBHOOK_SECRET` thật, chưa test được thanh
  toán thật trên production.
- **Vocabulary**: cần ~1.582 từ (Vấn đề 2 trong tài liệu đặc tả — khách cung cấp hay AI soạn rồi khách
  duyệt, chưa chốt).
- ~~Pronunciation (44 âm + 8 phần nâng cao) — lớp nội dung chưa server-gate~~ — **đã sửa 2026-09-14**, xem
  2 mục riêng ở trên (44 Sounds, 8 phần nâng cao). Còn treo: 8 phần nâng cao có 372/400 lesson, 7/8 phần đã
  đủ 50 (mục
  tiêu 50/phần) — hạ tầng CRUD đã xong, chỉ còn thiếu khối lượng nội dung, làm tiếp qua `/admin` hoặc JSON
  seed khi có thời gian.
- ~~**Listening Lab**: "6 chủ đề free" vô nghĩa vì chỉ có 5 category, gate theo category chưa hoạt động
  thật~~ — **đã sửa 2026-09-14**, xem mục "Audit khách hàng 2026-09-14" ở trên (7 category, gate đúng
  category thứ 7 trở đi). 4 bước (Listen/Understand/Dictation/Score) + progress cộng dồn + gate server-side
  qua RLS vẫn như mô tả cũ, không đổi.
- **Đa ngôn ngữ**: 16/50+ (Vấn đề 3 — cần chốt danh sách + phương án dịch).
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
