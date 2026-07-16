#!/usr/bin/env node
// Zero-dependency static file server for the site/ directory, so the skills
// page can be browsed at http://localhost:<PORT> without installing anything.

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 4321;
const SITE_DIR = path.join(__dirname, "site");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";

  const filePath = path.join(SITE_DIR, urlPath);

  // Prevent path traversal outside of site/.
  if (!filePath.startsWith(SITE_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 Not Found");
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`quoc-agent-skills site đang chạy tại http://localhost:${PORT}`);
});
