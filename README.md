# quoc-agent-skills

Bộ **Agent Skills** cá nhân của tôi, dùng chung cho nhiều project và nhiều AI coding agent (Cursor, Claude Code, Codex, v.v.) theo chuẩn [Agent Skills Specification](https://agentskills.io) — tương tự cách [vercel-labs/skills](https://github.com/vercel-labs/skills) tổ chức skill.

Mỗi skill là một thư mục trong `skills/` chứa file `SKILL.md` với YAML frontmatter (`name`, `description`) + nội dung hướng dẫn cho agent.

## Danh sách skill

| Skill | Mô tả |
|-------|-------|
| [`backend`](skills/backend/SKILL.md) | Hướng dẫn & công cụ mẫu cho backend (API, service, migration, tests) |
| [`frontend`](skills/frontend/SKILL.md) | Hướng dẫn & công cụ mẫu cho frontend (demo users list, gọi API) |
| [`code-review`](skills/code-review/SKILL.md) | Review code theo checklist (correctness, security, performance, maintainability) |
| [`skill-requirement`](skills/skill-requirement/SKILL.md) | Thu thập & chuẩn hóa yêu cầu thành Requirements Document |
| [`skill-plan`](skills/skill-plan/SKILL.md) | Lập Implementation Plan chi tiết từ requirements |
| [`skill-implement`](skills/skill-implement/SKILL.md) | Triển khai code theo plan, verify, báo cáo kết quả |

`skill-requirement` → `skill-plan` → `skill-implement` → `code-review` tạo thành một quy trình làm việc end-to-end (yêu cầu → kế hoạch → code → review).

## Cách dùng ở project khác

### Cách 1 — dùng CLI `skills` (khuyến nghị, hỗ trợ 40+ agent)

Cài một skill cụ thể vào project hiện tại:

```bash
npx skills add <github-username>/quoc-agent-skills --skill backend
```

Cài toàn bộ skill vào project:

```bash
npx skills add <github-username>/quoc-agent-skills --all
```

Cài toàn bộ skill dùng chung cho mọi project (global, không cần lặp lại mỗi project):

```bash
npx skills add <github-username>/quoc-agent-skills --all -g
```

Xem trước danh sách skill mà không cài:

```bash
npx skills add <github-username>/quoc-agent-skills --list
```

CLI tự phát hiện agent đang cài trên máy (Cursor, Claude Code, Codex...) và copy/symlink `SKILL.md` vào đúng thư mục của agent đó (ví dụ Cursor: `.agents/skills/` ở project, `~/.cursor/skills/` ở global).

### Cách 2 — copy thủ công (không cần cài gì thêm)

Clone repo rồi copy thư mục skill cần dùng vào đúng nơi agent của bạn đọc skill, ví dụ với Cursor:

```bash
git clone https://github.com/<github-username>/quoc-agent-skills.git
cp -r quoc-agent-skills/skills/backend  ./.cursor/skills/backend   # theo project
# hoặc
cp -r quoc-agent-skills/skills/backend  ~/.cursor/skills/backend   # dùng chung mọi project
```

## Thêm skill mới

1. Tạo thư mục `skills/<ten-skill>/SKILL.md`.
2. Frontmatter bắt buộc có `name` và `description` (description nên nói rõ **khi nào** agent nên dùng skill này).
3. Cập nhật bảng danh sách skill ở trên.
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
