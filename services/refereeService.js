var { apiError } = require("../utils/apiResponse");
var {
  findRaceContext,
  listAllRaces,
  getApprovedParticipants,
} = require("./tournamentRaceService");

var CHECK_IN_ALERT_WINDOW_MS = 2 * 60 * 60 * 1000;

var RACE_STATUS_START_ALIASES = {
  "Nháp": true,
  "Sắp chạy": true,
  "Sắp diễn ra": true,
  "Đã lên lịch": true,
};

var RACE_STATUS_ONGOING_ALIASES = {
  "Đang chạy": true,
  "Đang diễn ra": true,
};

async function getAssignedRaceRows(refereeId) {
  return listAllRaces(function (row) {
    return row.race.refereeId && String(row.race.refereeId) === String(refereeId);
  });
}

function buildDashboardAlerts(summaries, now) {
  var alerts = [];

  summaries.forEach(function (summary) {
    var scheduledMs = summary.scheduledStartAt
      ? new Date(summary.scheduledStartAt).getTime()
      : null;

    if (summary.statusCode === "ONGOING") {
      alerts.push({
        type: "warning",
        title: (summary.name || "Cuộc đua") + " đang diễn ra. Đừng quên chốt kết quả sau khi về đích.",
        status: summary.statusCode,
      });
      return;
    }

    if (
      scheduledMs !== null &&
      scheduledMs >= now &&
      scheduledMs - now <= CHECK_IN_ALERT_WINDOW_MS &&
      summary.pendingCheckInCount > 0
    ) {
      alerts.push({
        type: "info",
        title:
          (summary.name || "Cuộc đua") +
          " sắp diễn ra, còn " +
          summary.pendingCheckInCount +
          " vận động viên chưa check-in.",
        status: summary.statusCode,
      });
      return;
    }

    if (
      scheduledMs !== null &&
      scheduledMs < now &&
      (summary.statusCode === "DRAFT" || summary.statusCode === "SCHEDULED")
    ) {
      alerts.push({
        type: "danger",
        title: (summary.name || "Cuộc đua") + " đã quá giờ dự kiến nhưng chưa bắt đầu.",
        status: summary.statusCode,
      });
    }
  });

  return alerts;
}

async function getCheckInCount(refereeId, checkInStatus) {
  var rows = await getAssignedRaceRows(refereeId);
  return rows.reduce(function (total, row) {
    var participants = getApprovedParticipants(row.tournament, row.raceId);
    return total + participants.filter(function (participant) {
      return (participant.checkInStatus || "PENDING") === checkInStatus;
    }).length;
  }, 0);
}

async function assertOwnRace(raceId, refereeId) {
  var ctx = await findRaceContext(raceId);
  if (!ctx) throw apiError("Không tìm thấy cuộc đua", 404);
  if (!ctx.race.refereeId || String(ctx.race.refereeId) !== String(refereeId)) {
    throw apiError("Bạn không được phân công cuộc đua này", 403);
  }
  return ctx;
}

module.exports = {
  RACE_STATUS_START_ALIASES: RACE_STATUS_START_ALIASES,
  RACE_STATUS_ONGOING_ALIASES: RACE_STATUS_ONGOING_ALIASES,
  getAssignedRaceRows: getAssignedRaceRows,
  buildDashboardAlerts: buildDashboardAlerts,
  getCheckInCount: getCheckInCount,
  assertOwnRace: assertOwnRace,
};
