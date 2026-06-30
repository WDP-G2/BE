var SystemSettings = require("../models/systemSettings");

var PLACEHOLDER_PATTERN = /\{\{([^{}]+)}}/g;
var ALLOWED_PLACEHOLDERS = { tournament: true, race: true };

async function getOrCreate() {
  var settings = await SystemSettings.findOne({ key: "singleton" }).exec();
  if (settings) return settings;
  return SystemSettings.create({ key: "singleton" });
}

function normalizeMoney(value, label, positive) {
  var amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || (positive && amount <= 0)) {
    var err = new Error(label + (positive ? " must be greater than zero" : " must not be negative"));
    err.status = 400;
    throw err;
  }
  return Math.round(amount * 100) / 100;
}

function validateTemplate(template, required) {
  var found = {};
  String(template || "").replace(PLACEHOLDER_PATTERN, function (_, name) {
    if (!ALLOWED_PLACEHOLDERS[name]) {
      var err = new Error("Unsupported email placeholder: {{" + name + "}}");
      err.status = 400;
      throw err;
    }
    found[name] = true;
  });
  if (required && !found[required]) {
    var missing = new Error("Email subject is missing required placeholder: {{" + required + "}}");
    missing.status = 400;
    throw missing;
  }
}

function normalizeDistances(values) {
  if (!Array.isArray(values) || values.length === 0) {
    var required = new Error("Race distances are required");
    required.status = 400;
    throw required;
  }
  var seen = {};
  return values
    .map(function (value) {
      var distance = Number(value);
      if (!Number.isInteger(distance) || distance <= 0) {
        var err = new Error("Race distance must be greater than zero");
        err.status = 400;
        throw err;
      }
      if (seen[distance]) {
        var duplicate = new Error("Race distances must be unique");
        duplicate.status = 400;
        throw duplicate;
      }
      seen[distance] = true;
      return distance;
    })
    .sort(function (a, b) { return a - b; });
}

function map(settings) {
  return {
    defaultRegistrationFee: settings.defaultRegistrationFee,
    lateCheckInFee: settings.lateCheckInFee,
    defaultTournamentRules: settings.defaultTournamentRules,
    registrationOpenEmailSubject: settings.registrationOpenEmailSubject,
    checkInReminderEmailSubject: settings.checkInReminderEmailSubject,
    raceResultEmailSubject: settings.raceResultEmailSubject,
    twoFactorPolicy: settings.twoFactorPolicy,
    sessionDurationMinutes: settings.sessionDurationMinutes,
    systemName: settings.systemName,
    primaryColor: settings.primaryColor,
    raceDistances: (settings.raceDistancesMeters || []).map(function (meters) {
      return { meters: meters, label: meters + "m" };
    }),
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,
    updatedBy: settings.updatedBy,
  };
}

async function update(section, payload, updatedBy) {
  var settings = await getOrCreate();
  if (section === "fees") {
    settings.defaultRegistrationFee = normalizeMoney(payload.defaultRegistrationFee, "Default registration fee", false);
    settings.lateCheckInFee = normalizeMoney(payload.lateCheckInFee, "Late check-in fee", true);
  } else if (section === "rules") {
    settings.defaultTournamentRules = String(payload.defaultTournamentRules || "").trim();
  } else if (section === "emailTemplates") {
    validateTemplate(payload.registrationOpenEmailSubject, "tournament");
    validateTemplate(payload.checkInReminderEmailSubject, "race");
    validateTemplate(payload.raceResultEmailSubject, "race");
    settings.registrationOpenEmailSubject = String(payload.registrationOpenEmailSubject).trim();
    settings.checkInReminderEmailSubject = String(payload.checkInReminderEmailSubject).trim();
    settings.raceResultEmailSubject = String(payload.raceResultEmailSubject).trim();
  } else if (section === "security") {
    settings.twoFactorPolicy = payload.twoFactorPolicy;
    settings.sessionDurationMinutes = Number(payload.sessionDurationMinutes);
  } else if (section === "branding") {
    settings.systemName = String(payload.systemName || "").trim();
    settings.primaryColor = String(payload.primaryColor || "").toUpperCase();
  } else if (section === "raceDistances") {
    settings.raceDistancesMeters = normalizeDistances(payload.distancesMeters || payload.raceDistances || payload);
  }
  settings.updatedBy = updatedBy || "SYSTEM";
  await settings.save();
  return map(settings);
}

module.exports = {
  getOrCreate: getOrCreate,
  getPublicBranding: async function () {
    var settings = await getOrCreate();
    return { systemName: settings.systemName, primaryColor: settings.primaryColor };
  },
  getSettings: async function () { return map(await getOrCreate()); },
  update: update,
};
