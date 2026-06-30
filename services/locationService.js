var Province = require("../models/province");
var RaceVenue = require("../models/raceVenue");
var Tournament = require("../models/tournament");

function normalizeText(value, label) {
  if (!value || !String(value).trim()) {
    var err = new Error(label + " is required");
    err.status = 400;
    throw err;
  }
  return String(value).trim();
}

function normalizeCode(value) {
  return normalizeText(value, "Province code").toUpperCase();
}

function duplicateError(message) {
  var err = new Error(message);
  err.status = 409;
  return err;
}

function mapProvince(province) {
  if (!province) return null;
  return {
    id: String(province._id),
    name: province.name,
    code: province.code,
    active: province.active !== false,
    createdAt: province.createdAt,
    updatedAt: province.updatedAt,
  };
}

async function mapVenue(venue) {
  if (!venue) return null;
  var province = await Province.findById(venue.provinceId).exec();
  return {
    id: String(venue._id),
    provinceId: String(venue.provinceId),
    provinceName: province ? province.name : null,
    name: venue.name,
    address: venue.address || "",
    active: venue.active !== false,
    createdAt: venue.createdAt,
    updatedAt: venue.updatedAt,
  };
}

async function listProvinces() {
  var provinces = await Province.find({}).sort({ name: 1 }).exec();
  return provinces.map(mapProvince);
}

async function ensureProvinceUnique(name, code, exceptId) {
  var nameExisting = await Province.findOne({ name: new RegExp("^" + escapeRegExp(name) + "$", "i") }).exec();
  if (nameExisting && String(nameExisting._id) !== String(exceptId || "")) {
    throw duplicateError("Province name already exists");
  }
  var codeExisting = await Province.findOne({ code: new RegExp("^" + escapeRegExp(code) + "$", "i") }).exec();
  if (codeExisting && String(codeExisting._id) !== String(exceptId || "")) {
    throw duplicateError("Province code already exists");
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function createProvince(payload) {
  var name = normalizeText(payload.name, "Province name");
  var code = normalizeCode(payload.code);
  await ensureProvinceUnique(name, code);
  return mapProvince(
    await Province.create({
      name: name,
      code: code,
      active: payload.active !== false,
    }),
  );
}

async function updateProvince(id, payload) {
  var province = await Province.findById(id).exec();
  if (!province) return null;
  var name = normalizeText(payload.name, "Province name");
  var code = normalizeCode(payload.code);
  await ensureProvinceUnique(name, code, id);
  province.name = name;
  province.code = code;
  province.active = payload.active !== false;
  await province.save();
  return mapProvince(province);
}

async function setProvinceActive(id, active) {
  var province = await Province.findById(id).exec();
  if (!province) return null;
  province.active = Boolean(active);
  await province.save();
  return mapProvince(province);
}

async function deleteProvince(id) {
  var venueCount = await RaceVenue.countDocuments({ provinceId: id }).exec();
  if (venueCount > 0) {
    var err = new Error("Cannot delete province with configured venues");
    err.status = 400;
    throw err;
  }
  await Province.findByIdAndDelete(id).exec();
}

async function listVenues(provinceId) {
  var province = await Province.findById(provinceId).exec();
  if (!province) {
    var err = new Error("Province not found");
    err.status = 404;
    throw err;
  }
  var venues = await RaceVenue.find({ provinceId: provinceId }).sort({ name: 1 }).exec();
  var result = [];
  for (var i = 0; i < venues.length; i += 1) result.push(await mapVenue(venues[i]));
  return result;
}

async function createVenue(provinceId, payload) {
  var province = await Province.findById(provinceId).exec();
  if (!province) {
    var missing = new Error("Province not found");
    missing.status = 404;
    throw missing;
  }
  if (province.active === false) {
    var inactive = new Error("Province is inactive");
    inactive.status = 400;
    throw inactive;
  }
  var name = normalizeText(payload.name, "Venue name");
  var duplicate = await RaceVenue.findOne({
    provinceId: provinceId,
    name: new RegExp("^" + escapeRegExp(name) + "$", "i"),
  }).exec();
  if (duplicate) throw duplicateError("Venue name already exists in province");
  return mapVenue(
    await RaceVenue.create({
      provinceId: provinceId,
      name: name,
      address: payload.address ? String(payload.address).trim() : "",
      active: payload.active !== false,
    }),
  );
}

async function updateVenue(id, payload) {
  var venue = await RaceVenue.findById(id).exec();
  if (!venue) return null;
  var name = normalizeText(payload.name, "Venue name");
  var duplicate = await RaceVenue.findOne({
    provinceId: venue.provinceId,
    name: new RegExp("^" + escapeRegExp(name) + "$", "i"),
  }).exec();
  if (duplicate && String(duplicate._id) !== String(id)) {
    throw duplicateError("Venue name already exists in province");
  }
  venue.name = name;
  venue.address = payload.address ? String(payload.address).trim() : "";
  venue.active = payload.active !== false;
  await venue.save();
  return mapVenue(venue);
}

async function setVenueActive(id, active) {
  var venue = await RaceVenue.findById(id).exec();
  if (!venue) return null;
  venue.active = Boolean(active);
  await venue.save();
  return mapVenue(venue);
}

async function deleteVenue(id) {
  await RaceVenue.findByIdAndDelete(id).exec();
}

async function activeVenuesByTournament(tournamentId) {
  var tournament = await Tournament.findById(tournamentId).exec();
  if (!tournament || !tournament.provinceId) return [];
  var venues = await RaceVenue.find({
    provinceId: tournament.provinceId,
    active: { $ne: false },
  }).sort({ name: 1 }).exec();
  var result = [];
  for (var i = 0; i < venues.length; i += 1) result.push(await mapVenue(venues[i]));
  return result;
}

module.exports = {
  activeVenuesByTournament: activeVenuesByTournament,
  createProvince: createProvince,
  createVenue: createVenue,
  deleteProvince: deleteProvince,
  deleteVenue: deleteVenue,
  listProvinces: listProvinces,
  listVenues: listVenues,
  setProvinceActive: setProvinceActive,
  setVenueActive: setVenueActive,
  updateProvince: updateProvince,
  updateVenue: updateVenue,
};
