var express = require("express");
var router = express.Router();
var SystemSettings = require("../../models/systemSettings");
var Province = require("../../models/province");
var { authenticate, requireRole } = require("../../middleware/auth");
var asyncHandler = require("../../utils/asyncHandler");
var { apiSuccess, apiError } = require("../../utils/apiResponse");

router.use(authenticate, requireRole("ADMIN"));

async function getSettingsDoc() {
  var doc = await SystemSettings.findOne({ key: "default" }).exec();
  if (doc) return doc;
  return SystemSettings.create({ key: "default" });
}

router.get(
  "/system-settings",
  asyncHandler(async function (req, res) {
    var doc = await getSettingsDoc();
    res.json(apiSuccess(doc));
  }),
);

router.put(
  "/system-settings/fees",
  asyncHandler(async function (req, res) {
    var doc = await getSettingsDoc();
    doc.fees = Object.assign({}, doc.fees || {}, req.body || {});
    await doc.save();
    res.json(apiSuccess(doc.fees, "Cập nhật phí thành công"));
  }),
);

router.put(
  "/system-settings/race-distances",
  asyncHandler(async function (req, res) {
    var doc = await getSettingsDoc();
    doc.raceDistances = Array.isArray(req.body?.distances)
      ? req.body.distances.map(Number)
      : Array.isArray(req.body)
        ? req.body.map(Number)
        : doc.raceDistances;
    await doc.save();
    res.json(apiSuccess(doc.raceDistances, "Cập nhật cự ly thành công"));
  }),
);

router.get(
  "/provinces",
  asyncHandler(async function (req, res) {
    var rows = await Province.find({}).sort({ name: 1 }).exec();
    res.json(apiSuccess(rows));
  }),
);

router.post(
  "/provinces",
  asyncHandler(async function (req, res) {
    var province = await Province.create({
      name: req.body.name,
      code: req.body.code || "",
      active: req.body.active !== false,
      venues: [],
    });
    res.status(201).json(apiSuccess(province, "Tạo tỉnh thành công"));
  }),
);

router.put(
  "/provinces/:id",
  asyncHandler(async function (req, res) {
    var province = await Province.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true }).exec();
    if (!province) throw apiError("Không tìm thấy tỉnh", 404);
    res.json(apiSuccess(province, "Cập nhật tỉnh thành công"));
  }),
);

router.delete(
  "/provinces/:id",
  asyncHandler(async function (req, res) {
    await Province.findByIdAndDelete(req.params.id).exec();
    res.json(apiSuccess(null, "Xóa tỉnh thành công"));
  }),
);

router.put(
  "/provinces/:id/active",
  asyncHandler(async function (req, res) {
    var province = await Province.findByIdAndUpdate(
      req.params.id,
      { $set: { active: req.body.active !== false } },
      { new: true },
    ).exec();
    if (!province) throw apiError("Không tìm thấy tỉnh", 404);
    res.json(apiSuccess(province));
  }),
);

router.get(
  "/provinces/:provinceId/venues",
  asyncHandler(async function (req, res) {
    var province = await Province.findById(req.params.provinceId).exec();
    if (!province) throw apiError("Không tìm thấy tỉnh", 404);
    res.json(apiSuccess(province.venues || []));
  }),
);

router.post(
  "/provinces/:provinceId/venues",
  asyncHandler(async function (req, res) {
    var province = await Province.findById(req.params.provinceId).exec();
    if (!province) throw apiError("Không tìm thấy tỉnh", 404);
    province.venues.push({
      name: req.body.name,
      address: req.body.address || "",
      active: req.body.active !== false,
    });
    await province.save();
    res.status(201).json(apiSuccess(province.venues[province.venues.length - 1], "Tạo địa điểm thành công"));
  }),
);

router.put(
  "/venues/:venueId",
  asyncHandler(async function (req, res) {
    var province = await Province.findOne({ "venues._id": req.params.venueId }).exec();
    if (!province) throw apiError("Không tìm thấy địa điểm", 404);
    var venue = province.venues.id(req.params.venueId);
    if (!venue) throw apiError("Không tìm thấy địa điểm", 404);
    Object.assign(venue, req.body || {});
    await province.save();
    res.json(apiSuccess(venue, "Cập nhật địa điểm thành công"));
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
    venue.active = req.body.active !== false;
    await province.save();
    res.json(apiSuccess(venue));
  }),
);

module.exports = router;
