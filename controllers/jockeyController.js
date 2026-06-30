var api = require("../utils/apiResponse");
var service = require("../services/jockeyService");

function wrap(handler, message) {
  return async function (req, res, next) {
    try {
      return api.ok(res, await handler(req), message);
    } catch (err) {
      next(err);
    }
  };
}

module.exports = {
  adminEligibleHorseTeams: wrap(function (req) {
    return service.adminEligibleHorseTeams(req, req.params.id);
  }),
  adminJockeyProfiles: wrap(function (req) {
    return service.adminJockeyProfiles(req.query || {});
  }),
  availableJockeys: wrap(service.availableJockeys),
  cancelInvitation: wrap(function (req) {
    return service.cancelInvitation(req, req.params.id);
  }, "Jockey invitation cancelled"),
  createInvitation: wrap(function (req) {
    return service.createInvitation(req, req.body || {});
  }, "Jockey invitation created"),
  eligibleHorseTeams: wrap(service.eligibleHorseTeams),
  getApprovedJockeyProfile: wrap(function (req) {
    return service.getApprovedJockeyProfile(req.params.id);
  }),
  getMyProfile: wrap(service.getMyProfile),
  jockeyInvitation: wrap(function (req) {
    return service.jockeyInvitation(req, req.params.id);
  }),
  jockeyInvitations: wrap(service.jockeyInvitations),
  ownerAcceptedJockeys: wrap(service.ownerAcceptedJockeys),
  ownerInvitation: wrap(function (req) {
    return service.ownerInvitation(req, req.params.id);
  }),
  ownerInvitations: wrap(service.ownerInvitations),
  rankings: wrap(service.rankings),
  acceptInvitation: wrap(function (req) {
    return service.respondInvitation(req, req.params.id, "ACCEPTED", req.body || {});
  }, "Jockey invitation accepted"),
  rejectInvitation: wrap(function (req) {
    return service.respondInvitation(req, req.params.id, "REJECTED", req.body || {});
  }, "Jockey invitation rejected"),
  updateMyProfile: wrap(function (req) {
    return service.updateMyProfile(req, req.body || {});
  }, "Jockey profile saved"),
};
