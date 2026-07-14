var crypto = require("crypto");

function createSeededRandom(seed) {
  var hash = crypto.createHash("sha256").update(String(seed)).digest();
  var state = hash.readUInt32LE(0) || 0x6d2b79f5;
  return function random() {
    state += 0x6d2b79f5;
    var value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function normalize(values) {
  var total = values.reduce(function (sum, value) {
    return sum + Math.max(0, Number(value) || 0);
  }, 0);
  if (total <= 0) {
    return values.map(function () { return values.length ? 1 / values.length : 0; });
  }
  return values.map(function (value) { return Math.max(0, Number(value) || 0) / total; });
}

function chooseIndex(probabilities, random) {
  var cursor = random();
  var cumulative = 0;
  for (var i = 0; i < probabilities.length; i += 1) {
    cumulative += probabilities[i];
    if (cursor <= cumulative || i === probabilities.length - 1) return i;
  }
  return probabilities.length - 1;
}

function parseDistanceMeters(value) {
  var match = String(value || "").replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  var parsed = match ? Number(match[1]) : 1000;
  if (/km/i.test(String(value || ""))) parsed *= 1000;
  return Number.isFinite(parsed) && parsed >= 200 ? parsed : 1000;
}

function buildCheckpoints(item, rank, count, random) {
  var finishAt = 0.9 + (count <= 1 ? 0 : ((rank - 1) / (count - 1)) * 0.1);
  var historyStrength = (Number(item.horseWinRate) + Number(item.jockeyWinRate)) / 2;
  var points = [0, 0.25, 0.5, 0.75].map(function (at, index) {
    if (index === 0) return { at: 0, progress: 0 };
    var expected = at / finishAt;
    var jitter = (random() - 0.5) * 0.12;
    var formBoost = (historyStrength - 0.5) * 0.08;
    return {
      at: at,
      progress: Math.max(0.04, Math.min(0.92, expected + jitter + formBoost)),
    };
  });
  for (var i = 1; i < points.length; i += 1) {
    points[i].progress = Math.max(points[i].progress, points[i - 1].progress + 0.04);
  }
  points.push({ at: finishAt, progress: 1 });
  return points;
}

function runSimulation(participants, seed, distanceValue) {
  var random = createSeededRandom(seed);
  var pool = participants.map(function (item) {
    return Object.assign({}, item, {
      horseWinRate: Number(item.horseWinRate == null ? 0.5 : item.horseWinRate),
      jockeyWinRate: Number(item.jockeyWinRate == null ? 0.5 : item.jockeyWinRate),
      luckValue: Math.max(random(), 0.000001),
    });
  });

  var initialHistory = normalize(pool.map(function (item) {
    return 0.5 * item.horseWinRate + 0.5 * item.jockeyWinRate;
  }));
  var initialLuck = normalize(pool.map(function (item) { return item.luckValue; }));
  pool.forEach(function (item, index) {
    item.initialWinProbability = 0.5 * initialHistory[index] + 0.5 * initialLuck[index];
  });

  var ranked = [];
  while (pool.length) {
    var historyShares = normalize(pool.map(function (item) {
      return 0.5 * item.horseWinRate + 0.5 * item.jockeyWinRate;
    }));
    var luckShares = normalize(pool.map(function (item) { return item.luckValue; }));
    var probabilities = historyShares.map(function (share, index) {
      return 0.5 * share + 0.5 * luckShares[index];
    });
    var selectedIndex = chooseIndex(probabilities, random);
    ranked.push(pool.splice(selectedIndex, 1)[0]);
  }

  var distance = parseDistanceMeters(distanceValue);
  var winnerSpeed = 15 + random() * 2.5;
  var winnerTime = Math.round((distance / winnerSpeed) * 1000);
  var cumulativeGap = 0;
  return ranked.map(function (item, index) {
    if (index > 0) cumulativeGap += 250 + Math.round(random() * 950);
    var rank = index + 1;
    return Object.assign({}, item, {
      rank: rank,
      finishTimeMillis: winnerTime + cumulativeGap,
      checkpoints: buildCheckpoints(item, rank, ranked.length, random),
    });
  });
}

module.exports = {
  createSeededRandom: createSeededRandom,
  normalize: normalize,
  parseDistanceMeters: parseDistanceMeters,
  runSimulation: runSimulation,
};
