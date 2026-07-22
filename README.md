# quoc-agent-skills

Bộ **Agent Skills** cá nhân của tôi, dùng chung cho nhiều project và nhiều AI coding agent (Cursor, Claude Code, Codex, v.v.) theo chuẩn [Agent Skills Specification](https://agentskills.io) 

[![Skills](https://img.shields.io/badge/▲_Xem_danh_sách_skill-171717?style=flat-square)](http://localhost:4321)

Mỗi skill là một thư mục trong `skills/` chứa file `SKILL.md` với YAML frontmatter (`name`, `description`) + nội dung hướng dẫn cho agent. Số lượng skill thay đổi liên tục (thêm/xóa) nên xem danh sách **luôn cập nhật** ở trang web local hoặc trực tiếp trong thư mục `skills/`, README này không liệt kê cứng để tránh lệch dữ liệu.

Bốn skill lõi `skill-requirement` → `skill-plan` → `skill-implement` → `code-review` tạo thành một quy trình làm việc end-to-end (yêu cầu → kế hoạch → code → review) và được khuyến nghị giữ nguyên tên khi cài sang project khác.

## Xem danh sách skill dạng trang web (local)

Chạy trang web với localhost

```bash
npm start
```

Sau đó mở **http://localhost:4321** trong trình duyệt — đây là danh sách skill luôn đúng với hiện trạng thư mục `skills/`. Mỗi khi thêm/sửa skill, chạy lại `npm start` (hoặc `npm run generate`) để cập nhật.

## Cách dùng ở project khác

### Cách 1 — dùng CLI `skills` (khuyến nghị, hỗ trợ 40+ agent)

Cài một skill cụ thể vào project hiện tại (thay `<ten-skill>` bằng slug thư mục trong `skills/`, ví dụ `backend`, `code-review`...):

```bash
npx skills add MnhQuoc/quoc-agent-skills --skill <ten-skill>
```

Cài toàn bộ skill vào project:

```bash
npx skills add MnhQuoc/quoc-agent-skills --all
```

Cài toàn bộ skill dùng chung cho mọi project (global, không cần lặp lại mỗi project):

```bash
npx skills add MnhQuoc/quoc-agent-skills --all -g
```

Xem trước danh sách skill hiện có mà không cài:

```bash
npx skills add MnhQuoc/quoc-agent-skills --list
```

CLI tự phát hiện agent đang cài trên máy (Cursor, Claude Code, Codex...) và copy/symlink `SKILL.md` vào đúng thư mục của agent đó (ví dụ Cursor: `.agents/skills/` ở project, `~/.cursor/skills/` ở global).

### Cách 2 — copy thủ công (không cần cài gì thêm)

Clone repo rồi copy thư mục skill cần dùng (thay `<ten-skill>` bằng slug muốn dùng) vào đúng nơi agent của bạn đọc skill, ví dụ với Cursor:

```bash
git clone https://github.com/MnhQuoc/quoc-agent-skills.git
cp -r quoc-agent-skills/skills/<ten-skill>  ./.cursor/skills/<ten-skill>   # theo project
# hoặc
cp -r quoc-agent-skills/skills/<ten-skill>  ~/.cursor/skills/<ten-skill>   # dùng chung mọi project
```

## Chạy project

### Yêu cầu

- **Node.js** 18+ (khuyến nghị LTS)
- **MongoDB** — bắt buộc nếu chạy web app quản lý skill (API + React); không cần nếu chỉ xem trang static danh sách skill

### Cài đặt

```bash
git clone https://github.com/MnhQuoc/quoc-agent-skills.git
cd quoc-agent-skills
npm install
cp .env.example .env   # Linux/macOS
# copy .env.example .env   # Windows
```

Chỉnh file `.env` nếu cần (mặc định MongoDB: `mongodb://localhost:27017/quoc-agent-skills`, API cổng `4322`).

Lần đầu dùng web app, import skill có sẵn trong `skills/` vào MongoDB:

```bash
npm run migrate
```

### Chế độ 1 — Trang static danh sách skill (nhẹ, không cần MongoDB)

```bash
npm start
```

Mở **http://localhost:4321** — trang đọc trực tiếp từ `site/skills.json` (tự sinh từ thư mục `skills/`).

### Chế độ 2 — Web app quản lý skill (API + React)

Cần MongoDB đang chạy. Mở **hai terminal** từ thư mục gốc repo:

```bash
# Terminal 1 — API backend (mặc định http://localhost:4322)
npm run api

# Terminal 2 — giao diện React (mặc định http://localhost:5173)
npm run app
```

Mở địa chỉ Vite in ra (thường **http://localhost:5173**). Request `/api/*` được proxy sang API — không cần cấu hình CORS thêm.

**Biến môi trường tùy chọn** (trong `.env`):

| Biến | Mục đích |
|------|----------|
| `CURSOR_API_KEY` | Chạy skill workflow qua Cursor SDK (bắt đầu bằng `crsr_`) |
| `CURSOR_SESSION_TOKEN` / `CURSOR_SESSION_COOKIE` | Theo dõi token usage từ Cursor Dashboard; có thể lấy bằng `npm run extract-session` |

**Script hữu ích khác:**

```bash
npm run sync-cursor      # copy skills/ → .agents/skills/ (dùng skill qua /slug trong repo)
npm run generate         # tái sinh site/skills.json
npm run extract-session  # trích session Cursor từ state.vscdb
```

## Đồng bộ / cập nhật

Sau khi sửa skill trong repo này, cập nhật lại bản đã cài ở các project khác:

```bash
npx skills update
```
