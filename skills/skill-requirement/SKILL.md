---
name: skill-requirement
description: Thu thập và chuẩn hóa yêu cầu từ user thành tài liệu requirements có cấu trúc. Dùng khi bắt đầu task mới, user mô tả feature/bug, hoặc gõ /skill-requirement trước khi plan/implement.
---

# Skill Requirement — Nhận yêu cầu

## Mục tiêu
Biến yêu cầu thô của user thành **Requirements Document** rõ ràng, đủ để bước Plan triển khai được. Skill này **chỉ đọc và trình bày — không sửa/tạo file, không chạy lệnh shell**.

## Quy trình

### Bước 1 — Hiểu yêu cầu
1. Đọc kỹ message user (và @file/@folder nếu có).
2. Xác định loại task: `feature` | `bugfix` | `refactor` | `docs` | `other`.
3. Nếu thiếu thông tin quan trọng → dùng **AskQuestion** để hỏi tối đa 3 câu dạng trắc nghiệm, ưu tiên: phạm vi, ràng buộc, tiêu chí hoàn thành.

### Bước 2 — Khám phá context
1. Đọc cấu trúc project liên quan (không cần đọc toàn bộ repo).
2. Ghi nhận file/module hiện có sẽ bị ảnh hưởng (dùng Glob/Grep).
3. Liệt kê convention, skill project (`.cursor/skills/`).

### Bước 3 — Trình bày Requirements Document
```markdown
# Requirements: {tiêu đề ngắn}

## Tóm tắt
{1-2 câu mô tả mục tiêu}

## Loại task
feature | bugfix | refactor | docs

## Phạm vi
### Trong scope
- ...
### Ngoài scope
- ...

## User stories / Acceptance criteria
- [ ] AC1: ...
- [ ] AC2: ...

## Ràng buộc kỹ thuật
- Stack: ...
- File/module liên quan: ...
- Không được phá: ...

## Câu hỏi đã làm rõ
| Câu hỏi | Trả lời |
|---------|---------|

## Open questions (nếu còn)
- ...

## Handoff → skill-plan
**Sẵn sàng plan:** ✅ | ⚠️ Cần làm rõ thêm
```

### Bước 4 — Xác nhận với user
- Trình bày requirements ngắn gọn.
- Hỏi user approve trước khi chuyển sang **skill-plan** (trừ khi user yêu cầu chạy full luồng).

## Nguyên tắc
- Không đề xuất giải pháp kỹ thuật chi tiết ở bước này — chỉ **WHAT**, chưa **HOW**.
- Mỗi acceptance criterion phải **kiểm tra được**.
- Nếu user nói "làm full luồng" → sau khi hoàn thành, tự chuyển sang skill-plan với output của bước này.
