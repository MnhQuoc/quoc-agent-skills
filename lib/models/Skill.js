// Mongoose schema cho một Agent Skill (tương đương frontmatter + nội dung của SKILL.md).

const mongoose = require("mongoose");

const skillSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    content: { type: String, default: "" },
    internal: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Skill || mongoose.model("Skill", skillSchema);
