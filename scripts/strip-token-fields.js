require("dotenv").config();
const mongoose = require("mongoose");
const { connectDB } = require("../lib/db");

const STRIP_FIELDS = {
  inputTokens: 1,
  outputTokens: 1,
  cacheReadTokens: 1,
  cacheWriteTokens: 1,
  reasoningTokens: 1,
  totalTokens: 1,
  estimated: 1,
};

async function main() {
  await connectDB();
  const col = mongoose.connection.collection("tokenlogs");
  const result = await col.updateMany({}, { $unset: STRIP_FIELDS });
  console.log(`Đã gỡ field token thừa khỏi ${result.modifiedCount} bản ghi.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
