var DEFAULT_RULES =
  "1. Ngựa phải có giấy chứng nhận sức khỏe hợp lệ.\n" +
  "2. Jockey phải có chứng chỉ FIA.\n" +
  "3. Kiểm tra doping bắt buộc.";
var violationSettings = require("./violationSettingsMapper");

function mapRaceDistance(value) {
  var meters = Number(typeof value === "object" && value != null ? value.meters : value);
  if (!Number.isFinite(meters) || meters <= 0) return null;
  return {
    meters: meters,
    label: meters + "m",
    value: meters + "m",
  };
}

function mapSettingsDoc(doc) {
  var plain = doc && doc.toObject ? doc.toObject() : doc || {};
  var fees = plain.fees || {};
  var distances = Array.isArray(plain.raceDistances) ? plain.raceDistances : [];
  var violationTypes = violationSettings.readViolationTypes(plain);
  var violationPenaltyRules = violationSettings.readViolationPenaltyRules(plain);

  return {
    id: String(plain._id || plain.id || ""),
    defaultRegistrationFee: Number(
      fees.defaultRegistrationFee != null
        ? fees.defaultRegistrationFee
        : plain.defaultRegistrationFee != null
          ? plain.defaultRegistrationFee
          : 5000000,
    ),
    lateCheckInFee: Number(
      fees.lateCheckInFee != null
        ? fees.lateCheckInFee
        : plain.lateCheckInFee != null
          ? plain.lateCheckInFee
          : 500000,
    ),
    defaultTournamentRules: String(plain.rules || plain.defaultTournamentRules || DEFAULT_RULES),
    raceDistances: distances.map(mapRaceDistance).filter(Boolean),
    bettingEnabled: plain.bettingEnabled !== false,
    violationTypes: violationSettings.mapViolationTypesForResponse(violationTypes),
    violationPenaltyRules: violationSettings.mapViolationPenaltyRulesForResponse(violationPenaltyRules),
    createdAt: plain.createdAt || null,
    updatedAt: plain.updatedAt || null,
  };
}

function mapProvince(province) {
  return {
    id: String(province._id || province.id || ""),
    name: province.name || "",
    code: province.code || "",
    active: province.active !== false,
  };
}

function mapVenue(venue, province) {
  return {
    id: String(venue._id || venue.id || ""),
    provinceId: String(province._id || province.id || ""),
    provinceName: province.name || "",
    name: venue.name || "",
    address: venue.address || "",
    active: venue.active !== false,
  };
}

function readActiveFlag(req) {
  if (req.query.active !== undefined) {
    return String(req.query.active).toLowerCase() !== "false" && req.query.active !== "0";
  }
  if (req.body && req.body.active !== undefined) {
    return req.body.active !== false;
  }
  return true;
}

module.exports = {
  DEFAULT_RULES: DEFAULT_RULES,
  mapSettingsDoc: mapSettingsDoc,
  mapProvince: mapProvince,
  mapVenue: mapVenue,
  readActiveFlag: readActiveFlag,
};
