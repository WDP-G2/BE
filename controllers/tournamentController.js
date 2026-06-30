var authService = require("../services/authService");
var tournamentService = require("../services/tournamentService");
var adminService = require("../services/adminService");
var api = require("../utils/apiResponse");

async function record(req, action, referenceType, referenceId, reason, metadata) {
  var admin = await authService.currentUser(req);
  await adminService.recordAudit(admin, action, referenceType, referenceId, reason, null, metadata || {});
}

async function list(req, res, next) {
  try {
    return api.ok(res, await tournamentService.listAll());
  } catch (err) {
    next(err);
  }
}

async function get(req, res, next) {
  try {
    var tournament = await tournamentService.get(req.params.id);
    return tournament
      ? api.ok(res, tournament)
      : api.fail(res, 404, "Tournament not found");
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    var currentUser = await authService.currentUser(req);
    var item = await tournamentService.create(req.body || {}, currentUser);
    await adminService.recordAudit(
      currentUser,
      "TOURNAMENT_CREATED",
      "TOURNAMENT",
      item && item.id,
      "Race day draft created",
      null,
      { name: item && item.name },
    );
    return api.ok(
      res,
      item,
      "Tournament created",
    );
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    var item = await tournamentService.update(req.params.id, req.body || {});
    await record(req, "TOURNAMENT_UPDATED", "TOURNAMENT", req.params.id, "Race day setup updated", req.body || {});
    return api.ok(
      res,
      item,
      "Tournament updated",
    );
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await tournamentService.remove(req.params.id);
    await record(req, "TOURNAMENT_DELETED", "TOURNAMENT", req.params.id, "Tournament deleted");
    return api.ok(res, null, "Tournament deleted");
  } catch (err) {
    next(err);
  }
}

async function races(req, res, next) {
  try {
    return api.ok(res, await tournamentService.races(req.params.id));
  } catch (err) {
    next(err);
  }
}

async function createRace(req, res, next) {
  try {
    var race = await tournamentService.createRace(req.params.id, req.body || {});
    if (race) await record(req, "TOURNAMENT_RACE_CREATED", "TOURNAMENT", req.params.id, "Race created for race day", { raceId: String(race._id || race.id || "") });
    return race ? api.ok(res, race, "Race created") : api.fail(res, 404, "Tournament not found");
  } catch (err) {
    next(err);
  }
}

async function updateRace(req, res, next) {
  try {
    var race = await tournamentService.updateRace(req.params.raceId, req.body || {});
    if (race) await record(req, "TOURNAMENT_RACE_UPDATED", "RACE", req.params.raceId, "Race updated: " + req.params.raceId, req.body || {});
    return race ? api.ok(res, race, "Race updated") : api.fail(res, 404, "Race not found");
  } catch (err) {
    next(err);
  }
}

async function deleteRace(req, res, next) {
  try {
    await tournamentService.deleteRace(req.params.raceId);
    await record(req, "TOURNAMENT_RACE_DELETED", "RACE", req.params.raceId, "Race deleted: " + req.params.raceId);
    return api.ok(res, null, "Race deleted");
  } catch (err) {
    next(err);
  }
}

async function replaceRaces(req, res, next) {
  try {
    var currentUser = await authService.currentUser(req);
    var item = await tournamentService.replaceRaces(req.params.id, req.body || [], currentUser);
    await record(req, "TOURNAMENT_RACES_UPDATED", "TOURNAMENT", req.params.id, "Race day races replaced", req.body || []);
    return api.ok(res, item, "Tournament races updated");
  } catch (err) {
    next(err);
  }
}

async function updateStatus(req, res, next) {
  try {
    var item = await tournamentService.setStatus(req.params.id, req.body.status);
    await record(req, "TOURNAMENT_STATUS_UPDATED", "TOURNAMENT", req.params.id, "Tournament status updated to " + req.body.status);
    return api.ok(
      res,
      item,
      "Status updated",
    );
  } catch (err) {
    next(err);
  }
}

async function openRegistration(req, res, next) {
  try {
    var item = await tournamentService.setStatus(req.params.id, "Đang mở đăng ký");
    await record(req, "TOURNAMENT_STATUS_UPDATED", "TOURNAMENT", req.params.id, "Tournament status changed to OPEN_REGISTRATION");
    return api.ok(
      res,
      item,
      "Registration opened",
    );
  } catch (err) {
    next(err);
  }
}

async function closeRegistration(req, res, next) {
  try {
    var item = await tournamentService.setStatus(req.params.id, "Nháp");
    await record(req, "TOURNAMENT_STATUS_UPDATED", "TOURNAMENT", req.params.id, "Tournament registration closed");
    return api.ok(
      res,
      item,
      "Registration closed",
    );
  } catch (err) {
    next(err);
  }
}

async function finalize(req, res, next) {
  try {
    var currentUser = await authService.currentUser(req);
    var data = await tournamentService.finalizeTournament(req.params.id, currentUser);
    await record(req, "TOURNAMENT_FINALIZED", "TOURNAMENT", req.params.id, "Tournament finalized");
    return api.ok(res, data, "Tournament finalized");
  } catch (err) {
    next(err);
  }
}

function uploadBanner(req, res) {
  return api.ok(
    res,
    { id: req.params.id || null, url: req.body.banner || "", imageUrl: req.body.banner || "" },
    req.params.id ? "Banner updated" : "Banner uploaded",
  );
}

async function leaderboard(req, res, next) {
  try {
    var data = await tournamentService.leaderboard(req.params.id);
    return data ? api.ok(res, data) : api.fail(res, 404, "Tournament not found");
  } catch (err) {
    next(err);
  }
}

async function statistics(req, res, next) {
  try {
    var data = await tournamentService.statistics(req.params.id);
    return data ? api.ok(res, data) : api.fail(res, 404, "Tournament not found");
  } catch (err) {
    next(err);
  }
}

async function payouts(req, res, next) {
  try {
    var data = await tournamentService.payouts(req.params.id);
    return data ? api.ok(res, data) : api.fail(res, 404, "Tournament not found");
  } catch (err) {
    next(err);
  }
}

async function venues(req, res, next) {
  try {
    var data = await tournamentService.venues(req.params.id);
    return data ? api.ok(res, data) : api.fail(res, 404, "Tournament not found");
  } catch (err) {
    next(err);
  }
}

module.exports = {
  closeRegistration: closeRegistration,
  create: create,
  createRace: createRace,
  deleteRace: deleteRace,
  finalize: finalize,
  get: get,
  leaderboard: leaderboard,
  list: list,
  openRegistration: openRegistration,
  payouts: payouts,
  races: races,
  remove: remove,
  replaceRaces: replaceRaces,
  statistics: statistics,
  update: update,
  updateRace: updateRace,
  updateStatus: updateStatus,
  uploadBanner: uploadBanner,
  venues: venues,
};
