var STATUS_TO_CODE = {
  "Chờ xử lý": "PENDING",
  "Đã chấp nhận": "ACCEPTED",
  "Đã từ chối": "DECLINED",
  "Đã hủy": "CANCELLED",
};

function mapInvitation(doc) {
  var obj = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(obj._id || ""),
    raceId: String(obj.raceId || ""),
    tournamentId: String(obj.tournamentId || ""),
    tournamentName: obj.tournamentName || "",
    tournamentLocation: obj.tournamentLocation || "",
    raceName: obj.raceName || "",
    raceDate: obj.raceDate || "",
    raceTime: obj.raceTime || "",
    refereeId: String(obj.refereeId || ""),
    refereeName: obj.refereeName || "",
    salaryConfigId: obj.salaryConfigId ? String(obj.salaryConfigId) : null,
    message: obj.message || "",
    responseNote: obj.responseNote || "",
    status: STATUS_TO_CODE[obj.status] || "PENDING",
    invitedAt: obj.createdAt || null,
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
