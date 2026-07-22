require("dotenv").config();
const { connectDB } = require("../lib/db");
const { repairCursorIdeSessions } = require("../lib/tokenUsage");

async function main() {
  await connectDB();
  const result = await repairCursorIdeSessions();
  console.log(`Đã sửa ${result.repaired}/${result.total} session cursor-ide.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
