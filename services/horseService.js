var jwt = require("jsonwebtoken");
var Horse = require("../models/horse");
var Tournament = require("../models/tournament");
var User = require("../models/user");
var {
  uploadBufferToCloudinary,
  destroyCloudinaryAsset,
} = require("../utils/cloudinaryUpload");

var JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
var ACTIVE_TOURNAMENT_STATUSES = ["Nháp", "Đang mở đăng ký", "Đang diễn ra"];
var ACTIVE_REGISTRATION_STATUSES = [
  "Chờ duyệt",
  "Đã duyệt",
  "Đang chạy",
  "Hoàn thành",
];

function createSlug(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function toDate(value) {
  if (!value) return undefined;
  var date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function isAdmin(user) {
  return user && user.role === "ADMIN";
}

function isOwner(user) {
  return user && user.role === "OWNER";
}

function canManageHorse(reqUser, horse) {
  if (isAdmin(reqUser)) return true;
  if (!isOwner(reqUser)) return false;
  return (
    String(horse.createdBy || "") === String(reqUser.id || "") ||
    String(horse.ownerId || "") === String(reqUser.id || "")
  );
}

function getOwnerDisplayName(user) {
  return user.fullName || user.username || user.email || "";
}

async function findActiveHorseRegistration(horseId) {
  return Tournament.findOne({
    status: { $in: ACTIVE_TOURNAMENT_STATUSES },
    registrations: {
      $elemMatch: {
        horseId: horseId,
        status: { $in: ACTIVE_REGISTRATION_STATUSES },
      },
    },
  })
    .select("name status registrations")
    .exec();
}

async function getRequestUser(req) {
  try {
    var authHeader = req.headers.authorization || "";
    var token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!token) return null;

    var payload = jwt.verify(token, JWT_SECRET);
    var user = await User.findById(payload.userId || payload.sub).exec();
    if (!user) return null;

    return {
      id: String(user._id),
      role: user.role,
      email: user.email,
      fullName: user.fullName || user.name || "",
      username: user.username || "",
    };
  } catch (error) {
    return null;
  }
}

function parseMultipartHorse(req) {
  var body = req.body || {};

  return {
    name: String(body.name || "").trim(),
    breed: String(body.breed || "").trim(),
    gender: String(body.gender || "").trim(),
    age: body.age !== undefined ? Number(body.age) : undefined,
    color: String(body.color || "").trim(),
    heightCm: body.heightCm !== undefined ? Number(body.heightCm) : undefined,
    weightKg: body.weightKg !== undefined ? Number(body.weightKg) : undefined,
    birthDate: toDate(body.birthDate),
    ownerName: String(body.ownerName || "").trim(),
    healthStatus: String(body.healthStatus || "").trim(),
    wins: body.wins !== undefined ? Number(body.wins) : undefined,
    races: body.races !== undefined ? Number(body.races) : undefined,
    achievements: body.achievements,
    history: body.history,
    racingStatus: String(body.racingStatus || "").trim(),
    notes: String(body.notes || "").trim(),
  };
}

async function findHorse(identifier) {
  if (identifier && /^[a-fA-F0-9]{24}$/.test(identifier)) {
    var byId = await Horse.findById(identifier).exec();
    if (byId) return byId;
  }

  return Horse.findOne({ slug: identifier }).exec();
}

async function cleanupNewAssets(assetMap) {
  if (!assetMap) return;
  await Promise.all([
    destroyCloudinaryAsset(assetMap.imagePublicId),
    destroyCloudinaryAsset(assetMap.licenseImagePublicId),
  ]);
}

async function uploadHorseAssets(req) {
  var imageFile = req.files && req.files.image ? req.files.image[0] : null;
  var licenseFile =
    req.files && req.files.licenseImage
      ? req.files.licenseImage[0]
      : req.files && req.files.document
        ? req.files.document[0]
        : null;

  var image = null;
  var license = null;

  try {
    image = imageFile
      ? await uploadBufferToCloudinary(imageFile, "horse-racing/horses")
      : null;
    license = licenseFile
      ? await uploadBufferToCloudinary(licenseFile, "horse-racing/licenses")
      : null;
  } catch (error) {
    await cleanupNewAssets({
      imagePublicId: image ? image.public_id : "",
      licenseImagePublicId: license ? license.public_id : "",
    });
    throw error;
  }

  return {
    imageUrl: image ? image.secure_url : undefined,
    imagePublicId: image ? image.public_id : undefined,
    licenseImageUrl: license ? license.secure_url : undefined,
    licenseImagePublicId: license ? license.public_id : undefined,
  };
}

async function generateUniqueSlug(name, excludeId) {
  var baseSlug = createSlug(name) || "ngua";
  var slug = baseSlug;
  var seq = 1;
  var filter = function () {
    return excludeId
      ? { slug: slug, _id: { $ne: excludeId } }
      : { slug: slug };
  };
  while (await Horse.exists(filter())) {
    seq += 1;
    slug = baseSlug + "-" + seq;
  }
  return slug;
}

module.exports = {
  createSlug: createSlug,
  isAdmin: isAdmin,
  isOwner: isOwner,
  canManageHorse: canManageHorse,
  getOwnerDisplayName: getOwnerDisplayName,
  findActiveHorseRegistration: findActiveHorseRegistration,
  getRequestUser: getRequestUser,
  parseMultipartHorse: parseMultipartHorse,
  findHorse: findHorse,
  cleanupNewAssets: cleanupNewAssets,
  uploadHorseAssets: uploadHorseAssets,
  generateUniqueSlug: generateUniqueSlug,
};
