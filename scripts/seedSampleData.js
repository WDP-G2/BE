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
      role: "SPECTATOR",
    },
  ];

  var users = [];

  for (var i = 0; i < seedUsers.length; i += 1) {
    var seedUser = seedUsers[i];
    var updated = await User.findOneAndUpdate(
      { email: seedUser.email },
      {
        $set: {
          name: seedUser.name,
          username: seedUser.username,
          fullName: seedUser.fullName,
          phone: seedUser.phone,
          role: seedUser.role,
        },
        $setOnInsert: {
          email: seedUser.email,
          password: seedUser.password,
        },
      },
      { upsert: true, new: true },
    ).exec();
    users.push(updated);
  }

  return users;
}

async function seedSampleData() {
  var users = await ensureUsers();
  await ensurePlatformData(users);
  console.log("Sample data seeded");
}

async function ensurePlatformData(users) {
  var SystemSettings = require("../models/systemSettings");
  var RefereeSalaryConfig = require("../models/refereeSalaryConfig");
  var Province = require("../models/province");
  var { getUserWallet, getSystemWallet } = require("../services/walletLedger");

  await SystemSettings.findOneAndUpdate(
    { key: "default" },
    {
      $setOnInsert: {
        key: "default",
        fees: { entryFeePercent: 5, winningTaxPercent: 10, platformFeePercent: 2 },
        raceDistances: [1000, 1200, 1400, 1600, 1800, 2000, 2400],
        bettingEnabled: true,
      },
    },
    { upsert: true, new: true },
  ).exec();

  await RefereeSalaryConfig.findOneAndUpdate(
    { name: "Lương trọng tài mặc định" },
    { $setOnInsert: { name: "Lương trọng tài mặc định", raceType: "Chung", amount: 500000, active: true } },
    { upsert: true },
  ).exec();

  await Province.findOneAndUpdate(
    { name: "TP. Hồ Chí Minh" },
    {
      $setOnInsert: {
        name: "TP. Hồ Chí Minh",
        code: "HCM",
        active: true,
        venues: [{ name: "Trường đua Phú Thọ", address: "Quận 11", active: true }],
      },
    },
    { upsert: true },
  ).exec();

  await getSystemWallet();

  for (var i = 0; i < users.length; i += 1) {
    var wallet = await getUserWallet(users[i]._id);
    if (users[i].role === "SPECTATOR" && Number(wallet.availableBalance || 0) < 1000000) {
      wallet.availableBalance = 1000000;
      await wallet.save();
    }
  }
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
