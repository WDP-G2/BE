var FinanceSettings = require("../models/financeSettings");
var RacePrizeShareSetting = require("../models/racePrizeShareSetting");

function normalizePercent(value, label) {
  var percent = Number(value);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    var err = new Error((label || "Percent") + " must be between 0 and 100");
    err.status = 400;
    throw err;
  }
  return Math.round(percent * 100) / 100;
}

async function getOrCreate() {
  var settings = await FinanceSettings.findOne({ key: "singleton" }).exec();
  if (settings) return settings;
  return FinanceSettings.create({ key: "singleton" });
}

function mapSettings(settings) {
  return {
    betWinningTaxPercent: settings.betWinningTaxPercent || 0,
    bettingEnabled: Boolean(settings.bettingEnabled),
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,
  };
}

async function getSettings() {
  return mapSettings(await getOrCreate());
}

async function updateSettings(payload, updatedBy) {
  var settings = await getOrCreate();
  if (payload.betWinningTaxPercent !== undefined) {
    settings.betWinningTaxPercent = normalizePercent(payload.betWinningTaxPercent, "Bet winning tax percent");
  }
  if (payload.bettingEnabled !== undefined) {
    settings.bettingEnabled = Boolean(payload.bettingEnabled);
  }
  settings.updatedBy = updatedBy || "SYSTEM";
  await settings.save();
  return mapSettings(settings);
}

async function getPrizeShares() {
  var shares = await RacePrizeShareSetting.find({}).sort({ rank: 1 }).exec();
  return {
    shares: shares.map(function (share) {
      var jockeyPercent = normalizePercent(share.jockeyPercent, "Race prize jockey percent");
      return {
        rank: share.rank,
        jockeyPercent: jockeyPercent,
        ownerPercent: Math.round((100 - jockeyPercent) * 100) / 100,
      };
    }),
  };
}

async function updatePrizeShares(payload, updatedBy) {
  var shares = payload.shares || payload.items || [];
  if (!Array.isArray(shares)) {
    var err = new Error("Race prize share settings request is required");
    err.status = 400;
    throw err;
  }
  var seen = {};
  var docs = shares.map(function (share) {
    var rank = Number(share.rank);
    if (!Number.isInteger(rank) || rank <= 0) {
      var rankErr = new Error("Rank must be greater than zero");
      rankErr.status = 400;
      throw rankErr;
    }
    if (seen[rank]) {
      var duplicate = new Error("Race prize share rank must be unique");
      duplicate.status = 400;
      throw duplicate;
    }
    seen[rank] = true;
    return {
      rank: rank,
      jockeyPercent: normalizePercent(share.jockeyPercent, "Race prize jockey percent"),
      createdBy: updatedBy || "SYSTEM",
      updatedBy: updatedBy || "SYSTEM",
    };
  });
  await RacePrizeShareSetting.deleteMany({}).exec();
  if (docs.length) await RacePrizeShareSetting.insertMany(docs);
  return getPrizeShares();
}

module.exports = {
  getPrizeShares: getPrizeShares,
  getSettings: getSettings,
  updatePrizeShares: updatePrizeShares,
  updateSettings: updateSettings,
};
