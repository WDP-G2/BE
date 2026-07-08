var bcrypt = require("bcryptjs");
var User = require("../models/user");
var RoleApplication = require("../models/roleApplication");

var HO = [
  "Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Huỳnh", "Phan", "Vũ", "Võ", "Đặng",
  "Bùi", "Đỗ", "Hồ", "Ngô", "Dương", "Lý", "Đinh", "Trịnh", "Đoàn", "Cao",
];

var TEN_DEM_NAM = [
  "Văn", "Hữu", "Đức", "Minh", "Thành", "Công", "Quốc", "Anh", "Tuấn", "Trọng",
];

var TEN_DEM_NU = [
  "Thị", "Ngọc", "Thu", "Kim", "Diệu", "Bích", "Hồng", "Thanh", "Xuân", "Phương",
];

var TEN_NAM = [
  "Hùng", "Long", "Dũng", "Khánh", "Phong", "Nam", "Sơn", "Hải", "Tùng", "Kiên",
  "Đạt", "Việt", "Bảo", "Hiếu", "Quang", "Duy", "Tài", "Phát", "Trung", "Lâm",
];

var TEN_NU = [
  "Lan", "Hoa", "Huyền", "Trang", "Nhung", "Linh", "Mai", "Hằng", "Nga", "Yến",
];

function buildName(index, gender) {
  var ho = HO[index % HO.length];
  if (gender === "F") {
    var tenDemNu = TEN_DEM_NU[index % TEN_DEM_NU.length];
    var tenNu = TEN_NU[index % TEN_NU.length];
    return ho + " " + tenDemNu + " " + tenNu;
  }
  var tenDemNam = TEN_DEM_NAM[index % TEN_DEM_NAM.length];
  var tenNam = TEN_NAM[index % TEN_NAM.length];
  return ho + " " + tenDemNam + " " + tenNam;
}

function pad2(n) {
  return n < 10 ? "0" + n : String(n);
}

async function upsertUser(seedUser) {
  return User.findOneAndUpdate(
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
}

async function seedRoleAccounts() {
  var passwordHash = bcrypt.hashSync("Password123!", 8);
  var createdUsers = { referees: [], jockeys: [], spectators: [] };

  for (var r = 1; r <= 10; r += 1) {
    var gender = r % 2 === 0 ? "F" : "M";
    var fullName = buildName(r + 20, gender);
    var user = await upsertUser({
      name: fullName,
      username: "referee" + pad2(r),
      fullName: fullName,
      email: "referee" + pad2(r) + "@hr.vn",
      password: passwordHash,
      phone: "09021" + pad2(r) + "000",
      role: "REFEREE",
    });
    createdUsers.referees.push(user);
  }

  for (var j = 1; j <= 20; j += 1) {
    var jGender = j % 2 === 0 ? "F" : "M";
    var jFullName = buildName(j, jGender);
    var jUser = await upsertUser({
      name: jFullName,
      username: "jockey" + pad2(j),
      fullName: jFullName,
      email: "jockey" + pad2(j) + "@hr.vn",
      password: passwordHash,
      phone: "09031" + pad2(j) + "000",
      role: "JOCKEY",
    });
    createdUsers.jockeys.push(jUser);

    await RoleApplication.findOneAndUpdate(
      { userId: jUser._id, role: "JOCKEY" },
      {
        $set: {
          status: "APPROVED",
          fullName: jFullName,
          phone: jUser.phone,
          profileData: {
            licenseNumber: "JK-" + (1000 + j),
            experienceYears: 2 + (j % 10),
            heightCm: 155 + (j % 20),
            weightKg: 48 + (j % 15),
            bio: "Kỵ sĩ chuyên nghiệp với " + (2 + (j % 10)) + " năm kinh nghiệm thi đấu.",
            specialties: "Đua tốc độ, vượt rào",
          },
        },
      },
      { upsert: true, new: true },
    ).exec();
  }

  for (var s = 1; s <= 10; s += 1) {
    var sGender = s % 2 === 0 ? "F" : "M";
    var sFullName = buildName(s + 40, sGender);
    var sUser = await upsertUser({
      name: sFullName,
      username: "spectator" + pad2(s),
      fullName: sFullName,
      email: "spectator" + pad2(s) + "@hr.vn",
      password: passwordHash,
      phone: "09041" + pad2(s) + "000",
      role: "SPECTATOR",
    });
    createdUsers.spectators.push(sUser);
  }

  var { getUserWallet } = require("../services/walletLedger");
  for (var w = 0; w < createdUsers.spectators.length; w += 1) {
    var wallet = await getUserWallet(createdUsers.spectators[w]._id);
    if (Number(wallet.availableBalance || 0) < 1000000) {
      wallet.availableBalance = 1000000;
      await wallet.save();
    }
  }

  console.log("Đã tạo/cập nhật:");
  console.log("- " + createdUsers.referees.length + " trọng tài (referee01..referee10@hr.vn)");
  console.log("- " + createdUsers.jockeys.length + " kỵ sĩ (jockey01..jockey20@hr.vn)");
  console.log("- " + createdUsers.spectators.length + " khán giả (spectator01..spectator10@hr.vn)");
  console.log("Mật khẩu chung: Password123!");

  return createdUsers;
}

module.exports = {
  seedRoleAccounts: seedRoleAccounts,
};

if (require.main === module) {
  var connectPromise = require("../db").connectPromise;
  connectPromise
    .then(function () {
      return seedRoleAccounts();
    })
    .then(function () {
      process.exit(0);
    })
    .catch(function (err) {
      console.error(err);
      process.exit(1);
    });
}
