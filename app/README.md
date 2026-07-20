# Skill Manager (app/)

Giao diện React (Vite) để quản lý skill của `quoc-agent-skills` qua trình duyệt, thay vì sửa tay từng file `skills/*/SKILL.md`.

Dữ liệu skill được lưu trong **MongoDB** qua API ở `../api/server.js` (xem `../README.md` ở gốc repo để biết chi tiết kiến trúc: MongoDB là nguồn dữ liệu chính, tự đồng bộ hai chiều với `skills/` trên đĩa và với `.agents/skills/` trong project).

## Chạy dev

Cần 2 tiến trình chạy song song (từ thư mục gốc `quoc-agent-skills/`):

```bash
# Terminal 1 - API (kết nối MongoDB, mặc định cổng 4322)
npm run api

# Terminal 2 - giao diện React (thư mục app/, mặc định cổng 5173)
cd app
npm install
npm run dev
```

Mở địa chỉ Vite in ra (ví dụ `http://localhost:5173`). Request `/api/*` được Vite proxy sang API ở `http://localhost:4322` (xem `vite.config.js`), nên không cần cấu hình CORS thêm khi phát triển.

> Cần MongoDB đang chạy (mặc định `mongodb://localhost:27017/quoc-agent-skills`, cấu hình qua biến `MONGODB_URI` trong file `.env` ở thư mục gốc).

## Tính năng

- **List** — danh sách toàn bộ skill lấy từ MongoDB, có nút Refresh.
- **Search** — tìm theo tên, slug hoặc mô tả (debounce khi gõ).
- **Create** — tạo skill mới (tên, mô tả, nội dung markdown không bắt buộc). Khi tạo, backend tự:
  - Lưu vào MongoDB.
  - Ghi ra `skills/<slug>/SKILL.md` trên đĩa (repo nguồn).
  - Cài luôn vào `.agents/skills/<slug>/SKILL.md` (project-local) để dùng được ngay qua `/<slug>` trong repo này.
- **Xem chi tiết** — click vào một skill (ở tab List hoặc Search) để mở modal xem đầy đủ mô tả và nội dung `SKILL.md`.
- **Xóa** — không có nút xóa trên UI; xóa folder `skills/<slug>` trực tiếp trên đĩa (VD trong VS Code Explorer) là đủ, backend tự phát hiện và xóa khỏi MongoDB (+ khỏi `.agents/skills/`) trong vài giây.
- **Đồng bộ skill có sẵn** — chạy `npm run sync-cursor` ở thư mục gốc repo để copy toàn bộ `skills/` sang `.agents/skills/` (dùng sau khi clone hoặc sửa tay file trong `skills/`).

## Cấu trúc chính

```
app/src/
├── api.js                     # gọi API /api/skills (fetch/search/create)
├── App.jsx                    # 3 tab: List / Search / Create
└── components/
    ├── SkillsList.jsx         # tab List
    ├── SkillSearch.jsx        # tab Search
    ├── SkillForm.jsx          # tab Create
    ├── SkillCard.jsx          # card hiển thị 1 skill, click để mở SkillDetail
    └── SkillDetail.jsx        # modal xem chi tiết skill
```

## Build production

```bash
npm run build   # xuất ra app/dist
npm run preview # xem thử bản build
```

Ứng dụng build ra là 1 SPA tĩnh — vẫn cần API (`npm run api` ở thư mục gốc) chạy và có thể truy cập được để gọi `/api/skills`.
