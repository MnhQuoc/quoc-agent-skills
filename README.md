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

## Thêm skill mới

1. Tạo thư mục `skills/<ten-skill>/SKILL.md`.
2. Frontmatter bắt buộc có `name` và `description` (description nên nói rõ **khi nào** agent nên dùng skill này).
3. Không cần sửa gì ở README hay chỗ khác — trang web local (`npm start`) và CLI `npx skills add ... --list` tự đọc lại `skills/` nên danh sách luôn tự cập nhật.
4. Commit & push.

```markdown
---
name: ten-skill
description: Mô tả skill làm gì và khi nào nên dùng.
---

# Tên skill

Nội dung hướng dẫn cho agent...
```

## Đồng bộ / cập nhật

Sau khi sửa skill trong repo này, cập nhật lại bản đã cài ở các project khác:

```bash
npx skills update
```
