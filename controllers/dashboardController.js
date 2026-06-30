var api = require("../utils/apiResponse");
var service = require("../services/dashboardService");

function wrap(handler) {
  return async function (req, res, next) {
    try {
      return api.ok(res, await handler(req));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = {
  adminDashboard: wrap(service.getAdminDashboard),
  adminRaces: wrap(function (req) {
    return service.getAdminRaces(req.query || {});
  }),
  currentUserDashboard: wrap(service.getCurrentUserDashboard),
  featuredTournaments: wrap(function (req) {
    return service.getFeaturedTournaments(req.query.limit);
  }),
  jockeyDashboard: wrap(service.getJockeyDashboard),
  jockeyPerformance: wrap(async function (req) {
    var user = await service.requireRole(req, "JOCKEY");
    return service.getJockeyPerformanceForUser(user._id);
  }),
  jockeyPrizes: wrap(service.jockeyPrizes),
  jockeyRaces: wrap(async function (req) {
    var user = await service.requireRole(req, "JOCKEY");
    return service.getJockeyRacesForUser(user._id);
  }),
  ownerDashboard: wrap(service.getOwnerDashboard),
  ownerPrizes: wrap(service.ownerPrizes),
  ownerRaces: wrap(async function (req) {
    var user = await service.requireRole(req, "OWNER");
    return service.getOwnerRacesForUser(user._id);
  }),
  quickInsights: wrap(function (req) {
    return service.getAdminQuickInsights(req.query.months);
  }),
  refereeCheckedInCount: wrap(service.refereeCheckedInCount),
  refereeDashboard: wrap(service.getRefereeDashboard),
  refereePendingCheckInCount: wrap(service.refereePendingCheckInCount),
  refereeRaces: wrap(async function (req) {
    var user = await service.requireRole(req, "REFEREE");
    return service.refereeRacesForUser(user._id, false);
  }),
  refereeTodayRaces: wrap(async function (req) {
    var user = await service.requireRole(req, "REFEREE");
    return service.refereeRacesForUser(user._id, true);
  }),
  revenue: wrap(function (req) {
    return service.getAdminDashboardRevenue(req.query.months);
  }),
  spectatorDashboard: wrap(service.getSpectatorDashboard),
  summary: wrap(service.getAdminDashboardSummary),
  topHorses: wrap(function (req) {
    return service.getAdminTopHorses(req.query.limit);
  }),
  tournamentRaceCounts: wrap(function (req) {
    return service.getTournamentRaceCounts(req.query.limit);
  }),
  tournamentRegistrations: wrap(service.tournamentRegistrationSummaries),
};
