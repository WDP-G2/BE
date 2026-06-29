#!/usr/bin/env node
/** stdin → stdout: gỡ Co-authored-by Cursor khỏi commit message (dùng với git filter-branch). */
var block = require("./block-cursor-agent");

var chunks = [];
process.stdin.on("data", function (chunk) {
  chunks.push(chunk);
});
process.stdin.on("end", function () {
  var input = Buffer.concat(chunks).toString("utf8");
  var output = block.stripCursorAgentFromMessage(input);
  process.stdout.write(output + (input.endsWith("\n") ? "\n" : ""));
});
