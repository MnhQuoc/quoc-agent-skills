---
name: frontend
description: Làm việc với code frontend/UI (component, gọi API, state, style) theo đúng framework và convention của project đang mở — không giả định React/Vue/thư viện cụ thể. Dùng khi user yêu cầu làm UI/giao diện/component, hoặc gõ /frontend.
---

# Frontend

## Mục tiêu
Implement/sửa UI đúng theo framework và convention **đã có sẵn trong project hiện tại**, không áp đặt stack cố định.

## Quy trình

### Bước 1 — Nhận diện stack của project
1. Đọc `package.json` để biết framework (React/Vue/Svelte/Angular/Next/Nuxt hoặc HTML/JS thuần) và bundler (Vite/Webpack/CRA...).
2. Tìm cách project hiện tại gọi API (fetch wrapper, axios instance, React Query/SWR hook, service layer riêng) — tái dùng, không viết cách gọi API mới song song.
3. Tìm hệ thống style đang dùng (CSS module, Tailwind, styled-components, SCSS, class thuần) và theme/token màu sắc nếu có.

### Bước 2 — Theo convention hiện có
1. Đặt component/hook mới cùng chỗ và cùng cấu trúc với các component tương tự đã có trong project.
2. Tái dùng component dùng chung (button, input, modal...) thay vì viết lại từ đầu.
3. Nếu project chưa có frontend nào (thư mục trống/mới) → hỏi user muốn dùng framework gì trước khi khởi tạo, đừng tự chọn.

### Bước 3 — Nguyên tắc UI chung
- Không dùng `innerHTML`/`dangerouslySetInnerHTML` với dữ liệu chưa escape (tránh XSS) — ưu tiên `textContent` hoặc binding của framework.
- Xử lý đầy đủ 3 trạng thái: loading / error / empty cho mọi màn hình gọi API.
- Accessibility cơ bản: `alt` cho ảnh, `label` cho input, có thể điều khiển bằng keyboard, contrast màu đủ đọc.
- Responsive theo breakpoint project đang dùng (nếu có sẵn), không hardcode kích thước cố định trừ khi cần.

## Gợi ý mở rộng
Nếu cần thêm pagination, tìm kiếm, xử lý lỗi nâng cao, hoặc chuyển đổi giữa framework — hỏi rõ yêu cầu trước khi triển khai.
