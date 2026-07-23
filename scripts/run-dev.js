#!/usr/bin/env node
const { spawn } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const children = [];

function start(name, command, args, cwd) {
  const child = spawn(command, args, { cwd, stdio: "inherit", shell: true });
  child.on("exit", (code) => {
    console.error(`[${name}] thoát với mã ${code ?? 1}`);
    for (const other of children) {
      if (!other.killed) other.kill();
    }
    process.exit(code ?? 1);
  });
  children.push(child);
}

start("api", "npm", ["run", "api"], root);
start("app", "npm", ["run", "dev"], path.join(root, "app"));

process.on("SIGINT", () => {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(0);
});
