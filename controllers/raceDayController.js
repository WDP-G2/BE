var api = require("../utils/apiResponse");
var service = require("../services/raceDayService");

function wrap(fn) {
  return async function (req, res, next) {
    try {
      await fn(req, res);
    } catch (err) {
      next(err);
    }
  };
}

module.exports = {
  register: wrap(async function (req, res) {
    return api.ok(res, await service.registerForRace(req, req.params.id, req.body || {}), "Race registration created");
  }),
  ownerRegistrations: wrap(async function (req, res) {
    return api.ok(res, await service.ownerRegistrations(req));
  }),
  withdraw: wrap(async function (req, res) {
    var item = await service.withdrawRegistration(req, req.params.id, req.body || {});
    return item ? api.ok(res, item, "Registration withdrawn") : api.fail(res, 404, "Registration not found");
  }),
  adminRegistrations: wrap(async function (req, res) {
    return api.ok(res, await service.tournamentRegistrations(req.params.id));
  }),
  approve: wrap(async function (req, res) {
    var item = await service.approveRegistration(req, req.params.id, req.body || {});
    return item ? api.ok(res, item, "Registration approved") : api.fail(res, 404, "Registration not found");
  }),
  reject: wrap(async function (req, res) {
    var item = await service.rejectRegistration(req, req.params.id, req.body || {});
    return item ? api.ok(res, item, "Registration rejected") : api.fail(res, 404, "Registration not found");
  }),
  schedule: wrap(async function (req, res) {
    return api.ok(res, await service.scheduleTournament(req, req.params.id), "Tournament scheduled");
  }),
  participants: wrap(async function (req, res) {
    return api.ok(res, await service.participants(req.params.id));
  }),
  gate: wrap(async function (req, res) {
    var item = await service.setGate(req.params.participantId, req.body || {});
    return item ? api.ok(res, item, "Gate updated") : api.fail(res, 404, "Participant not found");
  }),
  checkIn: wrap(async function (req, res) {
    var item = await service.checkIn(req, req.params.participantId, req.body || {});
    return item ? api.ok(res, item, "Participant checked in") : api.fail(res, 404, "Participant not found");
  }),
  start: wrap(async function (req, res) {
    var race = await service.startRace(req.params.id);
    return race ? api.ok(res, race, "Race started") : api.fail(res, 404, "Race not found");
  }),
  finalize: wrap(async function (req, res) {
    return api.ok(res, await service.finalizeResults(req, req.params.id, req.body || {}), "Race results finalized");
  }),
  results: wrap(async function (req, res) {
    return api.ok(res, await service.raceResults(req.params.id));
  }),
  complaint: wrap(async function (req, res) {
    return api.ok(res, await service.createComplaint(req, req.params.id, req.body || {}), "Complaint created");
  }),
  ownerComplaints: wrap(async function (req, res) {
    return api.ok(res, await service.ownerComplaints(req));
  }),
  adminComplaints: wrap(async function (req, res) {
    return api.ok(res, await service.adminComplaints());
  }),
  resolveComplaint: wrap(async function (req, res) {
    var item = await service.resolveComplaint(req, req.params.id, req.body || {});
    return item ? api.ok(res, item, "Complaint resolved") : api.fail(res, 404, "Complaint not found");
  }),
  finalizeJockeyChallenge: wrap(async function (req, res) {
    return api.ok(
      res,
      await service.finalizeJockeyChallenge(req, req.params.id),
      "Jockey challenge finalized",
    );
  }),
  getJockeyChallenge: wrap(async function (req, res) {
    return api.ok(res, await service.getJockeyChallenge(req.params.id));
  }),
  cancel: wrap(async function (req, res) {
    var race = await service.cancelRace(req, req.params.id, req.body || {});
    return race ? api.ok(res, race, "Race cancelled") : api.fail(res, 404, "Race not found");
  }),
};
