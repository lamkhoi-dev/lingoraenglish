# Thanh toán chuyển khoản SePay — tài liệu logic đầy đủ

Tài liệu này mô tả **toàn bộ** cách Lingora English thu tiền bằng chuyển khoản ngân hàng qua SePay (VietQR),
để bạn đem sang dự án khác. Mọi thứ dưới đây đã chạy thật trên production (tháng 10/2026), kể cả các lỗi đã gặp.
Tên file/hàm trỏ về mã nguồn của dự án này để bạn đối chiếu.

---

## 0. Tóm tắt trong 1 phút

1. Học viên chọn gói → server tạo **1 đơn** (`bank_transfer_orders`) với **mã đơn** duy nhất (`LGR` + 8 ký tự) và số tiền VND.
2. Web hiện **QR VietQR** có sẵn số tiền + nội dung chuyển khoản. (Với VietinBank cá nhân, nội dung **phải bắt đầu bằng `SEVQR`**.)
3. Học viên chuyển tiền. Ngân hàng báo biến động số dư cho **SePay**.
4. SePay gọi **webhook** của bạn. Server xác thực chữ ký, **tìm mã đơn trong nội dung**, kiểm tra **số tiền**, rồi **kích hoạt gói**.
5. Phòng khi webhook hỏng: server còn **tự hỏi SePay** (đối soát) mỗi 2 phút, và mỗi ~15 giây khi học viên đang mở trang chờ.
6. Gói chuyển khoản là **trả trước một kỳ**, **không tự gia hạn** → hệ thống **gửi email nhắc** 7/3/1 ngày trước hạn và cho **gia hạn sớm** (kỳ mới cộng tiếp từ ngày hết hạn).
7. Tiền chưa khớp (sai nội dung/số tiền/trễ hạn) **không bị bỏ quên**: vào danh sách "giao dịch chưa khớp" cho admin gắn tay, kèm nút "Tôi đã chuyển khoản" cho học viên.

Nguyên tắc vàng: **tiền khách chuyển phải luôn được ghi nhận**, kể cả khi khớp tự động thất bại.

---

## 1. Kiến trúc

```
Học viên ──chọn gói──▶ createBankTransferOrder ──▶ bank_transfer_orders (pending)
    │                         │
    │                         └─▶ QR (qr.sepay.vn) + nội dung "SEVQR LGRxxxxxxxx" (VietinBank)
    │
    └──quét QR, chuyển tiền──▶ Ngân hàng ──▶ SePay ──┬─ webhook POST ─▶ /api/public/payments/sepay-webhook ─┐
                                                      │                                                      ▼
                                       (SePay lưu giao dịch)                                  settleSepayTransfer()  ◀── dùng chung
                                                      ▲                                                      ▲
   reconcileSepay() ◀─ mỗi 2 phút / mỗi ~15s khi học viên chờ / nút "Check SePay now" ── GET /transactions/list ┘
                                                                                                             │
                                                                              activateBankTransferOrder()   ▼
                                                                              ghi đơn → paid + upsert subscriptions
```

Điểm mấu chốt: **chỉ có MỘT hàm khớp tiền** (`settleSepayTransfer`), webhook và đối soát cùng gọi nó. Chống trùng bằng bảng
`processed_webhook_events`, nên giao dịch nào thấy trước thì xử lý, đường còn lại bỏ qua.

File chính:

| File | Vai trò |
|---|---|
| `src/lib/sepay.server.ts` | Tạo mã đơn, QR, nội dung chuyển khoản, xác thực webhook, tách mã đơn từ nội dung, đọc tài khoản ngân hàng từ SePay |
| `src/lib/bank-transfer.server.ts` | Khớp tiền (`settleSepayTransfer`), kích hoạt gói, chống trùng, đối soát, chặn mua trùng, vòng lặp nền |
| `src/lib/bank-transfer.functions.ts` | Server functions: tạo đơn, đọc đơn, "Tôi đã chuyển khoản", và các hàm admin |
| `src/routes/api/public/payments/sepay-webhook.ts` | Endpoint webhook |
| `src/lib/renewal-reminders.server.ts` | Email nhắc gia hạn |
| `src/components/lily/bank-transfer-checkout.tsx` | Trang học viên: QR, đếm ngược, polling, nút "Tôi đã chuyển khoản" |
| `src/components/lily/admin-bank-transfers.tsx` | Admin: sức khỏe SePay, đơn đang mở, giao dịch chưa khớp, gắn/xác nhận tay |
| `src/components/lily/admin-billing.tsx` | Admin: bảng gói + nút Revoke |
| `src/server.ts` | Khởi động vòng lặp nền ở request đầu tiên |

---

## 2. Thiết lập phía SePay (làm trước khi code)

1. Tạo tài khoản my.sepay.vn, **liên kết tài khoản ngân hàng nhận tiền**.
2. Lấy **API key** (Bearer token) để gọi API đọc giao dịch/tài khoản → biến `SEPAY_API_KEY`.
3. Tạo **Webhook** (Tích hợp → Webhooks):
   - URL: `https://<domain>/api/public/payments/sepay-webhook`
   - Sự kiện: **Có tiền vào**
   - Kiểu chứng thực: **HMAC-SHA256** (Secret Key) *hoặc* **API Key** → giá trị dán vào `SEPAY_WEBHOOK_SECRET`
   - Kiểu nội dung: JSON
   - Nếu SePay bật "bỏ qua giao dịch không có mã thanh toán" thì phải khai tiền tố mã (`LGR`) trong cấu hình SePay, nếu không webhook không bao giờ được gọi. Cách an toàn: **tắt** tuỳ chọn đó (code tự tách mã từ nội dung).
4. ⚠️ **VietinBank cá nhân**: SePay chỉ nhận thông báo biến động số dư khi **nội dung chuyển khoản bắt đầu bằng `SEVQR`**
   (https://docs.sepay.vn/ket-noi-vietinbank.html, "bắt buộc"). Đây là nguyên nhân khiến mọi giao dịch "LGR…" đã bị mất hoàn toàn
   (tiền vào ngân hàng nhưng SePay không thấy gì). Ngân hàng khác thường không cần. Hỏi SePay nếu dùng ngân hàng khác.
5. Webhook SePay coi là thành công khi: HTTP **200/201** + body JSON `{"success": true}` + trong 30 giây. Lỗi thì SePay **retry tối đa 7 lần
   trong ~5 giờ** (khoảng cách tăng dần kiểu Fibonacci). → Server **chỉ trả non-200 khi có lỗi thật cần retry**; mọi trường hợp "không khớp"
   vẫn trả 200 để SePay ngừng retry, và lưu lại cho admin xử lý.

---

## 3. Biến môi trường

| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `SEPAY_API_KEY` | Có | Bearer token gọi API SePay (lấy tài khoản ngân hàng, danh sách giao dịch) |
| `SEPAY_WEBHOOK_SECRET` | Có | Secret/API key để xác thực webhook. **Không đặt → webhook từ chối mọi request** (fail-closed) |
| `APP_URL` | Có | Dùng làm link trong email |
| `SEPAY_TRANSFER_PREFIX` | Không | Ghi đè tiền tố nội dung (mặc định tự thêm `SEVQR ` nếu ngân hàng là VietinBank/ICB; đặt rỗng = không tiền tố) |
| `USD_TO_VND_RATE` | Không | Tỷ giá quy đổi (mặc định 25500). Giá VND = giá USD × tỷ giá, làm tròn 1.000 |
| `SEPAY_BANK_NAME`, `SEPAY_VIETQR_BANK_CODE`, `SEPAY_ACCOUNT_NUMBER`, `SEPAY_ACCOUNT_NAME` | Không | Dự phòng khi không đọc được tài khoản từ API SePay |
| `SMTP_*` | Cho email | Email nhắc gia hạn / báo admin |
| `ADMIN_NOTIFY_EMAIL` | Không | Nhận email khi học viên bấm "Tôi đã chuyển khoản" mà chưa khớp |

Không hard-code số tài khoản: lấy từ `GET https://userapi.sepay.vn/v2/bank-accounts` (cache 5 phút), fallback v1
`https://my.sepay.vn/userapi/bankaccounts/list`, fallback biến môi trường.

---

## 4. Cơ sở dữ liệu

```sql
CREATE TABLE bank_transfer_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_key text NOT NULL,           -- vd premium / ielts_pro
  price_id text NOT NULL,           -- vd lily_premium_monthly
  product_id text NOT NULL,         -- = tier của gói
  billing_interval text NOT NULL,   -- 'month' | 'year'
  amount_vnd integer NOT NULL,      -- số tiền PHẢI chuyển (VND, không có phần lẻ)
  reference_code text NOT NULL UNIQUE,   -- mã đơn "LGR" + 8 ký tự
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','expired','cancelled')),
  sepay_transaction_id text,        -- id giao dịch SePay đã dùng cho đơn (NULL nếu admin xác nhận tay)
  paid_at timestamptz,
  expires_at timestamptz NOT NULL,  -- tạo + 30 phút
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON bank_transfer_orders(user_id);
CREATE INDEX ON bank_transfer_orders(status);
```

Bảng dùng chung có sẵn:

- `subscriptions` — mỗi đơn đã trả tạo **một dòng** với `provider_subscription_id = 'sepay_<order id>'`, `provider_customer_id = 'sepay_user_<user id>'`,
  `currency='VND'`, `amount = amount_vnd`, `cancel_at_period_end = true` (**cố ý**: chuyển khoản không tự gia hạn). Nhờ vậy toàn bộ logic
  phân quyền cũ (`has_active_subscription`, `effective_tier`) chạy nguyên, không cần biết có chuyện chuyển khoản.
- `processed_webhook_events (event_id, environment, event_type, processed_at)` PK `(event_id, environment)` — chống xử lý trùng:
  `event_id = 'sepay_<id giao dịch SePay>'`, `environment = 'sepay'`. `event_type`: `sepay.transfer.in` (webhook), `sepay.reconciled`
  (đối soát), `sepay.admin_attached` (admin gắn tay).
- `billing_events` — nhật ký: `bank_transfer_order_created`, `bank_transfer_paid`, `bank_transfer_reported` (học viên bấm "đã chuyển"),
  `renewal_reminder_sent`.
- `admin_audit_log` — `bank_transfer_confirmed_manually`, `bank_transfer_attached`, `bank_transfer_revoked`.

Quy tắc quyền (SQL): `has_active_subscription` coi gói `active/trialing/past_due` còn hiệu lực đến `current_period_end`
(+ ngày ân hạn), và gói `canceled` **vẫn còn hiệu lực đến `current_period_end`**. Vì vậy **thu hồi ngay** = `status='canceled'` **và**
`current_period_end = now()`.

---

## 5. Tạo đơn (`createBankTransferOrder`)

Điều kiện/quy trình, theo thứ tự:

1. Yêu cầu đăng nhập. Tìm gói theo `priceId` (chỉ nhận gói active, không phải free, giá > 0).
2. **Chặn mua trùng phía server** (`assertCanPurchase`): xem mục 11.
3. Số tiền: `usdCentsToVnd(giáUSDcent)` = `round(usd × tỷgiá / 1000) × 1000`. **Một bảng giá duy nhất (USD)**, không có bảng giá VND riêng để khỏi lệch.
4. **Dùng lại đơn đang chờ**: nếu người này đã có đơn `pending` cùng `price_id` còn ≥ 5 phút → trả luôn đơn đó (không tạo mã mới).
   (Trước đây mỗi lần bấm sinh một mã mới → một tài khoản có 5 đơn.)
5. Sinh mã: `LGR` + 8 ký tự từ `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (bỏ `0 O 1 I L` cho dễ đọc). Cột UNIQUE; va chạm thì sinh lại 1 lần.
6. Ghi đơn `pending`, `expires_at = now + 30 phút`. Ghi `billing_events`.
7. Trả về dữ liệu hiển thị: ngân hàng, số tài khoản, chủ tài khoản, số tiền, **`transfer_content`**, `qr_url`, `expires_at`.

### Nội dung chuyển khoản và QR

```ts
// sepay.server.ts
export function transferContentFor(referenceCode: string, bank: SepayBankAccount): string {
  const override = process.env["SEPAY_TRANSFER_PREFIX"];
  if (override !== undefined) {
    const prefix = override.trim();
    return prefix ? `${prefix} ${referenceCode}` : referenceCode;
  }
  const isVietinBank = /vietin|\bicb\b/i.test(`${bank.bankCode} ${bank.bankName}`);
  return isVietinBank ? `SEVQR ${referenceCode}` : referenceCode;
}

// Ảnh QR chính thức của SePay (tự điền số tiền + nội dung):
// https://qr.sepay.vn/img?acc=<số TK>&bank=<tên/mã NH>&amount=<VND>&des=<nội dung>&template=compact
// Dự phòng: https://img.vietqr.io/image/<bank>-<số TK>-compact2.png?amount=..&addInfo=<nội dung>&accountName=..
```

Trang thanh toán phải hiện **cả QR lẫn ô "Nội dung chuyển khoản" có nút Copy** (`order.transfer_content`, không phải `reference_code`),
kèm lưu ý "nhập đúng nguyên văn, kể cả từ đầu tiên".

---

## 6. Webhook (`sepay-webhook.ts`)

Payload SePay gửi (các trường dùng): `id` (số nguyên), `transferType` (`in`/`out`), `transferAmount`, `content`, `description`, `code`
(có thể null), `transactionDate`, `accountNumber`, `gateway`.

Quy trình `POST`:

1. Đọc **raw body** (`req.text()`) — **phải dùng raw body** để kiểm tra chữ ký, không `JSON.stringify` lại.
2. Không có `SEPAY_WEBHOOK_SECRET` → 400 (fail-closed).
3. **Xác thực** (`verifySepayRequest`), chấp nhận một trong hai:
   - **API Key**: header `Authorization: Apikey <KEY>` (hoặc `Bearer`, hoặc `x-api-key`/`x-sepay-api-key`), so sánh **timing-safe** với secret.
   - **HMAC-SHA256**: header `X-SePay-Signature: sha256=<hex>` + `X-SePay-Timestamp: <unix giây>`; chuỗi ký là **`{timestamp}.{raw_body}`**,
     HMAC bằng Secret Key, hex; lệch quá **300 giây** thì từ chối (chống replay).
   ```ts
   const expected = createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex");
   timingSafeEqual(Buffer.from(provided), Buffer.from(expected)); // provided = sig bỏ tiền tố "sha256="
   ```
4. `transferType !== "in"` → 200 `{success:true}` (bỏ qua tiền ra).
5. Gọi `settleSepayTransfer(...)` rồi **luôn trả 200 `{success:true}`** (kể cả không khớp — để SePay ngừng retry).
6. Nếu `settleSepayTransfer` **ném lỗi** (DB lỗi…) → đã nhả "claim" (xem dưới) → trả 400 để SePay **retry**.

---

## 7. Khớp tiền và kích hoạt (`settleSepayTransfer`) — trái tim của hệ thống

Đầu vào chuẩn hoá: `{ id, amount, content, description?, code? }`. Dùng chung cho webhook (`source="webhook"`),
đối soát (`"reconcile"`) và admin gắn tay (`"admin"`).

```text
1. claimTransfer(id)          INSERT processed_webhook_events ... ON CONFLICT DO NOTHING
                              → đã có rồi?  → trả "duplicate"  (an toàn khi webhook retry / 2 đường cùng thấy)
2. extractReferenceCode()     lấy code SePay (nếu bắt đầu "LGR") hoặc regex /LGR[23456789A-HJKMNP-Z]{8}/i trên "content + description",
                              không phân biệt hoa/thường, trả về chữ HOA
                              → không có → "no_code"
3. tìm đơn theo reference_code → không có → "no_order"
4. đơn đã "paid"              → "already_paid"  (nếu id giao dịch khác: cảnh báo "trả lần hai")
5. đơn "cancelled"            → "order_cancelled" (admin đã thu hồi — để admin xem)
6. amount !== amount_vnd      → "amount_mismatch" (KHÔNG tự kích hoạt)
7. đơn hết hạn (expired hoặc quá expires_at):
     còn trong 7 ngày kể từ lúc tạo → vẫn kích hoạt  ("activated_late")  ← tiền đã vào thì khách phải có gói
     quá 7 ngày                      → "too_late" (để admin xử lý)
8. activateBankTransferOrder(order.id, transfer.id) → "activated"
   Nếu bước 2-8 ném lỗi → releaseTransfer(id) (xoá claim) → ném lỗi lên cho webhook trả 400 → SePay retry
```

Mọi kết quả khác "activated" đều `console.warn("[sepay] ...")` — và hiện trong "Giao dịch chưa khớp" của admin.

### `activateBankTransferOrder`

- Nếu đơn đã `paid` → trả về luôn (idempotent).
- **Kỳ mới**: nếu người này đang có gói **cùng bậc** còn hiệu lực kết thúc sau hiện tại → **kỳ mới bắt đầu từ ngày hết hạn của gói đó**
  (gia hạn sớm không mất ngày). Ngược lại bắt đầu từ bây giờ. Hết hạn = +1 tháng hoặc +1 năm.
- Một giao dịch DB: đơn → `paid` (+ `sepay_transaction_id`, `paid_at`) và upsert `subscriptions` (`ON CONFLICT (provider_subscription_id) DO UPDATE`).
- Ghi `billing_events: bank_transfer_paid`.

---

## 8. Đối soát tự động (`reconcileSepay`) — lớp bảo hiểm khi webhook hỏng

Đọc `GET https://my.sepay.vn/userapi/transactions/list?limit=100` (header `Authorization: Bearer <SEPAY_API_KEY>`).
Mỗi giao dịch có: `id`, `transaction_date` (**giờ Việt Nam**, dạng `YYYY-MM-DD HH:mm:ss`), `amount_in`, `transaction_content`, `code`,
`reference_number`. Cho những giao dịch tiền vào chưa có trong `processed_webhook_events` → gọi `settleSepayTransfer(..., "reconcile")`.

Lưu ý quan trọng:
- **Dùng API v1 cho chống trùng**: id v1 là số nguyên, **giống `id` trong webhook**. API v2 (`userapi.sepay.vn/v2/transactions`) dùng **UUID**
  nên không khớp với webhook → sẽ xử lý trùng. v2 chỉ nên dùng để đọc tài khoản (`/v2/bank-accounts`: `last_transaction`, `active`…).
- Chạy khi nào: mỗi **2 phút** (vòng lặp nền, chỉ gọi SePay **khi còn đơn có thể được trả**: pending hoặc expired ≤ 7 ngày), mỗi **~15 giây**
  khi học viên đang mở trang chờ (gọi kiểu fire-and-forget trong `getBankTransferOrder`), và nút **"Check SePay now"** của admin.
- Chống gọi dồn: các lệnh gọi đồng thời dùng chung một lần chạy; gọi trong vòng 15 giây tái dùng kết quả (trừ `force`).
- Vòng lặp nền khởi động ở **request đầu tiên** trong `src/server.ts` (health check của container gọi `/` mỗi 30 giây nên chạy ngay sau deploy).
  Nếu dự án mới chạy serverless (Vercel/Cloudflare) thì **không có vòng lặp nền** → dùng cron của nền tảng gọi một endpoint đối soát.
- Nếu đối soát phải kích hoạt thay webhook → ghi cảnh báo "webhook không giao trước" để bạn kiểm tra lại cấu hình webhook.

---

## 9. Phía học viên

### Trang chờ thanh toán (`bank-transfer-checkout.tsx`)
- Hiện QR, ô thông tin chuyển khoản thủ công (có Copy), **đếm ngược 30 phút**, chỉ báo "đang chờ thanh toán tự động".
- **Polling 3 giây** `getBankTransferOrder`: trạng thái `paid` → màn hình "Thanh toán thành công" (đồng hồ dừng). Server lười chuyển đơn quá hạn sang `expired`.
- Trang `expired` **không phải ngõ cụt**: giải thích "chuyển đúng số tiền + nội dung trong 7 ngày vẫn được kích hoạt" + nút **Tôi đã chuyển khoản**.
- Chuẩn hoá timestamp Postgres (`"2026-10-05 02:46:12+00"`) trước khi `Date.parse` (Safari không đọc dạng thô).

### Nút "Tôi đã chuyển khoản" (`reportBankTransferSent`)
1. Kiểm tra quyền sở hữu đơn; đơn `cancelled` → báo lỗi; đã `paid` → xong.
2. Gọi **đối soát ngay** (có throttle). Nếu tiền đã có → gói bật ngay.
3. Chưa khớp → ghi `billing_events: bank_transfer_reported` (**tối đa 1 lần/10 phút/đơn**), email `ADMIN_NOTIFY_EMAIL` (nếu có),
   admin thấy "Learner says paid" + cảnh báo. Trang học viên hiện "Đã ghi nhận… quản trị viên sẽ kiểm tra sao kê".
4. Với đơn hết hạn, trang tiếp tục polling thêm 30 phút sau khi bấm.

### Mua trùng / gia hạn (`assertCanPurchase`, mục 11) và nút gia hạn trên Pricing
- Gói hiện tại là chuyển khoản **và còn ≤ 7 ngày** → nút **"Gia hạn bằng chuyển khoản"**, kèm câu "thời gian mới cộng tiếp từ ngày hết hạn".
- Ngoài khoảng đó nút mua của gói đang dùng bị ẩn (giao diện) **và bị chặn phía server**.

### Hiển thị tiền VND — bẫy đã dính
VND **không có đơn vị nhỏ**: `amount` lưu **255000 = ₫255.000**. Code cũ chia 100 như USD nên hiện "₫2,550" ở nhiều chỗ và làm MRR phồng ~255 lần.
Dùng hàm `minorToMajor(amount, currency)` (danh sách tiền không có phần lẻ: VND, JPY, KRW…). MRR quy về USD: `amountVnd / tỷgiá` (không chia 100).

---

## 10. Phía admin

Trang **Admin → Billing → Bank transfers (SePay)** (`adminSepayStatus` lấy dữ liệu sống từ SePay):

- **Sức khỏe**: tài khoản ngân hàng (ẩn số), giao dịch cuối SePay thấy, webhook cuối nhận, lần đối soát cuối.
- **Cảnh báo**: thiếu `SEPAY_API_KEY`/`SEPAY_WEBHOOK_SECRET`; không đọc được tài khoản; tài khoản inactive; đối soát lỗi; đối soát phải kích hoạt thay
  webhook; **đơn chờ ≥ 10 phút mà SePay không có giao dịch nào sau đó** (gợi ý: kiểm tra sao kê, SEVQR, kết nối ngân hàng); học viên báo đã chuyển nhưng chưa khớp.
  *(Màn hình này lẽ ra phát hiện lỗi SEVQR từ 22/09 — đáng đầu tư.)*
- **Đơn đang mở** (pending + expired ≤ 7 ngày) với nút **Confirm manually…** — **bắt buộc nhập lý do ≥ 8 ký tự**, ghi `admin_audit_log`.
  Chỉ dùng cho tiền mà **SePay không ghi nhận** (đã đối chiếu sao kê).
- **Giao dịch chưa khớp** (tiền SePay ghi nhận trong 30 ngày, chưa gắn đơn `paid`): hiện nội dung, lý do không khớp (không có mã / mã không có đơn /
  sai số tiền / đơn đã thu hồi / trả lần hai), và danh sách đơn ứng viên → nút **Attach** (`adminAttachSepayTransaction`):
  kiểm tra giao dịch có trong danh sách SePay và chưa gắn đơn nào → `claimTransfer(..., "admin")` → kích hoạt → ghi audit.
- **Revoke** (`adminRevokeBankTransferOrder`, trên bảng Subscriptions, bấm 2 lần "Revoke" → "Confirm revoke"): gói → `status='canceled'`,
  `current_period_end=now()` (mất quyền **ngay**), đơn `paid` → `cancelled`, giữ dòng để có lịch sử, ghi audit. Giao diện cập nhật ngay không cần F5
  (`setQueryData` + `invalidateQueries`).
- Bảng Subscriptions: cột email, phân trang, gói chuyển khoản hiển thị "bank transfer, no auto-renew" thay vì "cancelling".

⚠️ Bài học bảo mật: nút "Mark as paid" cũ **không ghi nhật ký và không hỏi lại** → 16 đơn chưa trả tiền bị bấm "paid" trong 25 giây, cấp gói miễn phí cho 5 tài khoản.
Vì vậy: bắt buộc lý do, ghi audit, ưu tiên "Attach giao dịch thật".

---

## 11. Chặn mua trùng và gia hạn (`assertCanPurchase(userId, tier, method)`)

Chạy ở cả `createBankTransferOrder` lẫn `createCheckoutSession` (thẻ). Lấy danh sách gói trả phí còn hiệu lực (`activePaidCoverage`), rồi với mỗi gói **cùng bậc hoặc cao hơn**:

- Gói thẻ tự gia hạn → chặn ("quản lý ở trang Billing").
- Còn hiệu lực > 7 ngày → chặn ("đã có gói đến dd/mm, gia hạn trong 7 ngày cuối").
- Trong 7 ngày cuối: cho gia hạn bằng chuyển khoản; gói **thẻ** đã tắt gia hạn thì chặn mua mới bằng thẻ (phải bật lại ở Billing, tránh sinh Stripe subscription thứ hai).
- Nâng lên bậc cao hơn luôn được phép.

Thứ hạng bậc: `free 0 < premium 1 < ielts_pro 2`.

---

## 12. Email nhắc gia hạn (`renewal-reminders.server.ts`)

- Chạy **mỗi giờ** (lần đầu sau 1 phút khi server khởi động). Chỉ xét subscription `sepay_%`, `status='active'`, hết hạn trong 7 ngày tới.
- Mốc **7 / 3 / 1 ngày**: chọn mốc nhỏ nhất còn ≥ thời gian còn lại (lỡ mốc 7 vẫn gửi mốc 3).
- **Chỉ gửi 08:00–21:00 giờ Việt Nam**.
- **Chống gửi trùng** bằng `billing_events` `renewal_reminder_sent` với `metadata.key = "<provider_sub_id>:<ngày hết hạn>:<n>d"`.
- **Bỏ qua** nếu học viên đã gia hạn (có gói cùng/hơn bậc kéo dài hơn).
- Ngôn ngữ theo `profiles.interface_language` (vi → tiếng Việt, còn lại tiếng Anh). Nút dẫn tới `${APP_URL}/pricing?interval=month|year`.
- Thân email có nói: nếu không gia hạn thì tự về gói miễn phí.
- Gửi qua `sendEmail` (nodemailer SMTP). Không có `SMTP_HOST` → chỉ log, không gửi.

---

## 13. Những bài học / lỗi đã gặp (đọc kỹ trước khi làm lại)

1. **VietinBank cá nhân cần `SEVQR` ở đầu nội dung.** Thiếu → SePay không nhận biến động số dư → không có webhook, không có giao dịch, tiền "mất tích".
2. **Webhook trống ≠ webhook hỏng.** Kiểm tra bằng `GET /v2/transactions` của SePay và log nginx: nếu SePay **chưa có giao dịch** thì không có gì để gửi.
3. **Luôn có đối soát + màn hình sức khỏe**, đừng chỉ tin webhook.
4. **VND không chia 100** khi hiển thị/tính MRR.
5. **v1 vs v2 id**: dùng v1 (số nguyên) để chống trùng với webhook.
6. **Raw body** khi kiểm tra HMAC.
7. **Đơn hết hạn vẫn nhận tiền muộn** (7 ngày), nếu không khách trả tiền mà không có gói và không ai biết.
8. **Nhả "claim" khi xử lý lỗi** để SePay retry không bị coi là trùng.
9. **Một đơn pending cho mỗi người/gói** (dùng lại), tránh 5 mã cho một tài khoản.
10. **Nút xác nhận tay phải có lý do + audit**, ưu tiên gắn giao dịch thật.
11. **Thu hồi = canceled + period_end = now** (vì quy tắc quyền giữ gói canceled đến hết kỳ).
12. **`docker compose up -d` không recreate nếu image không đổi** → đổi riêng `.env` cần `--force-recreate`.
13. Cẩn thận khi sửa regex bằng lệnh shell: dấu `\` có thể bị mất (`[\s,;]` thành `[s,;]` từng cắt key tại chữ "s").

---

## 14. Cách kiểm thử

**Webhook, không tác động dữ liệu (dùng `transferType:"out"`):**

```js
import { createHmac } from "node:crypto";
const secret = process.env.SEPAY_WEBHOOK_SECRET, url = "https://<domain>/api/public/payments/sepay-webhook";
const body = JSON.stringify({ id: 0, transferType: "out", transferAmount: 1, content: "diagnostic ping" });
const ts = Math.floor(Date.now() / 1000);
const sig = "sha256=" + createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-SePay-Signature": sig, "X-SePay-Timestamp": String(ts) }, body }); // 200
await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });                                                        // 400
await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Apikey ${secret}` }, body });                       // 200 nếu dùng API Key
```
Cũng nên thử: sửa body sau khi ký (400), timestamp cũ 10 phút (400), ký bằng secret sai (400).

**Tách mã đơn:** `"SEVQR LGRKPVMB46S"`, `"480D61005XYZ SEVQR lgrkpvmb46s chuyen khoan"`, `"SEVQRLGRKPVMB46S"` đều phải ra `LGRKPVMB46S`.

**Đầu-cuối thật:** tạo đơn → quét QR (nội dung hiện `SEVQR LGR…`) → chuyển đúng số tiền → trong vài giây đến vài phút gói bật;
`GET /v2/transactions` của SePay phải có giao dịch mới; log nginx phải có POST từ SePay (HTTP 200).

**Kiểm tra thu hồi an toàn:** mở transaction, `UPDATE subscriptions SET status='canceled', current_period_end=now() ...`, chạy `effective_tier(user,'live')`, rồi `ROLLBACK`.

---

## 15. Checklist đem sang dự án khác

- [ ] Bảng `bank_transfer_orders` (mục 4) + bảng chống trùng sự kiện + `billing_events` + `admin_audit_log`.
- [ ] Bảng gói/đăng ký của bạn: cột để ghi một "gói đã trả" (provider id dạng `sepay_<order id>`), và quy tắc quyền hiểu `canceled + period_end`.
- [ ] `SEPAY_API_KEY`, `SEPAY_WEBHOOK_SECRET` và webhook cấu hình đúng URL/sự kiện/chứng thực trong SePay.
- [ ] Nội dung chuyển khoản đúng tiền tố ngân hàng (SEVQR cho VietinBank cá nhân).
- [ ] Endpoint webhook: raw body → xác thực (API key hoặc HMAC) → `settle` → luôn 200 trừ khi lỗi thật.
- [ ] Hàm `settle` dùng chung + chống trùng + trả muộn 7 ngày + kiểm tra số tiền.
- [ ] Đối soát (cron hoặc vòng lặp nền) bằng API **v1** transactions/list.
- [ ] Trang chờ thanh toán: QR + nội dung copy + đếm ngược + polling + nút "Tôi đã chuyển khoản" + trang hết hạn có lối ra.
- [ ] Admin: sức khỏe SePay, giao dịch chưa khớp + Attach, xác nhận tay có lý do + audit, Revoke.
- [ ] Chặn mua trùng phía server + gia hạn 7 ngày cuối (kỳ mới cộng tiếp).
- [ ] Email nhắc gia hạn 7/3/1 ngày + chống gửi trùng + giờ gửi hợp lý.
- [ ] Hiển thị VND không chia 100.
- [ ] Thử đầu-cuối bằng một giao dịch thật nhỏ trước khi mở bán.

---

## 16. Tham khảo SePay (đã đối chiếu)

- Xác thực webhook: https://developer.sepay.vn/en/sepay-webhooks/xac-thuc
- VietinBank cá nhân & SEVQR: https://docs.sepay.vn/ket-noi-vietinbank.html
- Cổng thanh toán SePay (VietQR + NAPAS + thẻ quốc tế, có IPN theo từng đơn, không cần khớp nội dung): https://developer.sepay.vn/en/cong-thanh-toan/gioi-thieu
- Bank Hub (liên kết nhiều ngân hàng, tự thêm SEVQR cho VietinBank): https://developer.sepay.vn/en/bankhub/tong-quan
- Việc **chưa** làm trong dự án này: đổi sang cổng thanh toán/tài khoản doanh nghiệp, tách tiền "chưa khớp" thành bảng riêng (hiện suy ra từ danh sách giao dịch SePay), bảng quản lý ngoại lệ hoàn tiền.
