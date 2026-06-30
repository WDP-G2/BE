var express = require("express");
var router = express.Router();
var SystemSettings = require("../../models/systemSettings");
var Province = require("../../models/province");
var { authenticate, requireRole } = require("../../middleware/auth");
var asyncHandler = require("../../utils/asyncHandler");
var { apiSuccess, apiError } = require("../../utils/apiResponse");
var {
  mapSettingsDoc,
  mapProvince,
  mapVenue,
  readActiveFlag,
  DEFAULT_RULES,
} = require("../../utils/systemSettingsMapper");

var DEFAULT_FEES = {
  defaultRegistrationFee: 5000000,
  lateCheckInFee: 500000,
  entryFeePercent: 5,
  winningTaxPercent: 10,
  platformFeePercent: 2,
};

var DEFAULT_DISTANCES = [1000, 1200, 1400, 1600, 1800, 2000, 2400];

router.use(authenticate, requireRole("ADMIN"));

async function ensureSettingsShape(doc) {
  var changed = false;

  if (!doc.fees || typeof doc.fees !== "object") {
    doc.fees = {};
    changed = true;
  }

  Object.keys(DEFAULT_FEES).forEach(function (key) {
    if (doc.fees[key] == null) {
      doc.fees[key] = DEFAULT_FEES[key];
      changed = true;
    }
  });

  if (!Array.isArray(doc.raceDistances) || !doc.raceDistances.length) {
    doc.raceDistances = DEFAULT_DISTANCES.slice();
    changed = true;
  }

  if (!String(doc.rules || "").trim()) {
    doc.rules = DEFAULT_RULES;
    changed = true;
  }

  if (doc.bettingEnabled == null) {
    doc.bettingEnabled = true;
    changed = true;
  }

  if (changed) {
    await doc.save();
  }

  return doc;
}

async function getSettingsDoc() {
  var doc = await SystemSettings.findOneAndUpdate(
    { key: "default" },
    {
      $setOnInsert: {
        key: "default",
        fees: DEFAULT_FEES,
        raceDistances: DEFAULT_DISTANCES,
        rules: DEFAULT_RULES,
        bettingEnabled: true,
      },
    },
    { upsert: true, new: true },
  ).exec();

  return ensureSettingsShape(doc);
}

router.get(
  "/system-settings",
  asyncHandler(async function (req, res) {
    var doc = await getSettingsDoc();
    res.json(apiSuccess(mapSettingsDoc(doc)));
  }),
);

router.put(
  "/system-settings/fees",
  asyncHandler(async function (req, res) {
    var doc = await getSettingsDoc();
    var body = req.body || {};
    if (!doc.fees || typeof doc.fees !== "object") {
      doc.fees = {};
    }
    doc.fees.defaultRegistrationFee = Number(
      body.defaultRegistrationFee ?? doc.fees.defaultRegistrationFee ?? DEFAULT_FEES.defaultRegistrationFee,
    );
    doc.fees.lateCheckInFee = Number(
      body.lateCheckInFee ?? doc.fees.lateCheckInFee ?? DEFAULT_FEES.lateCheckInFee,
    );
    doc.markModified("fees");
    await doc.save();
    res.json(apiSuccess(mapSettingsDoc(doc), "Cập nhật lệ phí thành công"));
  }),
);

router.put(
  "/system-settings/rules",
  asyncHandler(async function (req, res) {
    var doc = await getSettingsDoc();
    var rules = String(bodyRules(req.body)).trim();
    if (!rules) throw apiError("Luật mặc định không được để trống", 400);
    doc.rules = rules;
    await doc.save();
    res.json(apiSuccess(mapSettingsDoc(doc), "Cập nhật luật mặc định thành công"));
  }),
);

function bodyRules(body) {
  return body?.defaultTournamentRules ?? body?.rules ?? "";
}

router.put(
  "/system-settings/race-distances",
  asyncHandler(async function (req, res) {
    var doc = await getSettingsDoc();
    var body = req.body || {};
    var distancesMeters = Array.isArray(body.distancesMeters)
      ? body.distancesMeters
      : Array.isArray(body.distances)
        ? body.distances
        : [];

    var normalized = distancesMeters
      .map(Number)
      .filter(function (value) {
        return Number.isInteger(value) && value > 0;
      });

    if (!normalized.length) {
      throw apiError("Phải có ít nhất một khoảng cách đua hợp lệ", 400);
    }

    doc.raceDistances = normalized;
    doc.markModified("raceDistances");
    await doc.save();
    res.json(apiSuccess(mapSettingsDoc(doc), "Cập nhật cự ly thành công"));
  }),
);

router.get(
  "/provinces",
  asyncHandler(async function (req, res) {
    var rows = await Province.find({}).sort({ name: 1 }).exec();
    res.json(apiSuccess(rows.map(mapProvince)));
  }),
);

router.post(
  "/provinces",
  asyncHandler(async function (req, res) {
    if (!req.body?.name?.trim()) throw apiError("Tên tỉnh/thành phố là bắt buộc", 400);
    if (!req.body?.code?.trim()) throw apiError("Mã tỉnh/thành phố là bắt buộc", 400);

    var province = await Province.create({
      name: req.body.name.trim(),
      code: String(req.body.code || "").trim().toUpperCase(),
      active: req.body.active !== false,
      venues: [],
    });
    res.status(201).json(apiSuccess(mapProvince(province), "Tạo tỉnh thành công"));
  }),
);

router.put(
  "/provinces/:id",
  asyncHandler(async function (req, res) {
    var province = await Province.findById(req.params.id).exec();
    if (!province) throw apiError("Không tìm thấy tỉnh", 404);

    if (req.body.name != null) province.name = String(req.body.name).trim();
    if (req.body.code != null) province.code = String(req.body.code).trim().toUpperCase();
    if (req.body.active != null) province.active = req.body.active !== false;
    await province.save();

    res.json(apiSuccess(mapProvince(province), "Cập nhật tỉnh thành công"));
  }),
);

router.delete(
  "/provinces/:id",
  asyncHandler(async function (req, res) {
    var province = await Province.findByIdAndDelete(req.params.id).exec();
    if (!province) throw apiError("Không tìm thấy tỉnh", 404);
    res.json(apiSuccess(null, "Xóa tỉnh thành công"));
  }),
);

router.put(
  "/provinces/:id/active",
  asyncHandler(async function (req, res) {
    var province = await Province.findById(req.params.id).exec();
    if (!province) throw apiError("Không tìm thấy tỉnh", 404);
    province.active = readActiveFlag(req);
    await province.save();
    res.json(apiSuccess(mapProvince(province)));
  }),
);

router.get(
  "/provinces/:provinceId/venues",
  asyncHandler(async function (req, res) {
    var province = await Province.findById(req.params.provinceId).exec();
    if (!province) throw apiError("Không tìm thấy tỉnh", 404);
    res.json(apiSuccess((province.venues || []).map(function (venue) { return mapVenue(venue, province); })));
  }),
);

router.post(
  "/provinces/:provinceId/venues",
  asyncHandler(async function (req, res) {
    var province = await Province.findById(req.params.provinceId).exec();
    if (!province) throw apiError("Không tìm thấy tỉnh", 404);
    if (!req.body?.name?.trim()) throw apiError("Tên địa điểm đua là bắt buộc", 400);

    province.venues.push({
      name: req.body.name.trim(),
      address: String(req.body.address || "").trim(),
      active: req.body.active !== false,
    });
    await province.save();
    var venue = province.venues[province.venues.length - 1];
    res.status(201).json(apiSuccess(mapVenue(venue, province), "Tạo địa điểm thành công"));
  }),
);

router.put(
  "/venues/:venueId",
  asyncHandler(async function (req, res) {
    var province = await Province.findOne({ "venues._id": req.params.venueId }).exec();
    if (!province) throw apiError("Không tìm thấy địa điểm", 404);
    var venue = province.venues.id(req.params.venueId);
    if (!venue) throw apiError("Không tìm thấy địa điểm", 404);

    if (req.body.name != null) venue.name = String(req.body.name).trim();
    if (req.body.address != null) venue.address = String(req.body.address).trim();
    if (req.body.active != null) venue.active = req.body.active !== false;
    await province.save();
    res.json(apiSuccess(mapVenue(venue, province), "Cập nhật địa điểm thành công"));
  }),
);

router.delete(
  "/venues/:venueId",
  asyncHandler(async function (req, res) {
    var province = await Province.findOne({ "venues._id": req.params.venueId }).exec();
    if (!province) throw apiError("Không tìm thấy địa điểm", 404);
    province.venues.pull(req.params.venueId);
    await province.save();
    res.json(apiSuccess(null, "Xóa địa điểm thành công"));
  }),
);

router.put(
  "/venues/:venueId/active",
  asyncHandler(async function (req, res) {
    var province = await Province.findOne({ "venues._id": req.params.venueId }).exec();
    if (!province) throw apiError("Không tìm thấy địa điểm", 404);
    var venue = province.venues.id(req.params.venueId);
    if (!venue) throw apiError("Không tìm thấy địa điểm", 404);
    venue.active = readActiveFlag(req);
    await province.save();
    res.json(apiSuccess(mapVenue(venue, province)));
  }),
);

module.exports = router;
