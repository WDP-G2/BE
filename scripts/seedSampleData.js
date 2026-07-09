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

async function ensureJockeyRoleApplications(users) {
  var RoleApplication = require("../models/roleApplication");
  var adminUser = users.find(function (user) {
    return user.role === "ADMIN";
  });
  var jockeyUsers = users.filter(function (user) {
    return user.role === "JOCKEY";
  });

  for (var i = 0; i < jockeyUsers.length; i += 1) {
    var user = jockeyUsers[i];
    var licenseSuffix = String(i + 1).padStart(3, "0");

    await RoleApplication.findOneAndUpdate(
      { userId: user._id, role: "JOCKEY" },
      {
        $set: {
          status: "APPROVED",
          fullName: user.fullName || user.name || user.username || "",
          phone: user.phone || "",
          profileData: {
            licenseNumber: "VN-JK-" + licenseSuffix,
            experienceYears: 3,
            heightCm: 170,
            weightKg: 58,
            specialties: "Đua cự ly trung bình",
            bio: "Jockey đã được duyệt hồ sơ",
          },
          reviewedBy: adminUser ? adminUser._id : undefined,
          reviewedAt: new Date(),
        },
        $setOnInsert: {
          userId: user._id,
          role: "JOCKEY",
        },
      },
      { upsert: true, new: true },
    ).exec();
  }
}

async function ensureOwnerRoleApplications(users) {
  var RoleApplication = require("../models/roleApplication");
  var adminUser = users.find(function (user) {
    return user.role === "ADMIN";
  });
  var ownerUsers = users.filter(function (user) {
    return user.role === "OWNER";
  });

  for (var i = 0; i < ownerUsers.length; i += 1) {
    var user = ownerUsers[i];
    var stableSuffix = String(i + 1).padStart(2, "0");

    await RoleApplication.findOneAndUpdate(
      { userId: user._id, role: "OWNER" },
      {
        $set: {
          status: "APPROVED",
          fullName: user.fullName || user.name || user.username || "",
          phone: user.phone || "",
          profileData: {
            stableName: "Trang trại " + (user.fullName || user.username || "Chủ ngựa"),
            address: user.location || "Chưa cập nhật",
            experienceYears: 3 + (i % 5),
            bio: "Chủ ngựa đã được duyệt hồ sơ",
          },
          reviewedBy: adminUser ? adminUser._id : undefined,
          reviewedAt: new Date(),
        },
        $setOnInsert: {
          userId: user._id,
          role: "OWNER",
        },
      },
      { upsert: true, new: true },
    ).exec();
  }
}

async function seedSampleData() {
  var users = await ensureUsers();
  await ensureOwnerRoleApplications(users);
  await ensureJockeyRoleApplications(users);
  await ensurePlatformData(users);
  console.log("Sample data seeded");
}

async function ensurePlatformData(users) {
  var SystemSettings = require("../models/systemSettings");
  var RefereeSalaryConfig = require("../models/refereeSalaryConfig");
  var Province = require("../models/province");
  var Tournament = require("../models/tournament");
  var News = require("../models/news");
  var { getUserWallet, getSystemWallet } = require("../services/walletLedger");

  await SystemSettings.findOneAndUpdate(
    { key: "default" },
    {
      $setOnInsert: {
        key: "default",
        fees: {
          defaultRegistrationFee: 5000000,
          lateCheckInFee: 500000,
          entryFeePercent: 5,
          winningTaxPercent: 10,
          platformFeePercent: 2,
        },
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

  var adminUser = users.find(function (user) {
    return user.role === "ADMIN";
  });

  await Tournament.findOneAndUpdate(
    { slug: "giai-dau-mua-xuan-2026" },
    {
      $setOnInsert: {
        name: "Giải đua Mùa Xuân 2026",
        slug: "giai-dau-mua-xuan-2026",
        description: "Giải đua ngựa mở mùa tại TP. Hồ Chí Minh",
        location: "Trường đua Phú Thọ, TP. Hồ Chí Minh",
        banner:
          "https://images.unsplash.com/photo-1507514604110-ba3347c457f6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
        type: "regular",
        status: "Đang mở đăng ký",
        startDate: new Date("2026-04-15T08:00:00.000Z"),
        endDate: new Date("2026-04-17T18:00:00.000Z"),
        createdBy: adminUser ? adminUser._id : undefined,
        config: {
          entryFee: 5000000,
          depositFee: 1000000,
          refundDays: 3,
          maxRaces: 3,
          maxRegistrations: 30,
        },
        races: [
          {
            raceNumber: 1,
            name: "Chặng 1200m",
            distance: 1200,
            scheduledAt: new Date("2026-04-15T09:00:00.000Z"),
            status: "Sắp chạy",
            track: "Trường đua Phú Thọ",
            surface: "Cỏ",
            category: "Open",
            minHorses: 4,
            maxHorses: 12,
            entryFee: 5000000,
            prizes: { first: 20000000, second: 10000000, third: 5000000 },
          },
          {
            raceNumber: 2,
            name: "Chặng 1600m",
            distance: 1600,
            scheduledAt: new Date("2026-04-16T09:00:00.000Z"),
            status: "Nháp",
            track: "Trường đua Phú Thọ",
            surface: "Cỏ",
            category: "Open",
            minHorses: 4,
            maxHorses: 12,
            entryFee: 5000000,
            prizes: { first: 25000000, second: 12000000, third: 6000000 },
          },
        ],
      },
    },
    { upsert: true, new: true },
  ).exec();

  await News.findOneAndUpdate(
    { slug: "mo-dang-ky-giai-dau-mua-xuan-2026" },
    {
      $setOnInsert: {
        slug: "mo-dang-ky-giai-dau-mua-xuan-2026",
        title: "Mở đăng ký Giải đua Mùa Xuân 2026",
        summary: "Giải đua ngựa đầu mùa chính thức mở đăng ký cho chủ ngựa và kỵ sĩ.",
        content:
          "Ban tổ chức thông báo mở đăng ký Giải đua Mùa Xuân 2026 tại Trường đua Phú Thọ. Chủ ngựa có thể đăng ký trực tuyến trên hệ thống.",
        category: "Tin tức",
        status: "published",
        featured: true,
        authorName: "Ban quản trị",
        createdBy: adminUser ? adminUser._id : undefined,
      },
    },
    { upsert: true, new: true },
  ).exec();

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
  var connectPromise = require("../db").connectPromise;
  connectPromise
    .then(function () {
      return seedSampleData();
    })
    .then(function () {
      process.exit(0);
    })
    .catch(function (err) {
      console.error(err);
      process.exit(1);
    });
}
