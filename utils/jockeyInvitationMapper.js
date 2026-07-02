var STATUS_TO_CODE = {
  "Chờ xử lý": "PENDING",
  "Đã chấp nhận": "ACCEPTED",
  "Đã từ chối": "REJECTED",
  "Đã hủy": "CANCELLED",
};

function mapInvitation(doc) {
  var obj = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(obj._id || ""),
    ownerId: String(obj.ownerId || ""),
    ownerUsername: obj.ownerName || "",
    jockeyId: String(obj.jockeyId || ""),
    jockeyUsername: obj.jockeyName || "",
    horseId: String(obj.horseId || ""),
    horseName: obj.horseName || "",
    raceId: obj.raceId ? String(obj.raceId) : null,
    raceName: obj.raceLabel || "",
    raceScheduledStartAt:
      obj.raceDate && obj.raceTime
        ? obj.raceDate + "T" + obj.raceTime + ":00.000Z"
        : obj.raceDate || null,
    raceScheduledEndAt: null,
    venueId: null,
    venueName: obj.location || "",
    venueAddress: obj.location || "",
    tournamentId: obj.tournamentId ? String(obj.tournamentId) : null,
    tournamentName: obj.tournamentName || "",
    status: STATUS_TO_CODE[obj.status] || "PENDING",
    remunerationAmount: obj.reward || 0,
    taxAmount: 0,
    jockeyPayoutAmount: obj.reward || 0,
    message: obj.message || "",
    responseNote: obj.responseNote || "",
    createdAt: obj.createdAt || null,
    updatedAt: obj.updatedAt || null,
    respondedAt: obj.respondedAt || null,
    cancelledAt: obj.cancelledAt || null,
  };
}

module.exports = {
  STATUS_TO_CODE: STATUS_TO_CODE,
  mapInvitation: mapInvitation,
};
