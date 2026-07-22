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
    sessionTitle: { type: String, default: "" },
    userQueries: { type: [String], default: [] },
    // Timestamp thật khi user gửi từng câu (hook beforeSubmitPrompt).
    userQueryEvents: {
      type: [
        {
          text: { type: String, trim: true, default: "" },
          at: { type: Date },
        },
      ],
      default: [],
    },
    // "sdk" = chạy qua @cursor/sdk (WorkflowCreator, có usage thật từ Cursor).
    // "cursor-ide" = chạy trực tiếp trong Cursor IDE (chat/agent), token là ước lượng.
    source: { type: String, enum: ["sdk", "cursor-ide"], default: "sdk" },
    estimated: { type: Boolean, default: false },
    model: { type: String, trim: true, default: "" },
    turnCount: { type: Number, default: 0 },
    sessionEnded: { type: Boolean, default: false },
    durationMs: { type: Number, default: 0 },
    // Dùng cho optimistic concurrency: tránh mất update khi nhiều hook
    // (afterAgentResponse + stop) ghi đè cùng session gần như đồng thời.
    revision: { type: Number, default: 0 },
  },
  { timestamps: true }
);

tokenLogSchema.index({ createdAt: -1 });
// Unique cho session cursor-ide để upsert không tạo bản ghi trùng khi có race lúc tạo mới.
tokenLogSchema.index(
  { runId: 1, source: 1 },
  { unique: true, partialFilterExpression: { source: "cursor-ide" } }
);

module.exports = mongoose.models.TokenLog || mongoose.model("TokenLog", tokenLogSchema);
