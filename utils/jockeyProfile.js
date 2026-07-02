var Tournament = require("../models/tournament");
var JockeyInvitation = require("../models/jockeyInvitation");

async function buildJockeyPerformancePayload(userId) {
  var tournaments = await Tournament.find({ "registrations.jockeyId": userId })
    .lean()
    .exec();
  var acceptedInvitations = await JockeyInvitation.find({
    jockeyId: userId,
    status: "Đã chấp nhận",
  })
    .lean()
    .exec();

  var registrations = [];
  var raceHistory = [];
  var totalPrizePayout = 0;
  var firstPlaces = 0;

  var totalJockeyPayout = acceptedInvitations.reduce(function (sum, item) {
    return sum + Number(item.reward || 0);
  }, 0);

  tournaments.forEach(function (tournament) {
    (tournament.registrations || []).forEach(function (registration) {
      if (String(registration.jockeyId || "") !== String(userId)) return;

      registrations.push({ registration, tournament });

      var race = null;
      if (registration.raceId) {
        race = (tournament.races || []).find(function (item) {
          return String(item._id) === String(registration.raceId);
        });
      }
      if (!race && (tournament.races || []).length) {
        race = tournament.races[0];
      }

      if (!race) return;

      var result = (race.results || []).find(function (item) {
        return String(item.jockeyId || "") === String(userId);
      });

      if (!result) return;

      if (Number(result.position) === 1) firstPlaces += 1;
      totalPrizePayout += Number(result.points || 0);

      raceHistory.push({
        raceId: String(race._id || registration.raceId || ""),
        tournamentName: tournament.name || "",
        raceName: race.name || registration.horseName || "",
        horseName: registration.horseName || "",
        rank: Number(result.position || 0),
        finishTimeMillis: 0,
        finalizedAt: race.updatedAt || tournament.updatedAt || null,
        scheduledStartAt: race.scheduledAt || null,
      });
    });
  });

  raceHistory.sort(function (a, b) {
    var aTime = a.scheduledStartAt ? new Date(a.scheduledStartAt).getTime() : 0;
    var bTime = b.scheduledStartAt ? new Date(b.scheduledStartAt).getTime() : 0;
    return bTime - aTime;
  });

  return {
    raceCount: registrations.length,
    firstPlaces: firstPlaces,
    wins: firstPlaces,
    races: registrations.length,
    totalJockeyPayout: totalJockeyPayout,
    totalPrizePayout: totalPrizePayout,
    recentRaces: raceHistory.slice(0, 5),
  };
}

function buildProfileResponse(app, user, performancePayload) {
  var pd = (app && app.profileData) || {};
  var raceCount = Number(performancePayload?.raceCount || 0);
  var wins = Number(performancePayload?.wins || 0);
  var winRate =
    raceCount > 0 ? Number(((wins / raceCount) * 100).toFixed(1)) : 0;

  return {
    id: app ? String(app._id) : null,
    userId: String(user.id || user._id || ""),
    fullName: (app && app.fullName) || user.fullName || user.username || "",
    username: user.username || "",
    email: user.email || "",
    licenseNumber: pd.licenseNumber || "",
    experienceYears: Number(pd.experienceYears || 0),
    heightCm: Number(pd.heightCm || 0),
    weightKg: Number(pd.weightKg || 0),
    hirePrice: Number(pd.hirePrice || 0),
    bio: pd.bio || "",
    awards: pd.awards || "",
    achievements: pd.achievements || "",
    specialties: pd.specialties || "",
    avatarUrl: pd.avatarUrl || "",
    licenseDocumentUrl: pd.licenseDocumentUrl || "",
    status: app ? app.status || "APPROVED" : "NO_APPROVED_PROFILE",
    performance: {
      totalRaces: raceCount,
      wins: wins,
      winRate: winRate,
    },
    raceHistory: Array.isArray(performancePayload?.recentRaces)
      ? performancePayload.recentRaces
      : [],
  };
}

module.exports = {
  buildJockeyPerformancePayload: buildJockeyPerformancePayload,
  buildProfileResponse: buildProfileResponse,
};
