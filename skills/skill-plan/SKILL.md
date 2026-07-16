---
name: skill-plan
description: Lập kế hoạch triển khai chi tiết từ requirements — file cần sửa, thứ tự bước, rủi ro. Dùng sau skill-requirement, khi user hỏi "làm như nào", hoặc gõ /skill-plan.
---

# Skill Plan — Lập kế hoạch triển khai

## Mục tiêu
Chuyển Requirements Document thành **Implementation Plan** rõ ràng để user duyệt trước khi chuyển sang skill-implement. Skill này **chỉ đọc, không sửa file nào**.

## Đầu vào
- Output từ **skill-requirement** (REQ document hoặc tóm tắt trong chat).
- Nếu thiếu requirements → quay lại skill-requirement trước.

## Quy trình

### Bước 1 — Vào Plan mode
Nếu đang ở chế độ Agent thông thường, gọi **SwitchMode** sang `plan` ngay khi bắt đầu, để đảm bảo không có thay đổi code nào xảy ra trong lúc khảo sát và lập kế hoạch.

### Bước 2 — Phân tích requirements
1. Đọc lại toàn bộ AC (acceptance criteria).
2. Map mỗi AC → thay đổi code cụ thể.
3. Xác định thứ tự phụ thuộc (backend trước frontend, v.v.).

### Bước 3 — Khảo sát codebase
1. Đọc file/module trong phạm vi (Glob/Grep/Read).
2. Ghi pattern hiện có (naming, error handling, test).
3. Ước lượng độ phức tạp: `S` | `M` | `L`.

### Bước 4 — Trình bày Implementation Plan
```markdown
# Plan: {tiêu đề}

## Liên kết requirements
- Source: REQ-{slug}.md (hoặc tóm tắt requirements trong chat)
- Độ phức tạp: S | M | L

## Kiến trúc / approach
{Mô tả ngắn cách tiếp cận — 1 đoạn}

## Các bước triển khai

### Phase 1: {tên}
| # | Task | File(s) | Ghi chú |
|---|------|---------|---------|
| 1.1 | ... | path/to/file | ... |

### Phase 2: {tên}
...

## File thay đổi dự kiến
| File | Hành động | Lý do |
|------|-----------|-------|
| ... | create/edit/delete | ... |

## Test / verify
- [ ] Manual: ...
- [ ] Command: `...`

## Rủi ro & giảm thiểu
| Rủi ro | Mức | Cách xử lý |
|--------|-----|------------|
| ... | low/med/high | ... |
```

Plan phải đủ chi tiết để implement **không cần hỏi lại** trừ khi gặp blocker thật sự ngoài dự đoán.

### Bước 5 — Xử lý kết quả approval
- **User approve** → nội dung plan vừa approve trở thành input cho **skill-implement**.
- **User yêu cầu sửa** → điều chỉnh plan theo góp ý, trình bày lại.
- Nếu user đã nói "làm full luồng" từ đầu và approve → tự chuyển sang skill-implement ngay với plan vừa approve, không hỏi lại.

## Nguyên tắc
- Ưu tiên thay đổi nhỏ, tái sử dụng code hiện có.
- Không viết code, không sửa/tạo file ở bước này — chỉ đọc, phân tích, và trình bày plan.
- Mỗi task trong plan map được tới ít nhất một AC.
