var STATUS_TO_CODE = {
  "Chờ duyệt": "PENDING",
  "Đã duyệt": "APPROVED",
  "Từ chối": "REJECTED",
  "Đã rút": "WITHDRAWN",
  "Đang chạy": "ONGOING",
  "Hoàn thành": "COMPLETED",
};

function mapRaceRegistration(tournament, registration, race) {
  var reg = registration && registration.toObject ? registration.toObject() : registration || {};
  var raceDoc =
    race ||
    (tournament && tournament.races && reg.raceId
      ? tournament.races.id(reg.raceId)
      : null);

  return {
    id: String(reg._id || ""),
    raceId: reg.raceId ? String(reg.raceId) : null,
    raceName: raceDoc ? raceDoc.name || "" : "",
    raceNumber: raceDoc ? Number(raceDoc.raceNumber || 0) : null,
    raceScheduledAt: raceDoc
      ? raceDoc.scheduledAt || null
      : null,
    tournamentStartDate: tournament ? tournament.startDate || null : null,
    tournamentId: tournament
      ? String(tournament._id)
      : reg.tournamentId
        ? String(reg.tournamentId)
        : null,
    tournamentName: tournament ? tournament.name || "" : "",
    ownerId: reg.ownerId ? String(reg.ownerId) : null,
    ownerUsername: reg.ownerName || "",
    horseId: reg.horseId ? String(reg.horseId) : null,
    horseName: reg.horseName || "",
    jockeyId: reg.jockeyId ? String(reg.jockeyId) : null,
    jockeyUsername: reg.jockeyName || "",
    jockeyInvitationId: reg.jockeyInvitationId ? String(reg.jockeyInvitationId) : null,
    checkInStatus: reg.checkInStatus || "PENDING",
    status: STATUS_TO_CODE[reg.status] || reg.status || "PENDING",
    entryFeeAmount: raceDoc ? Number(raceDoc.entryFee || 0) : 0,
    ownerNote: reg.notes || "",
    reviewNote: reg.reviewNote || "",
    withdrawNote: reg.withdrawNote || "",
    reviewedBy: reg.reviewedBy ? String(reg.reviewedBy) : null,
    reviewedAt: reg.reviewedAt || null,
    createdAt: reg.registeredAt || reg.createdAt || null,
    updatedAt: reg.updatedAt || null,
  };
}

module.exports = {
  STATUS_TO_CODE: STATUS_TO_CODE,
  mapRaceRegistration: mapRaceRegistration,
};
