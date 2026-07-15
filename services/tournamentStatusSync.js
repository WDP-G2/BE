var tm = require("../utils/tournamentMapper");

var PRE_RACE_STATUS_CODES = ["DRAFT", "PUBLISHED", "OPEN_REGISTRATION", "REGISTRATION_CLOSED"];
var PRE_SCHEDULE_RACE_STATUS_CODES = PRE_RACE_STATUS_CODES.slice();

function isPreRaceStatusCode(code) {
  return PRE_RACE_STATUS_CODES.indexOf(code) !== -1;
}

function isPreScheduleRaceStatusCode(code) {
  return PRE_SCHEDULE_RACE_STATUS_CODES.indexOf(code) !== -1;
}

function preRaceStatusLabelFor(tournamentStatusCode) {
  switch (tournamentStatusCode) {
    case "DRAFT":
      return tm.RACE_STATUS_LABELS.DRAFT;
    case "PUBLISHED":
      return tm.RACE_STATUS_LABELS.PUBLISHED;
    case "OPEN_REGISTRATION":
      return tm.RACE_STATUS_LABELS.OPEN_REGISTRATION;
    case "REGISTRATION_CLOSED":
      return tm.RACE_STATUS_LABELS.REGISTRATION_CLOSED;
    default:
      return null;
  }
}

function syncPreRaceStatuses(tournament, tournamentStatusCode) {
  var targetLabel = preRaceStatusLabelFor(tournamentStatusCode);
  if (!targetLabel || !tournament) return false;

  var changed = false;
  (tournament.races || []).forEach(function (race) {
    var raceCode = tm.toRaceStatusCode(race.status);
    if (isPreRaceStatusCode(raceCode) && race.status !== targetLabel) {
      race.status = targetLabel;
      changed = true;
    }
  });

  return changed;
}

function syncScheduledRaceStatuses(tournament) {
  if (!tournament) return false;

  var changed = false;
  (tournament.races || []).forEach(function (race) {
    var raceCode = tm.toRaceStatusCode(race.status);
    if (
      isPreScheduleRaceStatusCode(raceCode) &&
      race.status !== tm.RACE_STATUS_LABELS.SCHEDULED
    ) {
      race.status = tm.RACE_STATUS_LABELS.SCHEDULED;
      changed = true;
    }
  });

  return changed;
}

/** Compatibility no-op: an ONGOING race must never be rewound implicitly. */
function repairPrematureOngoingRaces(tournament) {
  return false;
}

/** Compatibility no-op: races operate independently after the tournament starts. */
function repairRacesForOngoingTournament(tournament) {
  if (!tournament) return false;
  if (tm.toTournamentStatusCode(tournament.status) !== "ONGOING") return false;
  return false;
}

function ensureRaceScheduledForStart(tournament, race) {
  if (!tournament || !race) return tm.toRaceStatusCode(race && race.status);

  if (tm.toTournamentStatusCode(tournament.status) !== "ONGOING") {
    return tm.toRaceStatusCode(race.status);
  }

  return tm.toRaceStatusCode(race.status);
}

function syncTournamentRaceStatuses(tournament, tournamentStatusCode) {
  if (!tournament) return false;

  if (tournamentStatusCode === "SCHEDULED") {
    return syncScheduledRaceStatuses(tournament);
  }

  return syncPreRaceStatuses(tournament, tournamentStatusCode);
}

async function repairRaceStatusesForRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return;

  var tournamentsToSave = new Map();

  rows.forEach(function (row) {
    var tournament = row.tournament;
    if (!tournament) return;

    var tournamentCode = tm.toTournamentStatusCode(tournament.status);
    var changed = syncTournamentRaceStatuses(tournament, tournamentCode);

    if (changed) {
      tournamentsToSave.set(String(tournament._id), tournament);
    }
  });

  if (!tournamentsToSave.size) return;

  await Promise.all(
    Array.from(tournamentsToSave.values()).map(function (tournament) {
      return tournament.save();
    }),
  );
}

module.exports = {
  syncPreRaceStatuses: syncPreRaceStatuses,
  syncScheduledRaceStatuses: syncScheduledRaceStatuses,
  repairPrematureOngoingRaces: repairPrematureOngoingRaces,
  repairRacesForOngoingTournament: repairRacesForOngoingTournament,
  ensureRaceScheduledForStart: ensureRaceScheduledForStart,
  isPreScheduleRaceStatusCode: isPreScheduleRaceStatusCode,
  syncTournamentRaceStatuses: syncTournamentRaceStatuses,
  repairRaceStatusesForRows: repairRaceStatusesForRows,
};
