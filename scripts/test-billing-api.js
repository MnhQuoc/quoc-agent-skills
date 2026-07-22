require("dotenv").config();

const { getBillingSessions } = require("../lib/tokenUsage");
const { connectDB } = require("../lib/db");

connectDB()
  .then(async () => {
    const result = await getBillingSessions({ days: 7 });
    console.log("csvEventCount", result.csvEventCount);
    console.log("mongoSessionCount", result.mongoSessionCount);
    console.log("matchedSessionCount", result.matchedSessionCount);
    console.log("unmatchedEventCount", result.unmatchedEventCount);
    console.log("billedTotal", result.totals.billed.totalTokens);
    console.log("sessionsWithBilling", result.sessions.filter((s) => s.hasBilling).length);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
