var Horse = require("../models/horse");
var { fail } = require("../utils/httpErrors");
var { mapHorse } = require("../utils/horseMapper");
var { destroyCloudinaryAsset } = require("../utils/cloudinaryUpload");
var horseService = require("../services/horseService");

async function list(req, res, next) {
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
      req.user = await horseService.getRequestUser(req);
      if (!req.user) {
        return fail(res, 401, "Vui lòng đăng nhập để tiếp tục");
      }

      if (!horseService.isAdmin(req.user)) {
        query.createdBy = req.user.id;
      }
    }

    var horses = await Horse.find(query).sort({ createdAt: -1 }).exec();
    res.json(horses.map(mapHorse));
  } catch (err) {
    next(err);
  }
}

async function listApproved(req, res, next) {
  try {
    var horses = await Horse.find({ approvalStatus: { $in: ["APPROVED", null] } })
      .sort({ wins: -1, createdAt: -1 })
      .exec();
    res.json(horses.map(mapHorse));
  } catch (err) {
    next(err);
  }
}

async function getByIdentifier(req, res, next) {
  try {
    var horse = await horseService.findHorse(req.params.identifier);
    if (!horse) {
      return fail(res, 404, "Không tìm thấy ngựa");
    }

    res.json(mapHorse(horse));
  } catch (err) {
    next(err);
  }
}

function isCloudinaryErrorMessage(err) {
  var errorMessage = String(err && err.message ? err.message : err);
  return (
    errorMessage.indexOf("Cloudinary is not configured") !== -1 ||
    errorMessage.indexOf("Invalid cloud_name") !== -1 ||
    errorMessage.toLowerCase().indexOf("cloudinary") !== -1
  );
}

async function create(req, res, next) {
  var assets = null;
  try {
    var payload = horseService.parseMultipartHorse(req);
    assets = await horseService.uploadHorseAssets(req);
    var name = payload.name;

    if (!name) {
      await horseService.cleanupNewAssets(assets);
      return fail(res, 400, "Vui lòng nhập tên ngựa");
    }

    var slug = await horseService.generateUniqueSlug(name);

    var horse = await Horse.create({
      slug: slug,
      name: name,
      breed: payload.breed,
      gender: payload.gender,
      age: Number.isFinite(payload.age) ? payload.age : 0,
      color: payload.color,
      heightCm: Number.isFinite(payload.heightCm) ? payload.heightCm : 0,
      weightKg: Number.isFinite(payload.weightKg) ? payload.weightKg : 0,
      birthDate: payload.birthDate,
      ownerName: horseService.isOwner(req.user)
        ? horseService.getOwnerDisplayName(req.user)
        : payload.ownerName,
      ownerId: horseService.isOwner(req.user) ? req.user.id : undefined,
      approvalStatus: horseService.isOwner(req.user) ? "PENDING" : "APPROVED",
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
    await horseService.cleanupNewAssets(assets);
    console.error(
      "Horse create error:",
      err && err.message ? err.message : err,
    );
    if (isCloudinaryErrorMessage(err)) {
      return fail(res, 400, "Chưa cấu hình Cloudinary để tải ảnh lên");
    }
    next(err);
  }
}

async function update(req, res, next) {
  var assets = null;
  try {
    var horse = await horseService.findHorse(req.params.identifier);
    if (!horse) {
      return fail(res, 404, "Không tìm thấy ngựa");
    }

    if (!horseService.canManageHorse(req.user, horse)) {
      return fail(res, 403, "Bạn không có quyền thực hiện thao tác này");
    }

    var payload = horseService.parseMultipartHorse(req);
    assets = await horseService.uploadHorseAssets(req);
    var oldImage = horse.imagePublicId;
    var oldLicense = horse.licenseImagePublicId;

    if (payload.name !== undefined && payload.name !== "") {
      horse.name = payload.name;
    }
    if (payload.name && horseService.createSlug(payload.name) !== horse.slug) {
      horse.slug = await horseService.generateUniqueSlug(payload.name, horse._id);
    }

    if (payload.breed !== undefined) horse.breed = payload.breed;
    if (payload.gender !== undefined) horse.gender = payload.gender;
    if (payload.birthDate !== undefined) horse.birthDate = payload.birthDate;
    if (Number.isFinite(payload.age)) horse.age = payload.age;
    if (payload.color !== undefined) horse.color = payload.color;
    if (Number.isFinite(payload.heightCm)) horse.heightCm = payload.heightCm;
    if (Number.isFinite(payload.weightKg)) horse.weightKg = payload.weightKg;
    if (horseService.isOwner(req.user)) {
      horse.ownerName = horseService.getOwnerDisplayName(req.user);
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
    await horseService.cleanupNewAssets(assets);
    console.error(
      "Horse update error:",
      err && err.message ? err.message : err,
    );
    if (isCloudinaryErrorMessage(err)) {
      return fail(res, 400, "Chưa cấu hình Cloudinary để tải ảnh lên");
    }
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    var horse = await horseService.findHorse(req.params.identifier);
    if (!horse) {
      return fail(res, 404, "Không tìm thấy ngựa");
    }

    if (!horseService.canManageHorse(req.user, horse)) {
      return fail(res, 403, "Bạn không có quyền thực hiện thao tác này");
    }

    var activeTournament = await horseService.findActiveHorseRegistration(horse._id);
    if (activeTournament) {
      return fail(
        res,
        409,
        'Không thể xóa ngựa đang có đăng ký trong giải "' +
          activeTournament.name +
          '".',
      );
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
}

module.exports = {
  list: list,
  listApproved: listApproved,
  getByIdentifier: getByIdentifier,
  create: create,
  update: update,
  remove: remove,
};
