# Prompt gửi AI khác: dịch 400 tiêu đề bài học sang 30 ngôn ngữ

Đính kèm file: `source-en-titles.json` (400 mục, dạng `{ "key": "...", "en": "..." }`).

---

Bạn là dịch giả chuyên nghiệp cho ứng dụng học tiếng Anh. Hãy dịch **400 tiêu đề bài học phát âm** trong file đính kèm từ tiếng Anh sang **31 ngôn ngữ** sau (mã ngôn ngữ):

bn (Bengali), el (Greek), et (Estonian), fa (Persian), fi (Finnish), fil (Filipino), gu (Gujarati), he (Hebrew), hr (Croatian), hu (Hungarian), is (Icelandic), km (Khmer), kn (Kannada), lt (Lithuanian), lv (Latvian), ml (Malayalam), mr (Marathi), ms (Malay), my (Burmese), nb (Norwegian Bokmål), ne (Nepali), pa (Punjabi), si (Sinhala), sk (Slovak), sl (Slovenian), sr (Serbian, chữ Latinh), ta (Tamil), te (Telugu), th (Thai), uk (Ukrainian), ur (Urdu)

(tổng cộng 31 ngôn ngữ; hãy làm đủ tất cả.)

## Quy tắc bắt buộc

1. **Giữ nguyên thứ tự và số lượng**: mỗi ngôn ngữ phải có đúng 400 mục, cùng `key` như file gốc. Không bỏ, không gộp, không thêm.
2. **Không sửa `key`**: chép nguyên văn từng `key`.
3. **Giữ nguyên bằng tiếng Anh, không dịch, không phiên âm sang chữ khác** các cụm tiếng Anh được trích dẫn là ví dụ phát âm, ví dụ: `'going to'`, `'because'`, `'them' as 'em`, `'your'`, `'yer'`, `'Did you eat yet?'`, `'a lot of'`, `kinda, sorta, lemme, gimme`, `wouldn't have → wouldn'ta`, `ain't — am not, is not, are not`, và toàn bộ các tiêu đề chỉ gồm từ tiếng Anh đời thường như `c'mon, gonna be, s'more`. Giữ cả dấu nháy đơn `'` đúng như bản gốc, **giữ nguyên chữ hoa/chữ thường** của cụm đó.
4. **IELTS, TOEFL, PTE** viết nguyên bằng chữ Latinh, không đổi sang chữ bản địa.
5. Với tiêu đề dạng `X — Y` (ví dụ `gotcha — got you`), giữ nguyên phần tiếng Anh, chỉ dịch phần chú thích như `(British)`, `(filler)`.
6. Giọng văn ngắn gọn, tự nhiên, đúng thuật ngữ ngôn ngữ học thông dụng trong ngôn ngữ đích (ví dụ: stress = trọng âm/nhấn, intonation = ngữ điệu, linking = nối âm, chunking = chia nhóm ý).
7. Dùng chữ viết chuẩn của từng ngôn ngữ (Serbian dùng chữ Latinh).

## Định dạng trả về

Với **mỗi ngôn ngữ, một file JSON riêng**, đặt tên `<mã>-titles.json` (ví dụ `th-titles.json`), là một mảng gồm đúng 400 phần tử, **theo đúng thứ tự file gốc**:

```json
[
  { "key": "ee2340b8-300b-41e7-830e-5501431b91be|title", "text": "<bản dịch>" },
  { "key": "220fe380-b5ec-4bd4-a4ca-376052cfaaaf|title", "text": "<bản dịch>" }
]
```

Lưu ý: trường dịch tên là `"text"` (không phải `"en"`).

Chỉ trả về nội dung file JSON hợp lệ (không giải thích). Nếu quá dài, chia theo từng ngôn ngữ, mỗi tin nhắn một file, và báo rõ mã ngôn ngữ ở đầu tin nhắn.

Trước khi gửi, hãy tự kiểm tra: mỗi file có đúng 400 phần tử, không trùng `key`, và các cụm tiếng Anh trong dấu nháy đơn vẫn còn nguyên.
