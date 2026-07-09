var Province = require("../../models/province");
var { apiSuccess, apiError } = require("../../utils/apiResponse");
var {
  mapSettingsDoc,
  mapProvince,
  mapVenue,
  readActiveFlag,
} = require("../../utils/systemSettingsMapper");
var systemSettingsService = require("../../services/systemSettingsService");
var violationSettings = require("../../utils/violationSettingsMapper");

function bodyRules(body) {
  return body?.defaultTournamentRules ?? body?.rules ?? "";
}

async function getSystemSettings(req, res) {
  var doc = await systemSettingsService.getSettingsDoc();
  res.json(apiSuccess(mapSettingsDoc(doc)));
}

async function updateFees(req, res) {
  var doc = await systemSettingsService.getSettingsDoc();
  var body = req.body || {};
  if (!doc.fees || typeof doc.fees !== "object") {
    doc.fees = {};
  }
  doc.fees.defaultRegistrationFee = Number(
    body.defaultRegistrationFee ?? doc.fees.defaultRegistrationFee ?? systemSettingsService.DEFAULT_FEES.defaultRegistrationFee,
  );
  doc.fees.lateCheckInFee = Number(
    body.lateCheckInFee ?? doc.fees.lateCheckInFee ?? systemSettingsService.DEFAULT_FEES.lateCheckInFee,
  );
  doc.markModified("fees");
  await doc.save();
  res.json(apiSuccess(mapSettingsDoc(doc), "Cập nhật lệ phí thành công"));
}

async function updateRules(req, res) {
  var doc = await systemSettingsService.getSettingsDoc();
  var rules = String(bodyRules(req.body)).trim();
  if (!rules) throw apiError("Luật mặc định không được để trống", 400);
  doc.rules = rules;
  await doc.save();
  res.json(apiSuccess(mapSettingsDoc(doc), "Cập nhật luật mặc định thành công"));
}

async function updateRaceDistances(req, res) {
  var doc = await systemSettingsService.getSettingsDoc();
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
}

async function updateViolationTypes(req, res) {
  var doc = await systemSettingsService.getSettingsDoc();
  var body = req.body || {};
  var types = Array.isArray(body.types) ? body.types : [];

  try {
    doc.violationTypes = violationSettings.normalizeViolationTypes(types);
  } catch (err) {
    throw apiError(err.message || "Dữ liệu loại vi phạm không hợp lệ", err.status || 400);
  }

  doc.markModified("violationTypes");
  await doc.save();
  res.json(apiSuccess(mapSettingsDoc(doc), "Cập nhật loại vi phạm thành công"));
}

async function updateViolationRules(req, res) {
  var doc = await systemSettingsService.getSettingsDoc();
  var body = req.body || {};
  var rules = Array.isArray(body.rules) ? body.rules : [];

  try {
    doc.violationPenaltyRules = violationSettings.normalizeViolationRules(rules);
  } catch (err) {
    throw apiError(err.message || "Cấu hình xử phạt không hợp lệ", err.status || 400);
  }

  doc.markModified("violationPenaltyRules");
  await doc.save();
  res.json(apiSuccess(mapSettingsDoc(doc), "Cập nhật cấu hình xử phạt thành công"));
}

async function getPublicViolationTypes(req, res) {
  var doc = await systemSettingsService.getSettingsDoc();
  var types = violationSettings.mapViolationTypesForResponse(
    violationSettings.readViolationTypes(doc),
  );
  res.json(apiSuccess(types));
}

async function listProvinces(req, res) {
  var rows = await Province.find({}).sort({ name: 1 }).exec();
  res.json(apiSuccess(rows.map(mapProvince)));
}

async function createProvince(req, res) {
  if (!req.body?.name?.trim()) throw apiError("Tên tỉnh/thành phố là bắt buộc", 400);
  if (!req.body?.code?.trim()) throw apiError("Mã tỉnh/thành phố là bắt buộc", 400);

  var province = await Province.create({
    name: req.body.name.trim(),
    code: String(req.body.code || "").trim().toUpperCase(),
    active: req.body.active !== false,
    venues: [],
  });
  res.status(201).json(apiSuccess(mapProvince(province), "Tạo tỉnh thành công"));
}

async function updateProvince(req, res) {
  var province = await Province.findById(req.params.id).exec();
  if (!province) throw apiError("Không tìm thấy tỉnh", 404);

  if (req.body.name != null) province.name = String(req.body.name).trim();
  if (req.body.code != null) province.code = String(req.body.code).trim().toUpperCase();
  if (req.body.active != null) province.active = req.body.active !== false;
  await province.save();

  res.json(apiSuccess(mapProvince(province), "Cập nhật tỉnh thành công"));
}

async function deleteProvince(req, res) {
  var province = await Province.findByIdAndDelete(req.params.id).exec();
  if (!province) throw apiError("Không tìm thấy tỉnh", 404);
  res.json(apiSuccess(null, "Xóa tỉnh thành công"));
}

async function setProvinceActive(req, res) {
  var province = await Province.findById(req.params.id).exec();
  if (!province) throw apiError("Không tìm thấy tỉnh", 404);
  province.active = readActiveFlag(req);
  await province.save();
  res.json(apiSuccess(mapProvince(province)));
}

async function listVenues(req, res) {
  var province = await Province.findById(req.params.provinceId).exec();
  if (!province) throw apiError("Không tìm thấy tỉnh", 404);
  res.json(apiSuccess((province.venues || []).map(function (venue) { return mapVenue(venue, province); })));
}

async function createVenue(req, res) {
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
}

async function updateVenue(req, res) {
  var province = await Province.findOne({ "venues._id": req.params.venueId }).exec();
  if (!province) throw apiError("Không tìm thấy địa điểm", 404);
  var venue = province.venues.id(req.params.venueId);
  if (!venue) throw apiError("Không tìm thấy địa điểm", 404);

  if (req.body.name != null) venue.name = String(req.body.name).trim();
  if (req.body.address != null) venue.address = String(req.body.address).trim();
  if (req.body.active != null) venue.active = req.body.active !== false;
  await province.save();
  res.json(apiSuccess(mapVenue(venue, province), "Cập nhật địa điểm thành công"));
}

async function deleteVenue(req, res) {
  var province = await Province.findOne({ "venues._id": req.params.venueId }).exec();
  if (!province) throw apiError("Không tìm thấy địa điểm", 404);
  province.venues.pull(req.params.venueId);
  await province.save();
  res.json(apiSuccess(null, "Xóa địa điểm thành công"));
}

async function setVenueActive(req, res) {
  var province = await Province.findOne({ "venues._id": req.params.venueId }).exec();
  if (!province) throw apiError("Không tìm thấy địa điểm", 404);
  var venue = province.venues.id(req.params.venueId);
  if (!venue) throw apiError("Không tìm thấy địa điểm", 404);
  venue.active = readActiveFlag(req);
  await province.save();
  res.json(apiSuccess(mapVenue(venue, province)));
}

module.exports = {
  getSystemSettings: getSystemSettings,
  updateFees: updateFees,
  updateRules: updateRules,
  updateRaceDistances: updateRaceDistances,
  updateViolationTypes: updateViolationTypes,
  updateViolationRules: updateViolationRules,
  getPublicViolationTypes: getPublicViolationTypes,
  listProvinces: listProvinces,
  createProvince: createProvince,
  updateProvince: updateProvince,
  deleteProvince: deleteProvince,
  setProvinceActive: setProvinceActive,
  listVenues: listVenues,
  createVenue: createVenue,
  updateVenue: updateVenue,
  deleteVenue: deleteVenue,
  setVenueActive: setVenueActive,
};
