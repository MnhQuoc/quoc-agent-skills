---
name: skill-implement
description: Thực hiện code theo implementation plan — sửa file, chạy test, báo cáo kết quả. Dùng sau skill-plan, khi user nói "triển khai/thực hiện", hoặc gõ /skill-implement.
---

# Skill Implement — Thực hiện

## Mục tiêu
Triển khai đúng plan, đáp ứng acceptance criteria, báo cáo rõ ràng.

## Đầu vào
- Output từ **skill-plan** (PLAN document hoặc tóm tắt).
- Nếu thiếu plan → quay lại skill-plan.

## Quy trình

### Bước 1 — Chuẩn bị
1. Đọc plan và requirements (không bỏ qua AC).
2. Tạo checklist từ các task trong plan.
3. Xác nhận môi trường (deps, server, env).

### Bước 2 — Implement theo phase
1. Làm tuần tự theo plan — không nhảy phase.
2. Match convention project (đọc file lân cận trước khi sửa).
3. Scope tối thiểu: chỉ sửa những gì plan yêu cầu.
4. Sau mỗi phase quan trọng → kiểm tra nhanh (lint, chạy lệnh qua Shell).

### Bước 3 — Verify
1. Chạy test/verify trong plan.
2. Đối chiếu từng AC → đánh dấu done/pending.
3. Sửa lỗi phát sinh trước khi báo hoàn thành.

### Bước 4 — Báo cáo hoàn thành
```markdown
## Implementation Report

### Đã làm
- [x] Task 1.1: ...
- [x] Task 1.2: ...

### Files changed
| File | Thay đổi |
|------|----------|
| ... | ... |

### Acceptance criteria
- [x] AC1: ...
- [ ] AC2: ... (lý do nếu chưa)

### Verify
- Command: `...` → kết quả
- Manual: ...

### Ghi chú / follow-up
- ...
```

### Bước 5 — Handoff
- Nếu full luồng → chuyển sang **code-review** để review thay đổi vừa implement.

## Nguyên tắc
- Không commit git trừ khi user yêu cầu.
- Không mở rộng scope ngoài plan — ghi nhận follow-up riêng.
- Nếu plan sai/thiếu hoặc gặp blocker ngoài dự đoán → dừng, dùng **AskQuestion** để hỏi hướng xử lý (giữ nguyên plan cũ / cập nhật plan / bỏ qua phần đó), không tự đoán mò.
- Tuyệt đối không chạy lệnh nguy hiểm (`rm -rf`, `git push --force`, `git reset --hard`, `DROP TABLE`, xóa đệ quy trên Windows, `format`, `shutdown`...).
