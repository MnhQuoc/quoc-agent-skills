---
name: backend
description: Làm việc với code backend (API, endpoint, service, database, migration, test) theo đúng stack và convention của project đang mở — không giả định framework cụ thể. Dùng khi user yêu cầu làm backend/API/endpoint/database, hoặc gõ /backend.
---

# Backend

## Mục tiêu
Implement/sửa backend đúng theo stack và convention **đã có sẵn trong project hiện tại**, không áp đặt một framework hay cấu trúc cố định.

## Quy trình

### Bước 1 — Nhận diện stack của project
1. Đọc file manifest phù hợp để biết ngôn ngữ/framework: `package.json` (Node — Express/Fastify/NestJS/Koa...), `requirements.txt`/`pyproject.toml` (Python — Django/FastAPI/Flask), `go.mod` (Go), `pom.xml`/`build.gradle` (Java/Kotlin), `Gemfile` (Ruby), `*.csproj` (.NET)...
2. Xác định ORM/DB đang dùng (Prisma/Mongoose/TypeORM/SQLAlchemy/GORM...) và cách chạy migration hiện có.
3. Tìm cấu trúc thư mục thật của project (routes/controllers, services, models, middlewares, tests) bằng Glob/Grep — không giả định tên thư mục.

### Bước 2 — Theo convention hiện có
1. Đặt route/service/model mới **cùng chỗ và cùng style** với các file tương tự đã có (naming, cách export, cách xử lý lỗi, cách validate input).
2. Tái dùng helper/middleware sẵn có (auth, logging, error handler) thay vì viết lại.
3. Nếu project chưa có backend nào (thư mục trống/mới) → hỏi user muốn dùng stack gì trước khi tạo file đầu tiên, đừng tự chọn.

### Bước 3 — Nguyên tắc khi viết code backend
- Validate input ở boundary (request body/query/params) trước khi xử lý.
- Trả HTTP status code đúng ngữ nghĩa, message lỗi rõ ràng, không leak stack trace/secret ra response.
- Không hardcode secret/connection string — dùng biến môi trường (`.env`, đọc qua `process.env`/`os.environ`/tương đương).
- Tránh N+1 query; migration phải backward-compatible khi có thể (không xoá cột đang được dùng mà không có kế hoạch).
- Viết test cho logic nghiệp vụ quan trọng (không chỉ test happy path).

## Bảo mật cần kiểm tra
SQL/NoSQL injection, XSS khi trả HTML, auth/authorization đúng scope, rate limiting cho endpoint nhạy cảm, CORS cấu hình hợp lý (không mở `*` cho API có auth).
