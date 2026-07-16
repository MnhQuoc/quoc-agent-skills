---
name: backend
description: Các kỹ năng và công cụ xử lý logic phía Backend (API, service, migration, tests trong .claude/backend). Dùng khi user yêu cầu làm việc với backend, endpoint, database, hoặc gõ /backend.
---

# Backend

## Mục đích
Cung cấp hướng dẫn và công cụ mẫu cho phần backend: API, service, và logic xử lý dữ liệu để tích hợp với frontend.

## Các file mẫu (thư mục `.claude/backend`)
- `server.js` / `app.py` / `main.go` — điểm khởi tạo server (tuỳ ngôn ngữ dự án).
- `routes/` — định nghĩa endpoint (ví dụ: `/api/users`).
- `services/` — logic gọi DB hoặc external API.
- `migrations/` — tập lệnh quản lý schema DB.
- `tests/` — unit/integration tests.

## Chạy nhanh (Node/Express ví dụ)
- Cài phụ thuộc: `npm install`.
- Chạy server: `node server.js` hoặc `npm start`.
- Tùy chọn dev: `npx nodemon server.js`.

## Cấu hình
- Qua biến môi trường: `PORT`, `DATABASE_URL`, `JWT_SECRET`, etc.
- Đặt file `.env` trong thư mục backend hoặc cấu hình CI/CD secrets.

## Cơ sở dữ liệu
- Sử dụng PostgreSQL / MySQL / SQLite tuỳ dự án.
- Chạy migrations trước khi khởi động server.

## Tùy chỉnh và mở rộng
- Thêm endpoint `/users` để trả danh sách users cho frontend.
- Bảo mật: áp dụng authentication (JWT/OAuth) và validation input.
- Nếu cần một template cụ thể (Express/Flask/.NET), hỏi user rồi triển khai.
