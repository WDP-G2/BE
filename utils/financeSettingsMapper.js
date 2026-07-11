var DEFAULT_RACE_PRIZE_SHARES = [
  { rank: 1, jockeyPercent: 60 },
  { rank: 2, jockeyPercent: 55 },
  { rank: 3, jockeyPercent: 50 },
];

function normalizeRacePrizeShares(rawShares) {
  var shares = Array.isArray(rawShares) ? rawShares : [];
  if (!shares.length) {
    var err = new Error("Phải có ít nhất một dòng chia thưởng");
    err.status = 400;
    throw err;
  }

  var ranks = {};
  var normalized = [];

  shares.forEach(function (share) {
    var rank = Number(share && share.rank);
    if (!Number.isInteger(rank) || rank <= 0) {
      var rankErr = new Error("Thứ hạng chia thưởng phải là số nguyên dương");
      rankErr.status = 400;
      throw rankErr;
    }
    if (ranks[rank]) {
      var dupErr = new Error("Thứ hạng chia thưởng phải là duy nhất");
      dupErr.status = 400;
      throw dupErr;
    }
    ranks[rank] = true;

    var jockeyPercent = Number(share.jockeyPercent);
    if (!Number.isFinite(jockeyPercent) || jockeyPercent < 0 || jockeyPercent > 100) {
      var pctErr = new Error("Phần trăm jockey phải từ 0 đến 100");
      pctErr.status = 400;
      throw pctErr;
    }

    normalized.push({ rank: rank, jockeyPercent: jockeyPercent });
  });

  normalized.sort(function (a, b) {
    return a.rank - b.rank;
  });

  return normalized;
}

function readRacePrizeShares(doc) {
  var source =
    Array.isArray(doc && doc.racePrizeShares) && doc.racePrizeShares.length
      ? doc.racePrizeShares
      : DEFAULT_RACE_PRIZE_SHARES;
  return normalizeRacePrizeShares(source);
}

function mapRacePrizeSharesForResponse(shares) {
  return (shares || []).map(function (item) {
    var jockeyPercent = Number(item.jockeyPercent);
    return {
      rank: item.rank,
      jockeyPercent: jockeyPercent,
      ownerPercent: Math.max(0, 100 - jockeyPercent),
    };
  });
}

function mapFinanceSettings(doc) {
  var plain = doc && doc.toObject ? doc.toObject() : doc || {};
  var fees = plain.fees || {};
  return {
    bettingEnabled: plain.bettingEnabled !== false,
    betWinningTaxPercent: Number(fees.winningTaxPercent != null ? fees.winningTaxPercent : 10),
    createdAt: plain.createdAt || null,
    updatedAt: plain.updatedAt || null,
  };
}

module.exports = {
  DEFAULT_RACE_PRIZE_SHARES: DEFAULT_RACE_PRIZE_SHARES,
  normalizeRacePrizeShares: normalizeRacePrizeShares,
  readRacePrizeShares: readRacePrizeShares,
  mapRacePrizeSharesForResponse: mapRacePrizeSharesForResponse,
  mapFinanceSettings: mapFinanceSettings,
};
