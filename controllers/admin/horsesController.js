var Horse = require("../../models/horse");
var User = require("../../models/user");
var { apiSuccess, apiError } = require("../../utils/apiResponse");

var STATUS_LABELS = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Từ chối",
  SUSPENDED: "Tạm khóa",
};

function calculateAge(horse) {
  if (Number.isFinite(Number(horse.age)) && Number(horse.age) > 0) {
    return Number(horse.age);
  }

  if (!horse.birthDate) return 0;
  var birthDate = new Date(horse.birthDate);
  if (Number.isNaN(birthDate.getTime())) return 0;

  var now = new Date();
  var age = now.getFullYear() - birthDate.getFullYear();
  var monthDiff = now.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && now.getDate() < birthDate.getDate())
  ) {
    age -= 1;
  }
  return Math.max(age, 0);
}

function getUserDisplayName(user) {
  if (!user) return "";
  return user.fullName || user.name || user.username || user.email || "";
}

function ownerKeyForHorse(horse) {
  return horse.ownerId ? String(horse.ownerId) : horse.createdBy ? String(horse.createdBy) : "";
}

function mapHorse(horse, owner) {
  var statusCode = horse.approvalStatus || "APPROVED";
  var ownerId = ownerKeyForHorse(horse);
  var ownerName = horse.ownerName || getUserDisplayName(owner);
  return {
    id: String(horse._id),
    name: horse.name,
    slug: horse.slug,
    breed: horse.breed || "",
    gender: horse.gender || "",
    age: calculateAge(horse),
    color: horse.color || "",
    heightCm: Number(horse.heightCm || 0),
    weightKg: Number(horse.weightKg || 0),
    birthDate: horse.birthDate || null,
    ownerName: ownerName,
    ownerUsername: ownerName,
    ownerId: ownerId || null,
    createdBy: horse.createdBy ? String(horse.createdBy) : "",
    updatedBy: horse.updatedBy ? String(horse.updatedBy) : "",
    approvalStatus: statusCode,
    status: statusCode,
    statusCode: statusCode,
    statusLabel: STATUS_LABELS[statusCode] || statusCode,
    reviewReason: horse.notes || "",
    racingStatus: horse.racingStatus || "can-race",
    canRace: horse.racingStatus !== "cannot-race",
    imageUrl: horse.imageUrl || "",
    imagePublicId: horse.imagePublicId || "",
    documentUrl: horse.licenseImageUrl || "",
    licenseImageUrl: horse.licenseImageUrl || "",
    licenseImagePublicId: horse.licenseImagePublicId || "",
    healthStatus: horse.healthStatus || "Chưa cập nhật",
    wins: Number(horse.wins || 0),
    races: Number(horse.races || 0),
    achievements: Array.isArray(horse.achievements) ? horse.achievements : [],
    history: Array.isArray(horse.history) ? horse.history : [],
    createdAt: horse.createdAt,
    updatedAt: horse.updatedAt,
  };
}

async function buildOwnerMap(horses) {
  var ids = Array.from(
    new Set(
      (horses || [])
        .map(ownerKeyForHorse)
        .filter(Boolean),
    ),
  );

  if (!ids.length) return {};

  var users = await User.find({ _id: { $in: ids } }).exec();
  return users.reduce(function (result, user) {
    result[String(user._id)] = user;
    return result;
  }, {});
}

async function mapHorsesWithOwners(horses) {
  var ownerById = await buildOwnerMap(horses);
  return horses.map(function (horse) {
    return mapHorse(horse, ownerById[ownerKeyForHorse(horse)]);
  });
}

async function list(req, res) {
  var filter = {};
  if (req.query.status) filter.approvalStatus = String(req.query.status).toUpperCase();
  var horses = await Horse.find(filter).sort({ updatedAt: -1 }).exec();
  res.json(apiSuccess(await mapHorsesWithOwners(horses)));
}

async function approve(req, res) {
  var horse = await Horse.findByIdAndUpdate(
    req.params.id,
    { $set: { approvalStatus: "APPROVED", racingStatus: "can-race", updatedBy: req.user.id } },
    { new: true },
  ).exec();
  if (!horse) throw apiError("Không tìm thấy ngựa", 404);
  var ownerById = await buildOwnerMap([horse]);
  res.json(
    apiSuccess(
      mapHorse(horse, ownerById[ownerKeyForHorse(horse)]),
      "Duyệt ngựa thành công",
    ),
  );
}

async function reject(req, res) {
  var horse = await Horse.findByIdAndUpdate(
    req.params.id,
    {
      $set: {
        approvalStatus: "REJECTED",
        racingStatus: "cannot-race",
        notes: req.body.reason || req.body.note || "Không đạt yêu cầu duyệt",
        updatedBy: req.user.id,
      },
    },
    { new: true },
  ).exec();
  if (!horse) throw apiError("Không tìm thấy ngựa", 404);
  var ownerById = await buildOwnerMap([horse]);
  res.json(
    apiSuccess(
      mapHorse(horse, ownerById[ownerKeyForHorse(horse)]),
      "Từ chối ngựa thành công",
    ),
  );
}

async function suspend(req, res) {
  var horse = await Horse.findByIdAndUpdate(
    req.params.id,
    {
      $set: {
        approvalStatus: "SUSPENDED",
        racingStatus: "cannot-race",
        notes: req.body.reason || req.body.note || "Tạm khóa bởi admin",
        updatedBy: req.user.id,
      },
    },
    { new: true },
  ).exec();
  if (!horse) throw apiError("Không tìm thấy ngựa", 404);
  var ownerById = await buildOwnerMap([horse]);
  res.json(
    apiSuccess(
      mapHorse(horse, ownerById[ownerKeyForHorse(horse)]),
      "Tạm ngưng ngựa thành công",
    ),
  );
}

module.exports = {
  list: list,
  approve: approve,
  reject: reject,
  suspend: suspend,
};
