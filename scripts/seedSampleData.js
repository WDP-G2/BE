var bcrypt = require("bcryptjs");
var User = require("../models/user");
var Tournament = require("../models/tournament");

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

async function ensureTournaments(users) {
  var existingCount = await Tournament.countDocuments().exec();

  if (existingCount > 0) {
    return;
  }

  var admin = users.find(function (user) {
    return user.role === "ADMIN";
  });
  var owner = users.find(function (user) {
    return user.role === "OWNER";
  });
  var jockey1 = users.find(function (user) {
    return user.email === "jockey1@hr.vn";
  });
  var jockey2 = users.find(function (user) {
    return user.email === "jockey2@hr.vn";
  });
  var referee = users.find(function (user) {
    return user.role === "REFEREE";
  });

  await Tournament.insertMany([
    {
      name: "Vietnam Grand Prix 2026",
      slug: createSlug("Vietnam Grand Prix 2026"),
      description: "Giải đấu cấp quốc gia mở đầu mùa giải 2026.",
      location: "Sân đua Phú Thọ, TP. HCM",
      banner:
        "https://images.unsplash.com/photo-1507514604110-ba3347c457f6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1200",
      type: "championship",
      status: "Đang mở đăng ký",
      startDate: new Date("2026-06-10T00:00:00.000Z"),
      endDate: new Date("2026-06-15T00:00:00.000Z"),
      rules:
        "1. Ngựa đủ điều kiện y tế.\n2. Jockey phải có chứng chỉ hợp lệ.\n3. Doping test bắt buộc.",
      config: {
        entryFee: 2000000,
        depositFee: 500000,
        refundDays: 3,
        maxRaces: 6,
        maxRegistrations: 48,
        requireJockey: true,
        requireHorseOwner: true,
        requireVetCheck: true,
        requireDopingCheck: true,
        allowLateRegistration: false,
        deadlineAt: new Date("2026-06-01T00:00:00.000Z"),
      },
      createdBy: admin ? admin._id : undefined,
      races: [
        {
          raceNumber: 1,
          name: "Chặng mở màn",
          distance: 1200,
          scheduledAt: new Date("2026-06-10T03:00:00.000Z"),
          status: "Hoàn thành",
          description: "Chặng mở màn cho vòng loại.",
          results: [
            {
              position: 1,
              horseName: "Bạch Long",
              jockeyId: jockey1 ? jockey1._id : undefined,
              jockeyName: jockey1 ? jockey1.fullName : "",
              time: "01:12.41",
              points: 10,
            },
            {
              position: 2,
              horseName: "Hắc Mã",
              jockeyId: jockey2 ? jockey2._id : undefined,
              jockeyName: jockey2 ? jockey2.fullName : "",
              time: "01:13.18",
              points: 8,
            },
          ],
        },
        {
          raceNumber: 2,
          name: "Vòng tốc độ",
          distance: 1500,
          scheduledAt: new Date("2026-06-12T03:00:00.000Z"),
          status: "Sắp chạy",
          description: "Cuộc đua tăng tốc giữa các đội dẫn đầu.",
          results: [],
        },
      ],
      registrations: [
        {
          fullName: owner ? owner.fullName : "Nguyễn Văn Chủ",
          ownerId: owner ? owner._id : undefined,
          ownerName: owner ? owner.fullName : "Nguyễn Văn Chủ",
          horseName: "Bạch Long",
          horseAge: 5,
          horseBreed: "Arabian",
          jockeyId: jockey1 ? jockey1._id : undefined,
          jockeyName: jockey1 ? jockey1.fullName : "",
          status: "Đã duyệt",
          notes: "Đăng ký mẫu cho giải quốc gia.",
        },
        {
          fullName: owner ? owner.fullName : "Nguyễn Văn Chủ",
          ownerId: owner ? owner._id : undefined,
          ownerName: owner ? owner.fullName : "Nguyễn Văn Chủ",
          horseName: "Hắc Mã",
          horseAge: 6,
          horseBreed: "Thoroughbred",
          jockeyId: jockey2 ? jockey2._id : undefined,
          jockeyName: jockey2 ? jockey2.fullName : "",
          status: "Chờ duyệt",
          notes: "Cần xác nhận giấy khám sức khỏe.",
        },
      ],
    },
    {
      name: "Regular Spring Cup 2026",
      slug: createSlug("Regular Spring Cup 2026"),
      description: "Giải thường phục vụ kiểm tra phong độ đầu mùa.",
      location: "Sân đua Đà Lạt",
      banner:
        "https://images.unsplash.com/photo-1564683210549-ebb1b0e3d5f5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1200",
      type: "regular",
      status: "Nháp",
      startDate: new Date("2026-03-10T00:00:00.000Z"),
      endDate: new Date("2026-03-12T00:00:00.000Z"),
      rules: "Giải thường áp dụng luật tiêu chuẩn và kiểm tra y tế bắt buộc.",
      config: {
        entryFee: 500000,
        depositFee: 150000,
        refundDays: 7,
        maxRaces: 4,
        maxRegistrations: 24,
        requireJockey: true,
        requireHorseOwner: true,
        requireVetCheck: true,
        requireDopingCheck: false,
        allowLateRegistration: true,
        deadlineAt: new Date("2026-03-01T00:00:00.000Z"),
      },
      createdBy: referee ? referee._id : undefined,
      races: [],
      registrations: [],
    },
  ]);
}

async function seedSampleData() {
  var users = await ensureUsers();
  await ensureTournaments(users);
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
