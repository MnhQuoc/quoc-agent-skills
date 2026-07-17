// MongoDB-backed data access cho skill. MongoDB là nguồn dữ liệu chính (source of truth);
// xem scripts/migrate-to-mongo.js để nhập dữ liệu từ skills/*/SKILL.md cũ vào DB.
//
// Khi tạo skill mới, ngoài lưu vào MongoDB, ta cũng mirror ra skills/<slug>/SKILL.md
// trên đĩa (repo nguồn), VÀ cài luôn vào ~/.cursor/skills/<slug>/SKILL.md (global) để
// Cursor nhận diện ngay và dùng được qua "/<slug>" mà không cần chạy `npx skills add` thủ công.

const fs = require("fs");
const os = require("os");
const path = require("path");
const Skill = require("./models/Skill");

const ROOT = path.join(__dirname, "..");
const SKILLS_DIR = path.join(ROOT, "skills");
const CURSOR_GLOBAL_SKILLS_DIR = path.join(os.homedir(), ".cursor", "skills");

class SkillError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function slugify(input) {
  return String(input)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toDTO(doc) {
  return {
    slug: doc.slug,
    name: doc.name,
    description: doc.description,
    internal: !!doc.internal,
    content: doc.content || "",
  };
}

async function listSkills() {
  const docs = await Skill.find().sort({ slug: 1 }).lean();
  return docs.map(toDTO);
}

async function getSkill(slug) {
  const doc = await Skill.findOne({ slug }).lean();
  if (!doc) throw new SkillError(`Không tìm thấy skill "${slug}"`, 404);
  return toDTO(doc);
}

async function searchSkills(query) {
  const q = query.trim();
  if (!q) return [];

  const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const docs = await Skill.find({
    $or: [{ slug: regex }, { name: regex }],
  })
    .sort({ slug: 1 })
    .lean();
  return docs.map(toDTO);
}

// Ghi frontmatter + body ra <dir>/SKILL.md. Không ghi đè nếu file đã tồn tại sẵn.
// Trả về true nếu vừa tạo file mới, false nếu đã bỏ qua (file có từ trước).
function writeSkillMarkdown(dir, slug, description, body) {
  const skillMdPath = path.join(dir, "SKILL.md");
  if (fs.existsSync(skillMdPath)) return false;

  fs.mkdirSync(dir, { recursive: true });
  const frontmatter = `---\nname: ${slug}\ndescription: ${description.replace(/\r?\n/g, " ")}\n---\n\n${body}`;
  fs.writeFileSync(skillMdPath, frontmatter, "utf8");
  return true;
}

// Mirror ra skills/<slug>/SKILL.md trên đĩa (repo nguồn) - frontmatter luôn có,
// body có thể để trống để user tự điền sau.
function writeSkillFile(slug, description, body) {
  try {
    writeSkillMarkdown(path.join(SKILLS_DIR, slug), slug, description, body);
  } catch (err) {
    console.error(`Không tạo được skills/${slug}/SKILL.md trên đĩa:`, err.message);
  }
}

// Cài skill vào ~/.cursor/skills/<slug>/SKILL.md (global) để Cursor nhận ngay,
// dùng được qua "/<slug>" mà không cần chạy `npx skills add` thủ công.
function installToCursorGlobal(slug, description, body) {
  try {
    const created = writeSkillMarkdown(
      path.join(CURSOR_GLOBAL_SKILLS_DIR, slug),
      slug,
      description,
      body
    );
    if (created) {
      console.log(`✅ Đã cài skill "${slug}" vào ${CURSOR_GLOBAL_SKILLS_DIR}\\${slug} - dùng được qua "/${slug}"`);
    }
  } catch (err) {
    console.error(`Không cài được skill "${slug}" vào .cursor/skills global:`, err.message);
  }
}

async function createSkill({ name, description, content, slug: slugInput }) {
  if (!name || !name.trim()) throw new SkillError("Tên skill là bắt buộc", 400);
  if (!description || !description.trim()) throw new SkillError("Mô tả skill là bắt buộc", 400);

  const slug = slugify(slugInput || name);
  if (!slug) throw new SkillError("Không tạo được slug hợp lệ từ tên skill", 400);

  const existing = await Skill.findOne({ slug }).lean();
  if (existing) throw new SkillError(`Skill "${slug}" đã tồn tại`, 409);

  const title = name.trim();
  const desc = description.trim();
  const body = content && content.trim() ? content.trim() : "";

  const doc = await Skill.create({
    slug,
    name: title,
    description: desc,
    content: body,
  });

  writeSkillFile(slug, desc, body);
  installToCursorGlobal(slug, desc, body);

  return toDTO(doc);
}

module.exports = { listSkills, getSkill, searchSkills, createSkill, slugify, SkillError };
