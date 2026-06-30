var authService = require("../services/authService");
var horseService = require("../services/horseService");
var api = require("../utils/apiResponse");

async function listApproved(req, res, next) {
  try {
    return api.ok(res, await horseService.listApproved());
  } catch (err) {
    next(err);
  }
}

async function listOwnerHorses(req, res, next) {
  try {
    var currentUser = await authService.currentUser(req);
    return api.ok(res, await horseService.listOwner(currentUser));
  } catch (err) {
    next(err);
  }
}

async function createOwnerHorse(req, res, next) {
  try {
    var currentUser = await authService.currentUser(req);
    return api.ok(
      res,
      await horseService.create(req.body || {}, currentUser),
      "Horse created",
    );
  } catch (err) {
    next(err);
  }
}

async function getHorse(req, res, next) {
  try {
    var currentUser = await authService.currentUser(req);
    var horse = await horseService.find(req.params.id, currentUser);
    return horse ? api.ok(res, horse) : api.fail(res, 404, "Horse not found");
  } catch (err) {
    next(err);
  }
}

async function updateOwnerHorse(req, res, next) {
  try {
    var currentUser = await authService.currentUser(req);
    return api.ok(
      res,
      await horseService.update(req.params.id, req.body || {}, currentUser),
      "Horse updated",
    );
  } catch (err) {
    next(err);
  }
}

async function deleteOwnerHorse(req, res, next) {
  try {
    var currentUser = await authService.currentUser(req);
    await horseService.remove(req.params.id, currentUser);
    return api.ok(res, null, "Horse deleted");
  } catch (err) {
    next(err);
  }
}

async function listAdminHorses(req, res, next) {
  try {
    return api.ok(res, await horseService.listAll({ status: req.query.status || "PENDING" }));
  } catch (err) {
    next(err);
  }
}

async function approveHorse(req, res, next) {
  try {
    var currentUser = await authService.currentUser(req);
    return api.ok(
      res,
      await horseService.review(req.params.id, "APPROVED", currentUser, req.body || {}),
      "Horse approved",
    );
  } catch (err) {
    next(err);
  }
}

async function rejectHorse(req, res, next) {
  try {
    var currentUser = await authService.currentUser(req);
    return api.ok(
      res,
      await horseService.review(req.params.id, "REJECTED", currentUser, req.body || {}),
      "Horse rejected",
    );
  } catch (err) {
    next(err);
  }
}

async function suspendHorse(req, res, next) {
  try {
    var currentUser = await authService.currentUser(req);
    return api.ok(
      res,
      await horseService.review(req.params.id, "SUSPENDED", currentUser, req.body || {}),
      "Horse suspended",
    );
  } catch (err) {
    next(err);
  }
}

module.exports = {
  approveHorse: approveHorse,
  createOwnerHorse: createOwnerHorse,
  deleteOwnerHorse: deleteOwnerHorse,
  getHorse: getHorse,
  listAdminHorses: listAdminHorses,
  listApproved: listApproved,
  listOwnerHorses: listOwnerHorses,
  rejectHorse: rejectHorse,
  suspendHorse: suspendHorse,
  updateOwnerHorse: updateOwnerHorse,
};
