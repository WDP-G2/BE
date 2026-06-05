var express = require("express");
var crypto = require("crypto");
var jwt = require("jsonwebtoken");
var multer = require("multer");
var router = express.Router();

var Horse = require("../models/horse");
var Tournament = require("../models/tournament");
var User = require("../models/user");
var { authenticate, requireRole } = require("../middleware/auth");
var JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

var CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "";
var CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || "";
var CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || "";
var ACTIVE_TOURNAMENT_STATUSES = ["Nháp", "Đang mở đăng ký", "Đang diễn ra"];
var ACTIVE_REGISTRATION_STATUSES = [
  "Chờ duyệt",
  "Đã duyệt",
  "Đang chạy",
  "Hoàn thành",
];

function requireCloudinaryConfig() {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error("Cloudinary is not configured");
  }
}

var storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  var allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (allowed.indexOf(file.mimetype) === -1) {
    return cb(new Error("Only image files are allowed"));
  }
  cb(null, true);
}

var upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 8 * 1024 * 1024 },
});

function signCloudinaryParams(params) {
  var payload = Object.keys(params)
    .sort()
    .map(function (key) {
      return key + "=" + params[key];
    })
    .join("&");

  return crypto
    .createHash("sha1")
    .update(payload + CLOUDINARY_API_SECRET)
    .digest("hex");
}

function uploadBufferToCloudinary(file, folder) {
  return new Promise(function (resolve, reject) {
    if (!file || !file.buffer) {
      return resolve(null);
    }

    try {
      requireCloudinaryConfig();
    } catch (error) {
      return reject(error);
    }

    var timestamp = Math.floor(Date.now() / 1000).toString();
    var params = {
      folder: folder,
      timestamp: timestamp,
    };
    var signature = signCloudinaryParams(params);
    var formData = new FormData();

    formData.append(
      "file",
      new Blob([file.buffer], {
        type: file.mimetype || "application/octet-stream",
      }),
      file.originalname || "upload.jpg",
    );
    formData.append("api_key", CLOUDINARY_API_KEY);
    formData.append("timestamp", timestamp);
    formData.append("folder", folder);
    formData.append("signature", signature);

    fetch(
      "https://api.cloudinary.com/v1_1/" +
        encodeURIComponent(CLOUDINARY_CLOUD_NAME) +
        "/image/upload",
      {
        method: "POST",
        body: formData,
      },
    )
      .then(function (response) {
        return response.text().then(function (text) {
          if (!response.ok) {
            throw new Error(text || "Cloudinary upload failed");
          }
          return text ? JSON.parse(text) : {};
        });
      })
      .then(resolve)
      .catch(reject);
  });
}

async function uploadHorseAssets(req) {
  var imageFile = req.files && req.files.image ? req.files.image[0] : null;
  var licenseFile =
    req.files && req.files.licenseImage ? req.files.licenseImage[0] : null;

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

function destroyCloudinaryAsset(publicId) {
  if (!publicId) return Promise.resolve();

  try {
    requireCloudinaryConfig();
  } catch (error) {
    return Promise.reject(error);
  }

  var timestamp = Math.floor(Date.now() / 1000).toString();
  var params = {
    public_id: publicId,
    timestamp: timestamp,
  };
  var signature = signCloudinaryParams(params);
  var formData = new FormData();

  formData.append("public_id", publicId);
  formData.append("api_key", CLOUDINARY_API_KEY);
  formData.append("timestamp", timestamp);
  formData.append("signature", signature);

  return fetch(
    "https://api.cloudinary.com/v1_1/" +
      encodeURIComponent(CLOUDINARY_CLOUD_NAME) +
      "/image/destroy",
    {
      method: "POST",
      body: formData,
    },
  ).then(function (response) {
    return response.text().then(function (text) {
      if (!response.ok) {
        throw new Error(text || "Cloudinary delete failed");
      }
      return text ? JSON.parse(text) : {};
    });
  });
}

function createSlug(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function toDate(value) {
  if (!value) return undefined;
  var date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function mapHorse(doc) {
  return {
    id: String(doc._id),
    slug: doc.slug,
    name: doc.name,
    breed: doc.breed || "",
    gender: doc.gender || "",
    birthDate: doc.birthDate || null,
    ownerName: doc.ownerName || "",
    imageUrl: doc.imageUrl || "",
    imagePublicId: doc.imagePublicId || "",
    licenseImageUrl: doc.licenseImageUrl || "",
    licenseImagePublicId: doc.licenseImagePublicId || "",
    healthStatus: doc.healthStatus || "Chưa cập nhật",
    wins: Number(doc.wins || 0),
    races: Number(doc.races || 0),
    achievements: Array.isArray(doc.achievements) ? doc.achievements : [],
    history: Array.isArray(doc.history) ? doc.history : [],
    racingStatus: doc.racingStatus || "can-race",
    canRace: doc.racingStatus !== "cannot-race",
    notes: doc.notes || "",
    createdBy: doc.createdBy ? String(doc.createdBy) : "",
    updatedBy: doc.updatedBy ? String(doc.updatedBy) : "",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function isAdmin(user) {
  return user && user.role === "ADMIN";
}

function isOwner(user) {
  return user && user.role === "OWNER";
}

function canManageHorse(req, horse) {
  if (isAdmin(req.user)) return true;
  if (!isOwner(req.user)) return false;
  return String(horse.createdBy || "") === String(req.user.id || "");
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

router.get("/", async function (req, res, next) {
  try {
    var search = String(req.query.search || "").trim();
    var status = String(
      req.query.racingStatus || req.query.canRace || "",
    ).trim();
    var mine = String(req.query.mine || "").trim() === "true";
    var query = {};

    if (search) {
      query.$or = [
        { name: new RegExp(search, "i") },
        { breed: new RegExp(search, "i") },
        { ownerName: new RegExp(search, "i") },
        { healthStatus: new RegExp(search, "i") },
      ];
    }

    if (status === "can-race" || status === "cannot-race") {
      query.racingStatus = status;
    } else if (status === "true") {
      query.racingStatus = "can-race";
    } else if (status === "false") {
      query.racingStatus = "cannot-race";
    }

    if (mine) {
      req.user = await getRequestUser(req);
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!isAdmin(req.user)) {
        query.createdBy = req.user.id;
      }
    }

    var horses = await Horse.find(query).sort({ createdAt: -1 }).exec();
    res.json(horses.map(mapHorse));
  } catch (err) {
    next(err);
  }
});

router.get("/:identifier", async function (req, res, next) {
  try {
    var horse = await findHorse(req.params.identifier);
    if (!horse) {
      return res.status(404).json({ error: "Horse not found" });
    }

    res.json(mapHorse(horse));
  } catch (err) {
    next(err);
  }
});

router.post(
  "/",
  authenticate,
  requireRole("ADMIN", "OWNER"),
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "licenseImage", maxCount: 1 },
  ]),
  async function (req, res, next) {
    var assets = null;
    try {
      var payload = parseMultipartHorse(req);
      assets = await uploadHorseAssets(req);
      var name = payload.name;

      if (!name) {
        await cleanupNewAssets(assets);
        return res.status(400).json({ error: "Horse name is required" });
      }

      var baseSlug = createSlug(name) || "ngua";
      var slug = baseSlug;
      var seq = 1;
      while (await Horse.exists({ slug: slug })) {
        seq += 1;
        slug = baseSlug + "-" + seq;
      }

      var horse = await Horse.create({
        slug: slug,
        name: name,
        breed: payload.breed,
        gender: payload.gender,
        birthDate: payload.birthDate,
        ownerName: isOwner(req.user)
          ? getOwnerDisplayName(req.user)
          : payload.ownerName,
        imageUrl: assets.imageUrl || "",
        imagePublicId: assets.imagePublicId || "",
        licenseImageUrl: assets.licenseImageUrl || "",
        licenseImagePublicId: assets.licenseImagePublicId || "",
        racingStatus:
          payload.racingStatus === "cannot-race" ? "cannot-race" : "can-race",
        wins: Number.isFinite(payload.wins) ? payload.wins : 0,
        races: Number.isFinite(payload.races) ? payload.races : 0,
        achievements: Array.isArray(payload.achievements)
          ? payload.achievements
          : [],
        history: Array.isArray(payload.history) ? payload.history : [],
        notes: payload.notes,
        createdBy: req.user.id,
        updatedBy: req.user.id,
      });

      res.status(201).json(mapHorse(horse));
    } catch (err) {
      await cleanupNewAssets(assets);
      console.error(
        "Horse create error:",
        err && err.message ? err.message : err,
      );
      var errorMessage = String(err && err.message ? err.message : err);
      if (
        errorMessage.indexOf("Cloudinary is not configured") !== -1 ||
        errorMessage.indexOf("Invalid cloud_name") !== -1 ||
        errorMessage.toLowerCase().indexOf("cloudinary") !== -1
      ) {
        return res.status(400).json({ error: errorMessage });
      }
      next(err);
    }
  },
);

router.patch(
  "/:identifier",
  authenticate,
  requireRole("ADMIN", "OWNER"),
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "licenseImage", maxCount: 1 },
  ]),
  async function (req, res, next) {
    var assets = null;
    try {
      var horse = await findHorse(req.params.identifier);
      if (!horse) {
        return res.status(404).json({ error: "Horse not found" });
      }

      if (!canManageHorse(req, horse)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      var payload = parseMultipartHorse(req);
      assets = await uploadHorseAssets(req);
      var oldImage = horse.imagePublicId;
      var oldLicense = horse.licenseImagePublicId;

      if (payload.name !== undefined && payload.name !== "") {
        horse.name = payload.name;
      }
      if (payload.name && createSlug(payload.name) !== horse.slug) {
        var baseSlug = createSlug(payload.name) || "ngua";
        var slug = baseSlug;
        var seq = 1;
        while (await Horse.exists({ slug: slug, _id: { $ne: horse._id } })) {
          seq += 1;
          slug = baseSlug + "-" + seq;
        }
        horse.slug = slug;
      }

      if (payload.breed !== undefined) horse.breed = payload.breed;
      if (payload.gender !== undefined) horse.gender = payload.gender;
      if (payload.birthDate !== undefined) horse.birthDate = payload.birthDate;
      if (isOwner(req.user)) {
        horse.ownerName = getOwnerDisplayName(req.user);
      } else if (payload.ownerName !== undefined) {
        horse.ownerName = payload.ownerName;
      }
      if (payload.notes !== undefined) horse.notes = payload.notes;
      if (Number.isFinite(payload.wins)) horse.wins = payload.wins;
      if (Number.isFinite(payload.races)) horse.races = payload.races;
      if (Array.isArray(payload.achievements))
        horse.achievements = payload.achievements;
      if (Array.isArray(payload.history)) horse.history = payload.history;

      if (assets.imageUrl !== undefined) {
        horse.imageUrl = assets.imageUrl;
        horse.imagePublicId = assets.imagePublicId || "";
        await destroyCloudinaryAsset(oldImage);
      }

      if (assets.licenseImageUrl !== undefined) {
        horse.licenseImageUrl = assets.licenseImageUrl;
        horse.licenseImagePublicId = assets.licenseImagePublicId || "";
        await destroyCloudinaryAsset(oldLicense);
      }

      if (payload.healthStatus !== undefined) {
        horse.healthStatus = payload.healthStatus || horse.healthStatus;
      }

      if (payload.racingStatus !== undefined && payload.racingStatus !== "") {
        horse.racingStatus =
          payload.racingStatus === "cannot-race" ? "cannot-race" : "can-race";
      }

      horse.updatedBy = req.user.id;
      await horse.save();
      res.json(mapHorse(horse));
    } catch (err) {
      await cleanupNewAssets(assets);
      console.error(
        "Horse update error:",
        err && err.message ? err.message : err,
      );
      var errorMessage = String(err && err.message ? err.message : err);
      if (
        errorMessage.indexOf("Cloudinary is not configured") !== -1 ||
        errorMessage.indexOf("Invalid cloud_name") !== -1 ||
        errorMessage.toLowerCase().indexOf("cloudinary") !== -1
      ) {
        return res.status(400).json({ error: errorMessage });
      }
      next(err);
    }
  },
);

router.delete(
  "/:identifier",
  authenticate,
  requireRole("ADMIN", "OWNER"),
  async function (req, res, next) {
    try {
      var horse = await findHorse(req.params.identifier);
      if (!horse) {
        return res.status(404).json({ error: "Horse not found" });
      }

      if (!canManageHorse(req, horse)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      var activeTournament = await findActiveHorseRegistration(horse._id);
      if (activeTournament) {
        return res.status(409).json({
          error:
            'Không thể xóa ngựa đang có đăng ký trong giải "' +
            activeTournament.name +
            '".',
        });
      }

      await Promise.all([
        destroyCloudinaryAsset(horse.imagePublicId),
        destroyCloudinaryAsset(horse.licenseImagePublicId),
      ]);

      await Horse.deleteOne({ _id: horse._id }).exec();
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
