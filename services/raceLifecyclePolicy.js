var tm = require("../utils/tournamentMapper");
var { apiError } = require("../utils/apiResponse");

function getApprovedParticipants(tournament, raceId) {
  return (tournament.registrations || []).filter(function (registration) {
    return String(registration.raceId) === String(raceId) &&
      ["Đã duyệt", "Đang chạy", "Hoàn thành"].indexOf(registration.status) !== -1;
  });
}

function assertRaceReadyToStart(tournament, race) {
  var participants = getApprovedParticipants(tournament, race._id);
  if (!participants.length) throw apiError("Race has no approved participants", 400);

  var gates = {};
  participants.forEach(function (participant) {
    var gate = Number(participant.gateNumber);
    if (!Number.isInteger(gate) || gate <= 0) {
      throw apiError("Gate number must be assigned before race starts", 400);
    }
    if (gates[gate]) throw apiError("Gate number already exists in this race", 400);
    gates[gate] = true;
  });

  var checkedInCount = participants.filter(function (registration) {
    return registration.checkInStatus === "CHECKED_IN";
  }).length;
  var configuredMin = Number(race.minHorses || 0);
  var minRequired = configuredMin > 0 ? configuredMin : 1;
  if (checkedInCount < minRequired) {
    throw apiError("Race does not have enough checked-in participants", 400);
  }
}

function assertRaceCanStart(tournament, race, refereeId) {
  if (!race.refereeId || String(race.refereeId) !== String(refereeId)) {
    throw apiError("Bạn không được phân công cuộc đua này", 403);
  }
  if (tm.toTournamentStatusCode(tournament.status) !== "ONGOING") {
    throw apiError(
      "Giải đấu chưa được bắt đầu. Vui lòng chờ ban tổ chức chuyển giải sang trạng thái Đang diễn ra.",
      400,
    );
  }
  if (race.resultFinalizedAt || (race.results && race.results.length)) {
    throw apiError("Cuộc đua đã có kết quả và không thể bắt đầu lại", 400);
  }
  if (tm.toRaceStatusCode(race.status) !== "SCHEDULED") {
    throw apiError(
      "Chỉ có thể bắt đầu cuộc đua khi cuộc đua ở trạng thái Sắp diễn ra. Admin cần lên lịch giải trước.",
      400,
    );
  }
  assertRaceReadyToStart(tournament, race);
}

function applyRaceStartedState(tournament, race) {
  getApprovedParticipants(tournament, race._id).forEach(function (registration) {
    if (registration.checkInStatus === "CHECKED_IN") {
      registration.participantStatus = "RACING";
      registration.status = "Đang chạy";
      return;
    }
    if (registration.participantStatus === "REGISTERED") {
      registration.checkInStatus = "ABSENT";
      registration.participantStatus = "ABSENT";
    }
  });
  race.status = tm.RACE_STATUS_LABELS.ONGOING;
}

function prepareOfficialRaceResults(tournament, race, entries) {
  if (!Array.isArray(entries) || !entries.length) {
    throw apiError("Thiếu kết quả cuộc đua", 400);
  }

  var raceId = String(race._id);
  var approved = getApprovedParticipants(tournament, race._id);
  var eligible = approved.filter(function (registration) {
    return ["RACING", "CHECKED_IN"].indexOf(registration.participantStatus) !== -1 ||
      registration.checkInStatus === "CHECKED_IN";
  });
  var registrationById = new Map(approved.map(function (registration) {
    return [String(registration._id), registration];
  }));
  var seenParticipants = new Set();
  var seenRanks = new Set();
  var participantUpdates = [];
  var savedResults = [];

  entries.forEach(function (item) {
    var participantId = String(item && item.participantId || "").trim();
    if (!participantId || seenParticipants.has(participantId)) {
      throw apiError("Mỗi ngựa tham gia phải có đúng một kết quả", 400);
    }
    var registration = registrationById.get(participantId);
    if (!registration || String(registration.raceId) !== raceId) {
      throw apiError("Không tìm thấy ngựa tham gia trong cuộc đua", 400);
    }
    if (eligible.indexOf(registration) === -1) {
      throw apiError("Chỉ ngựa đã check-in và tham gia đua mới được ghi kết quả", 400);
    }

    var status = String(item.status || "").trim().toUpperCase();
    if (["FINISHED", "DISQUALIFIED"].indexOf(status) === -1) {
      throw apiError("Trạng thái kết quả không hợp lệ", 400);
    }
    var note = String(item.note || "").trim();
    var isDisqualified = status === "DISQUALIFIED";
    var rank = isDisqualified ? 0 : Number(item.rank);
    var finishTimeMillis = isDisqualified ? 0 : Number(item.finishTimeMillis);
    if (isDisqualified && !note) throw apiError("Ngựa bị loại phải có lý do", 400);
    if (!isDisqualified) {
      if (!Number.isInteger(rank) || rank <= 0 || seenRanks.has(rank)) {
        throw apiError("Thứ hạng kết quả không hợp lệ hoặc bị trùng", 400);
      }
      if (!Number.isSafeInteger(finishTimeMillis) || finishTimeMillis <= 0) {
        throw apiError("Thời gian hoàn thành không hợp lệ", 400);
      }
      seenRanks.add(rank);
    }

    seenParticipants.add(participantId);
    participantUpdates.push({
      registration: registration,
      participantStatus: isDisqualified ? "DISQUALIFIED" : "FINISHED",
      status: isDisqualified ? registration.status : "Hoàn thành",
      note: note,
    });
    savedResults.push({
      position: rank,
      horseId: registration.horseId || null,
      horseName: registration.horseName || "—",
      participantId: registration._id,
      jockeyId: registration.jockeyId || null,
      jockeyName: registration.jockeyName || "",
      time: finishTimeMillis > 0 ? String(finishTimeMillis) : "—",
      points: 0,
      notes: note,
      status: status,
      source: "MANUAL",
    });
  });

  if (seenParticipants.size !== eligible.length) {
    throw apiError("Kết quả phải bao gồm mọi ngựa đã tham gia cuộc đua", 400);
  }
  var finishedCount = savedResults.filter(function (result) {
    return result.status === "FINISHED";
  }).length;
  for (var expectedRank = 1; expectedRank <= finishedCount; expectedRank += 1) {
    if (!seenRanks.has(expectedRank)) throw apiError("Thứ hạng phải liên tục từ 1", 400);
  }

  savedResults.sort(function (first, second) {
    if (!first.position) return 1;
    if (!second.position) return -1;
    return first.position - second.position;
  });
  return { savedResults: savedResults, participantUpdates: participantUpdates };
}

function applyOfficialResultParticipantUpdates(prepared) {
  (prepared.participantUpdates || []).forEach(function (update) {
    update.registration.participantStatus = update.participantStatus;
    update.registration.status = update.status;
    if (update.note) update.registration.notes = update.note;
  });
}

module.exports = {
  assertRaceReadyToStart: assertRaceReadyToStart,
  assertRaceCanStart: assertRaceCanStart,
  applyRaceStartedState: applyRaceStartedState,
  prepareOfficialRaceResults: prepareOfficialRaceResults,
  applyOfficialResultParticipantUpdates: applyOfficialResultParticipantUpdates,
};
