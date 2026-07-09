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

/** Revert races auto-set to "Đang diễn ra" without referee start. */
function repairPrematureOngoingRaces(tournament) {
  if (!tournament) return false;

  var changed = false;
  (tournament.races || []).forEach(function (race) {
    if (
      race.status === tm.RACE_STATUS_LABELS.ONGOING &&
      !(race.results && race.results.length)
    ) {
      race.status = tm.RACE_STATUS_LABELS.SCHEDULED;
      changed = true;
    }
  });

  return changed;
}

/** Giải ONGOING: đưa race về SCHEDULED để trọng tài start/chốt kết quả. */
function repairRacesForOngoingTournament(tournament) {
  if (!tournament) return false;
  if (tm.toTournamentStatusCode(tournament.status) !== "ONGOING") return false;

  var changed = repairPrematureOngoingRaces(tournament);

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

function ensureRaceScheduledForStart(tournament, race) {
  if (!tournament || !race) return tm.toRaceStatusCode(race && race.status);

  if (tm.toTournamentStatusCode(tournament.status) !== "ONGOING") {
    return tm.toRaceStatusCode(race.status);
  }

  if (race.status === tm.RACE_STATUS_LABELS.ONGOING) {
    race.status = tm.RACE_STATUS_LABELS.SCHEDULED;
    return "SCHEDULED";
  }

  var raceCode = tm.toRaceStatusCode(race.status);
  if (isPreScheduleRaceStatusCode(raceCode)) {
    race.status = tm.RACE_STATUS_LABELS.SCHEDULED;
    return "SCHEDULED";
  }

  return raceCode;
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
    var changed =
      tournamentCode === "ONGOING"
        ? repairRacesForOngoingTournament(tournament)
        : syncTournamentRaceStatuses(tournament, tournamentCode);

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
