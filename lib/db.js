// Kết nối MongoDB (Mongoose) dùng chung cho api/server.js và các script trong scripts/.

const mongoose = require("mongoose");

const DEFAULT_URI = "mongodb://localhost:27017/quoc-agent-skills";

async function connectDB() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;

  const uri = process.env.MONGODB_URI || DEFAULT_URI;
  await mongoose.connect(uri);
  console.log(`✅ Đã kết nối MongoDB: ${uri}`);
  return mongoose.connection;
}

module.exports = { connectDB };
