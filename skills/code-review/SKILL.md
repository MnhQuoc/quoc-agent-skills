---
name: code-review
description: Review source code theo chuẩn team — chất lượng, bảo mật, performance, maintainability. Dùng khi user yêu cầu review code, PR, diff, staged changes, hoặc gõ /code-review.
disable-model-invocation: true
---

# Code Review

## Mục tiêu
Review code một cách có hệ thống, ưu tiên vấn đề **Critical** và **High** trước style nhỏ. Skill này **chỉ đọc — không tự sửa code** (không dùng Write/StrReplace trong lượt này trừ khi user yêu cầu rõ ràng).

## Quy trình

### Bước 1 — Thu thập context
1. Xác định phạm vi review: file cụ thể, thư mục, hoặc git diff.
2. Nếu user không chỉ rõ → chạy `git diff` hoặc `git diff --staged`.
3. Đọc file liên quan (imports, tests, config) để hiểu ngữ cảnh.

### Bước 2 — Review theo checklist
| Hạng mục | Kiểm tra |
|----------|----------|
| **Correctness** | Logic đúng? Edge case? Null/undefined? Race condition? |
| **Security** | SQL injection, XSS, hardcoded secret, auth bypass, path traversal |
| **Error handling** | try/catch, HTTP status code, message lỗi có ý nghĩa |
| **Performance** | N+1 query, loop không cần thiết, re-render thừa (React) |
| **Maintainability** | Tên biến/hàm rõ, function quá dài (>50 dòng), duplicate code |
| **Testing** | Có test cho logic mới? Test case cover edge case? |
| **Convention** | Tuân thủ quy chuẩn backend/frontend của project |

### Bước 3 — Báo cáo từng finding
```
[CRITICAL|HIGH|MEDIUM|LOW] <tiêu đề ngắn>
File: path/to/file:Lxx
Vấn đề: ...
Đề xuất: ...
```

### Bước 4 — Output cuối
```markdown
## Tổng quan
- Files reviewed: N
- Verdict: ✅ Approve | ⚠️ Approve with comments | ❌ Request changes

## Findings
[danh sách ở bước 3]

## Điểm tốt
[ghi nhận những gì làm tốt]

## Đề xuất tiếp theo
[hành động cụ thể nếu cần sửa]
```

Nếu verdict là **❌ Request changes** hoặc có finding **CRITICAL**, nêu rõ ngay đầu phần tổng kết.

## Nguyên tắc
- Không nitpick style nếu chưa có vấn đề logic/bảo mật.
- Mỗi finding phải có **file + dòng** (hoặc tên function) cụ thể.
- Đề xuất fix phải actionable — không chỉ nói "code này xấu".
