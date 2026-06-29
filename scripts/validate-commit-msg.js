#!/usr/bin/env node
var fs = require("fs");
var block = require("./block-cursor-agent");

var file = process.argv[2];
if (!file) {
  console.error("Thiếu đường dẫn file commit message.");
  process.exit(1);
}

var message = fs.readFileSync(file, "utf8");

if (block.messageHasCursorAgent(message)) {
  var cleaned = block.stripCursorAgentFromMessage(message);
  fs.writeFileSync(file, cleaned + (cleaned ? "\n" : ""), "utf8");
  console.warn("⚠ Đã tự gỡ Co-authored-by Cursor khỏi commit message.");
}

try {
  block.assertNoCursorAgent({
    name: "",
    email: "",
    message: fs.readFileSync(file, "utf8"),
    context: "commit-msg",
  });
} catch (error) {
  console.error(error.message);
  console.error("\nPush/commit với Cursor Agent bị cấm. Dùng tài khoản GitHub của bạn.");
  process.exit(1);
}
