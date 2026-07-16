---
name: frontend
description: Các kỹ năng và công cụ phát triển giao diện Frontend (demo users list, gọi API) trong .claude/frontend. Dùng khi user yêu cầu làm việc với UI, giao diện, hoặc gõ /frontend.
---

# Frontend

## Mục đích
Skill frontend nhỏ dùng để demo và thử nghiệm: một trang tĩnh hiển thị danh sách users và một module gọi API.

## Các file chính (thư mục `.claude/frontend`)
- `index.html` — trang tĩnh hiển thị danh sách users, include `userService.js` + `users-list.js`.
- `userService.js` — module gọi API (mặc định: `/api/users`, fallback `https://jsonplaceholder.typicode.com/users`).
- `users-list.js` — logic lấy dữ liệu và render vào DOM (an toàn XSS, dùng `textContent`).
- `skills-hooks-demo.html` — demo React (CDN + Babel standalone) đầy đủ CRUD cho Skill Manager: list, search, create qua `/api/skills`. Độc lập với 3 file trên, không cần build step.

## Chạy nhanh
- Cách chuẩn: chạy backend (`npm start` trong `.claude/backend`) — server Express serve sẵn 2 file tĩnh này tại `http://localhost:3000/` và `http://localhost:3000/skills-hooks-demo.html`, đồng thời proxy đúng các route `/api/*`.
- Hoặc mở trực tiếp file `.claude/frontend/index.html` trong trình duyệt (chỉ dùng được nếu `userService.js` đang fallback sang jsonplaceholder, vì không có server nào phục vụ `/api/users`).

## Tùy chỉnh API
- Sửa URL trong `.claude/frontend/userService.js` để gọi API backend của dự án.
- Nếu cần authentication, thêm header hoặc wrapper trong `userService.js`.

## Tích hợp vào dự án
- Đưa `userService.js` và `users-list.js` vào hệ thống frontend hiện tại (React/Vue/Next) và chuyển logic render thành component.

## Gợi ý mở rộng
- Thêm pagination, tìm kiếm, xử lý lỗi nâng cao, hoặc UI library (Bootstrap/Material).
- Nếu muốn chuyển thành React/Next, hoặc cần gọi API có xác thực, hỏi user rồi triển khai.
