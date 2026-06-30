var api = require("../utils/apiResponse");
var service = require("../services/locationService");

async function listProvinces(req, res, next) {
  try { return api.ok(res, await service.listProvinces()); } catch (err) { next(err); }
}
async function createProvince(req, res, next) {
  try { return api.ok(res, await service.createProvince(req.body || {}), "Province created"); } catch (err) { next(err); }
}
async function updateProvince(req, res, next) {
  try {
    var item = await service.updateProvince(req.params.id, req.body || {});
    return item ? api.ok(res, item, "Province updated") : api.fail(res, 404, "Province not found");
  } catch (err) { next(err); }
}
async function deleteProvince(req, res, next) {
  try { await service.deleteProvince(req.params.id); return api.ok(res, null, "Province deleted"); } catch (err) { next(err); }
}
async function setProvinceActive(req, res, next) {
  try {
    var item = await service.setProvinceActive(req.params.id, req.body.active);
    return item ? api.ok(res, item, "Province active status updated") : api.fail(res, 404, "Province not found");
  } catch (err) { next(err); }
}
async function listVenues(req, res, next) {
  try { return api.ok(res, await service.listVenues(req.params.provinceId)); } catch (err) { next(err); }
}
async function createVenue(req, res, next) {
  try { return api.ok(res, await service.createVenue(req.params.provinceId, req.body || {}), "Venue created"); } catch (err) { next(err); }
}
async function updateVenue(req, res, next) {
  try {
    var item = await service.updateVenue(req.params.venueId, req.body || {});
    return item ? api.ok(res, item, "Venue updated") : api.fail(res, 404, "Venue not found");
  } catch (err) { next(err); }
}
async function deleteVenue(req, res, next) {
  try { await service.deleteVenue(req.params.venueId); return api.ok(res, null, "Venue deleted"); } catch (err) { next(err); }
}
async function setVenueActive(req, res, next) {
  try {
    var item = await service.setVenueActive(req.params.venueId, req.body.active);
    return item ? api.ok(res, item, "Venue active status updated") : api.fail(res, 404, "Venue not found");
  } catch (err) { next(err); }
}

module.exports = {
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
