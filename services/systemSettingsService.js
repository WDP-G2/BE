var SystemSettings = require("../models/systemSettings");
var { DEFAULT_RULES } = require("../utils/systemSettingsMapper");
var violationSettings = require("../utils/violationSettingsMapper");

var DEFAULT_FEES = {
  defaultRegistrationFee: 5000000,
  lateCheckInFee: 500000,
  entryFeePercent: 5,
  winningTaxPercent: 10,
  platformFeePercent: 2,
};

var DEFAULT_DISTANCES = [1000, 1200, 1400, 1600, 1800, 2000, 2400];

async function ensureSettingsShape(doc) {
  var changed = false;

  if (!doc.fees || typeof doc.fees !== "object") {
    doc.fees = {};
    changed = true;
  }

  Object.keys(DEFAULT_FEES).forEach(function (key) {
    if (doc.fees[key] == null) {
      doc.fees[key] = DEFAULT_FEES[key];
      changed = true;
    }
  });

  if (!Array.isArray(doc.raceDistances) || !doc.raceDistances.length) {
    doc.raceDistances = DEFAULT_DISTANCES.slice();
    changed = true;
  }

  if (!String(doc.rules || "").trim()) {
    doc.rules = DEFAULT_RULES;
    changed = true;
  }

  if (doc.bettingEnabled == null) {
    doc.bettingEnabled = true;
    changed = true;
  }

  if (!Array.isArray(doc.violationTypes) || !doc.violationTypes.length) {
    doc.violationTypes = violationSettings.DEFAULT_VIOLATION_TYPES.slice();
    changed = true;
  }

  if (!Array.isArray(doc.violationPenaltyRules) || !doc.violationPenaltyRules.length) {
    doc.violationPenaltyRules = violationSettings.DEFAULT_VIOLATION_PENALTY_RULES.slice();
    changed = true;
  }

  if (changed) {
    await doc.save();
  }

  return doc;
}

async function getSettingsDoc() {
  var doc = await SystemSettings.findOneAndUpdate(
    { key: "default" },
    {
      $setOnInsert: {
        key: "default",
        fees: DEFAULT_FEES,
        raceDistances: DEFAULT_DISTANCES,
        rules: DEFAULT_RULES,
        bettingEnabled: true,
        violationTypes: violationSettings.DEFAULT_VIOLATION_TYPES,
        violationPenaltyRules: violationSettings.DEFAULT_VIOLATION_PENALTY_RULES,
      },
    },
    { upsert: true, new: true },
  ).exec();

  return ensureSettingsShape(doc);
}

module.exports = {
  DEFAULT_FEES: DEFAULT_FEES,
  DEFAULT_DISTANCES: DEFAULT_DISTANCES,
  ensureSettingsShape: ensureSettingsShape,
  getSettingsDoc: getSettingsDoc,
};
