// Theo dõi thư mục skills/ trên đĩa: nếu bạn xóa folder skills/<slug> (hoặc file
// SKILL.md bên trong) trực tiếp trong VS Code/Explorer, skill tương ứng sẽ tự bị
// xóa khỏi MongoDB (và khỏi ~/.cursor/skills/<slug> nếu đã được cài ở đó).
//
// Đồng bộ một chiều: đĩa (skills/) là "công tắc xóa", MongoDB là nơi lưu dữ liệu.
// Tạo skill mới vẫn luôn qua web/API như trước (lib/skills.js).

const fs = require("fs");
const os = require("os");
const path = require("path");
const Skill = require("./models/Skill");

const ROOT = path.join(__dirname, "..");
const SKILLS_DIR = path.join(ROOT, "skills");
const CURSOR_GLOBAL_SKILLS_DIR = path.join(os.homedir(), ".cursor", "skills");

function getDiskSlugs() {
  if (!fs.existsSync(SKILLS_DIR)) return new Set();

  return new Set(
    fs
      .readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .filter((d) => fs.existsSync(path.join(SKILLS_DIR, d.name, "SKILL.md")))
      .map((d) => d.name)
  );
}

// So sánh MongoDB với đĩa; slug nào có trong DB nhưng không còn SKILL.md trên đĩa
// (skills/<slug>/SKILL.md) thì bị xóa khỏi DB + khỏi bản cài global (nếu có).
async function syncDeletedSkills() {
  const diskSlugs = getDiskSlugs();
  const dbSkills = await Skill.find().select("slug").lean();

  for (const { slug } of dbSkills) {
    if (diskSlugs.has(slug)) continue;

    await Skill.deleteOne({ slug });
    try {
      fs.rmSync(path.join(CURSOR_GLOBAL_SKILLS_DIR, slug), { recursive: true, force: true });
    } catch {
      // bỏ qua nếu không xóa được bản global - không quan trọng bằng MongoDB
    }
    console.log(`🗑️  Đã xóa skill "${slug}" khỏi MongoDB (do folder skills/${slug} không còn trên đĩa).`);
  }
}

// Bắt đầu theo dõi skills/ liên tục; gọi onSync sau mỗi lần đồng bộ (để refresh manifest).
function watchSkillsDir(onSync) {
  if (!fs.existsSync(SKILLS_DIR)) return;

  let debounceTimer = null;
  const runSync = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      try {
        await syncDeletedSkills();
        if (onSync) await onSync();
      } catch (err) {
        console.error("Lỗi đồng bộ xóa skill từ đĩa vào MongoDB:", err.message);
      }
    }, 500);
  };

  fs.watch(SKILLS_DIR, { recursive: true }, runSync);
  console.log(`👀 Đang theo dõi ${SKILLS_DIR} - xóa folder skill trên đĩa sẽ tự xóa trong MongoDB.`);
}

module.exports = { watchSkillsDir, syncDeletedSkills };
