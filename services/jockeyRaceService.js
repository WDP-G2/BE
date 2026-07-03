function normalizeRaceStatus(registrationStatus, raceStatus) {
  var reg = String(registrationStatus || "")
    .trim()
    .toLowerCase();
  var race = String(raceStatus || "")
    .trim()
    .toLowerCase();

  if (
    reg === "từ chối" ||
    reg === "rejected" ||
    reg === "cancelled" ||
    race === "cancelled" ||
    race === "đã hủy"
  ) {
    return "CANCELLED";
  }

  if (
    reg === "đang chạy" ||
    reg === "racing" ||
    reg === "đang diễn ra" ||
    race === "đang chạy" ||
    race === "đang diễn ra" ||
    race === "ongoing"
  ) {
    return "ONGOING";
  }

  if (
    reg === "hoàn thành" ||
    reg === "completed" ||
    reg === "đã kết thúc" ||
    race === "hoàn thành" ||
    race === "completed" ||
    race === "đã kết thúc"
  ) {
    return "COMPLETED";
  }

  return "SCHEDULED";
}

module.exports = {
  normalizeRaceStatus: normalizeRaceStatus,
};
