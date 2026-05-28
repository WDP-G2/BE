var bcrypt = require("bcryptjs");
var User = require("../models/user");

function createSlug(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

async function ensureUsers() {
  var passwordHash = bcrypt.hashSync("Password123!", 8);
  var seedUsers = [
    {
      name: "Admin Horse Racing",
      username: "admin",
      fullName: "Admin Horse Racing",
      email: "admin@hr.vn",
      password: passwordHash,
      phone: "0900000001",
      role: "ADMIN",
    },
    {
      name: "Nguyễn Văn Chủ",
      username: "owner1",
      fullName: "Nguyễn Văn Chủ",
      email: "owner1@hr.vn",
      password: passwordHash,
      phone: "0900000002",
      role: "OWNER",
    },
    {
      name: "Trần Minh Jockey",
      username: "jockey1",
      fullName: "Trần Minh Jockey",
      email: "jockey1@hr.vn",
      password: passwordHash,
      phone: "0900000003",
      role: "JOCKEY",
    },
    {
      name: "Lê Quốc Jockey",
      username: "jockey2",
      fullName: "Lê Quốc Jockey",
      email: "jockey2@hr.vn",
      password: passwordHash,
      phone: "0900000004",
      role: "JOCKEY",
    },
    {
      name: "Phạm Đức Trọng Tài",
      username: "referee1",
      fullName: "Phạm Đức Trọng Tài",
      email: "referee1@hr.vn",
      password: passwordHash,
      phone: "0900000005",
      role: "REFEREE",
    },
    {
      name: "Khách Xem Mẫu",
      username: "spectator1",
      fullName: "Khách Xem Mẫu",
      email: "spectator1@hr.vn",
      password: passwordHash,
      phone: "0900000006",
      role: "USER",
    },
  ];

  var users = [];

  for (var i = 0; i < seedUsers.length; i += 1) {
    var seedUser = seedUsers[i];
    var updated = await User.findOneAndUpdate(
      { email: seedUser.email },
      { $setOnInsert: seedUser },
      { upsert: true, new: true },
    ).exec();
    users.push(updated);
  }

  return users;
}

async function seedSampleData() {
  await ensureUsers();
  console.log("Sample data seeded");
}

module.exports = {
  seedSampleData: seedSampleData,
};

if (require.main === module) {
  seedSampleData()
    .then(function () {
      process.exit(0);
    })
    .catch(function (err) {
      console.error(err);
      process.exit(1);
    });
}
