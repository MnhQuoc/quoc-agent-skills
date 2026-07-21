const mongoose = require("mongoose");

const tokenLogSchema = new mongoose.Schema(
  {
    skillSlug: { type: String, required: true, trim: true, index: true },
    runId: { type: String, trim: true },
    status: { type: String, trim: true },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    cacheReadTokens: { type: Number, default: 0 },
    cacheWriteTokens: { type: Number, default: 0 },
    reasoningTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    promptPreview: { type: String, default: "" },
    // "sdk" = chạy qua @cursor/sdk (WorkflowCreator, có usage thật từ Cursor).
    // "cursor-ide" = chạy trực tiếp trong Cursor IDE (chat/agent), token là ước lượng.
    source: { type: String, enum: ["sdk", "cursor-ide"], default: "sdk" },
    estimated: { type: Boolean, default: false },
    model: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

tokenLogSchema.index({ createdAt: -1 });

module.exports = mongoose.models.TokenLog || mongoose.model("TokenLog", tokenLogSchema);
