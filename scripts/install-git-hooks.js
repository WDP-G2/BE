#!/usr/bin/env node
var fs = require("fs");
var path = require("path");

var root = path.resolve(__dirname, "..");
var hooksDir = path.join(root, ".git", "hooks");
var sourceDir = path.join(root, ".githooks");

var hooks = {
  "commit-msg": '#!/bin/sh\nnode "' + path.join(root, "scripts", "validate-commit-msg.js") + '" "$1"\n',
  "pre-push": '#!/bin/sh\nnode "' + path.join(root, "scripts", "validate-push.js") + '"\n',
};

if (!fs.existsSync(path.join(root, ".git"))) {
  console.warn("Không tìm thấy .git — bỏ qua cài hooks.");
  process.exit(0);
}

fs.mkdirSync(sourceDir, { recursive: true });
fs.mkdirSync(hooksDir, { recursive: true });

Object.keys(hooks).forEach(function (name) {
  var content = hooks[name];
  fs.writeFileSync(path.join(sourceDir, name), content, "utf8");
  fs.writeFileSync(path.join(hooksDir, name), content, "utf8");
  try {
    fs.chmodSync(path.join(hooksDir, name), 0o755);
  } catch (err) {
    // Windows
  }
});

console.log("Đã cài git hooks: commit-msg, pre-push (chặn Cursor Agent).");
