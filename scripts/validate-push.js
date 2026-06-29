#!/usr/bin/env node
var execSync = require("child_process").execSync;
var block = require("./block-cursor-agent");

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

var localRef = process.env.GIT_PUSH_LOCAL_REF || "";
var range = "";

try {
  var upstream = sh("git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>nul || echo");
  if (upstream && localRef) {
    var remoteSha = sh("git rev-parse " + upstream);
    var localSha = sh("git rev-parse " + localRef);
    if (remoteSha !== localSha) range = remoteSha + ".." + localSha;
  }
} catch (err) {
  // new branch
}

if (!range) {
  try {
    range = sh("git merge-base HEAD @{u}") + "..HEAD";
  } catch (err2) {
    range = sh("git rev-list --max-parents=0 HEAD") + "..HEAD";
  }
}

var commits = sh("git rev-list " + range).split("\n").filter(Boolean);

for (var i = 0; i < commits.length; i++) {
  var sha = commits[i];
  var name = sh("git log -1 --format=%an " + sha);
  var email = sh("git log -1 --format=%ae " + sha);
  var committerName = sh("git log -1 --format=%cn " + sha);
  var committerEmail = sh("git log -1 --format=%ce " + sha);
  var body = sh("git log -1 --format=%B " + sha);

  try {
    block.assertNoCursorAgent({ name: name, email: email, message: body, context: "commit " + sha.slice(0, 7) + " author" });
    block.assertNoCursorAgent({
      name: committerName,
      email: committerEmail,
      message: body,
      context: "commit " + sha.slice(0, 7) + " committer",
    });
  } catch (error) {
    console.error("\n🚫 PUSH BỊ CHẶN — Cursor Agent không được phép.\n");
    console.error(error.message);
    console.error("\nSửa: gỡ Co-authored-by Cursor hoặc amend author rồi push lại.");
    process.exit(1);
  }

  if (block.messageHasCursorAgent(body)) {
    console.error("\n🚫 PUSH BỊ CHẶN: commit " + sha.slice(0, 7) + " còn Co-authored-by Cursor.\n");
    process.exit(1);
  }
}

console.log("✓ pre-push: " + commits.length + " commit(s) — không có Cursor Agent.");
