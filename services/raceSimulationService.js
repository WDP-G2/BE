var crypto = require("crypto");
var Tournament = require("../models/tournament");
var Horse = require("../models/horse");
var { BetMarket, Bet } = require("../models/betting");
var { apiError } = require("../utils/apiResponse");
var tm = require("../utils/tournamentMapper");
var { findRaceContext, getApprovedParticipants, prizeAmountForRank } = require("./tournamentRaceService");
var { getPerformanceMaps, emptyStats } = require("./racePerformanceService");
var { runSimulation } = require("./raceSimulationEngine");
var { payReferee } = require("./walletLedger");

var PLAYBACK_DURATION_MS = 28000;

function assertOwnRace(ctx, refereeId) {
  if (!ctx.race.refereeId || String(ctx.race.refereeId) !== String(refereeId)) {
    throw apiError("Bạn không được phân công cuộc đua này", 403);
  }
}

function mapSimulation(race) {
  var simulation = race && race.simulation;
  if (!simulation || !simulation.runId || simulation.status === "NOT_STARTED") return null;
  return {
    raceId: String(race._id),
    status: simulation.status,
    runId: simulation.runId,
    algorithmVersion: simulation.algorithmVersion || "v1",
    seed: simulation.seed,
    historyWeight: Number(simulation.historyWeight || 0.5),
    luckWeight: Number(simulation.luckWeight || 0.5),
    generatedAt: simulation.generatedAt,
    playbackDurationMs: Number(simulation.playbackDurationMs || PLAYBACK_DURATION_MS),
    playbackEndsAt: simulation.playbackEndsAt,
    confirmedAt: simulation.confirmedAt || null,
    serverTime: new Date(),
    participants: (simulation.participants || []).map(function (item) {
      return {
        participantId: String(item.participantId),
        horseId: String(item.horseId),
        horseName: item.horseName,
        jockeyId: item.jockeyId ? String(item.jockeyId) : null,
        jockeyName: item.jockeyName || "",
        gateNumber: item.gateNumber,
        horseStarts: item.horseStarts,
        horseWins: item.horseWins,
        horseWinRate: item.horseWinRate,
        jockeyStarts: item.jockeyStarts,
        jockeyWins: item.jockeyWins,
        jockeyWinRate: item.jockeyWinRate,
        initialWinProbability: item.initialWinProbability,
        luckValue: item.luckValue,
        rank: item.rank,
        finishTimeMillis: item.finishTimeMillis,
        checkpoints: item.checkpoints || [],
      };
    }),
  };
}

async function closeBetting(raceId) {
  var markets = await BetMarket.find({ raceId: raceId, status: "OPEN" }).exec();
  if (!markets.length) return;
  var now = new Date();
  var ids = markets.map(function (market) { return market._id; });
  await BetMarket.updateMany({ _id: { $in: ids } }, { $set: { status: "CLOSED", closedAt: now } }).exec();
  await Bet.updateMany(
    { marketId: { $in: ids }, status: "PLACED" },
    { $set: { status: "LOCKED", lockedAt: now } },
  ).exec();
}

async function generate(raceId, refereeId) {
  var ctx = await findRaceContext(raceId);
  if (!ctx) throw apiError("Không tìm thấy cuộc đua", 404);
  assertOwnRace(ctx, refereeId);
  if (tm.toRaceStatusCode(ctx.race.status) !== "ONGOING") {
    throw apiError("Chỉ có thể mô phỏng khi cuộc đua đang diễn ra", 409);
  }
  if ((ctx.race.results || []).length) throw apiError("Cuộc đua đã có kết quả", 409);
  var existing = mapSimulation(ctx.race);
  if (existing) return existing;

  var registrations = getApprovedParticipants(ctx.tournament, ctx.race._id).filter(function (reg) {
    return reg.checkInStatus === "CHECKED_IN" && reg.participantStatus !== "DISQUALIFIED" && reg.horseId;
  });
  var minimum = Math.max(2, Number(ctx.race.minHorses || 2));
  if (registrations.length < minimum) {
    throw apiError("Không đủ ngựa đã check-in để mô phỏng (tối thiểu " + minimum + ")", 422);
  }
  var usedGates = {};
  registrations.forEach(function (reg) {
    var gate = Number(reg.gateNumber || 0);
    if (gate <= 0 || usedGates[gate]) {
      throw apiError("Cổng xuất phát phải được gán đầy đủ và không trùng nhau", 422);
    }
    usedGates[gate] = true;
  });

  var performance = await getPerformanceMaps(raceId);
  var input = registrations.map(function (reg) {
    var horseStats = performance.horses[String(reg.horseId)] || emptyStats();
    var jockeyStats = performance.jockeys[String(reg.jockeyId || "")] || emptyStats();
    return {
      participantId: reg._id,
      horseId: reg.horseId,
      horseName: reg.horseName,
      jockeyId: reg.jockeyId || null,
      jockeyName: reg.jockeyName || "",
      gateNumber: Number(reg.gateNumber || 0),
      horseStarts: horseStats.starts,
      horseWins: horseStats.wins,
      horseWinRate: horseStats.winRate,
      jockeyStarts: jockeyStats.starts,
      jockeyWins: jockeyStats.wins,
      jockeyWinRate: jockeyStats.winRate,
    };
  });
  var seed = crypto.randomBytes(24).toString("hex");
  var runId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
  var generatedAt = new Date();
  var participants = runSimulation(input, seed, ctx.race.distance);
  var simulation = {
    status: "GENERATED",
    runId: runId,
    algorithmVersion: "v1",
    seed: seed,
    historyWeight: 0.5,
    luckWeight: 0.5,
    generatedAt: generatedAt,
    generatedBy: refereeId,
    playbackDurationMs: PLAYBACK_DURATION_MS,
    playbackEndsAt: new Date(generatedAt.getTime() + PLAYBACK_DURATION_MS),
    participants: participants,
  };

  await closeBetting(raceId);
  var result = await Tournament.updateOne(
    {
      _id: ctx.tournament._id,
      races: {
        $elemMatch: {
          _id: ctx.race._id,
          $or: [
            { "simulation.status": { $exists: false } },
            { "simulation.status": "NOT_STARTED" },
            { "simulation.runId": null },
          ],
        },
      },
    },
    { $set: { "races.$[race].simulation": simulation } },
    { arrayFilters: [{ "race._id": ctx.race._id }] },
  ).exec();

  if (!result.modifiedCount) {
    var concurrent = await findRaceContext(raceId, { repair: false });
    var concurrentSimulation = concurrent && mapSimulation(concurrent.race);
    if (concurrentSimulation) return concurrentSimulation;
    throw apiError("Không thể tạo mô phỏng do dữ liệu đã thay đổi", 409);
  }
  var saved = await findRaceContext(raceId, { repair: false });
  return mapSimulation(saved.race);
}

async function get(raceId) {
  var ctx = await findRaceContext(raceId, { repair: false });
  if (!ctx) throw apiError("Không tìm thấy cuộc đua", 404);
  return mapSimulation(ctx.race);
}

async function confirm(raceId, refereeId, runId) {
  var ctx = await findRaceContext(raceId, { repair: false });
  if (!ctx) throw apiError("Không tìm thấy cuộc đua", 404);
  assertOwnRace(ctx, refereeId);
  var simulation = ctx.race.simulation;
  if (!simulation || simulation.status !== "GENERATED") {
    throw apiError("Cuộc đua chưa có mô phỏng để xác nhận", 409);
  }
  if (!runId || String(simulation.runId) !== String(runId)) {
    throw apiError("Phiên mô phỏng không hợp lệ", 409);
  }
  if (simulation.playbackEndsAt && Date.now() < new Date(simulation.playbackEndsAt).getTime()) {
    throw apiError("Vui lòng chờ mô phỏng kết thúc trước khi xác nhận", 409);
  }
  if (tm.toRaceStatusCode(ctx.race.status) !== "ONGOING") {
    throw apiError("Cuộc đua không còn ở trạng thái đang diễn ra", 409);
  }

  var claim = await Tournament.updateOne(
    {
      _id: ctx.tournament._id,
      races: {
        $elemMatch: {
          _id: ctx.race._id,
          "simulation.status": "GENERATED",
          "simulation.runId": String(runId),
        },
      },
    },
    { $set: { "races.$[race].simulation.status": "CONFIRMING" } },
    {
      arrayFilters: [{
        "race._id": ctx.race._id,
        "race.simulation.status": "GENERATED",
        "race.simulation.runId": String(runId),
      }],
    },
  ).exec();
  if (!claim.modifiedCount) {
    throw apiError("Kết quả mô phỏng đang được xác nhận hoặc đã xác nhận", 409);
  }
  ctx = await findRaceContext(raceId, { repair: false });
  simulation = ctx.race.simulation;

  var savedResults = (simulation.participants || []).map(function (item) {
    var reg = ctx.tournament.registrations.id(item.participantId);
    if (!reg || String(reg.raceId) !== String(ctx.race._id)) {
      throw apiError("Dữ liệu ngựa tham gia đã thay đổi", 409);
    }
    reg.participantStatus = "FINISHED";
    reg.status = "Hoàn thành";
    return {
      position: item.rank,
      horseId: item.horseId,
      horseName: item.horseName,
      participantId: item.participantId,
      jockeyId: item.jockeyId || null,
      jockeyName: item.jockeyName || "",
      time: String(item.finishTimeMillis),
      points: 0,
      notes: "",
      source: "SIMULATION",
      simulationRunId: simulation.runId,
    };
  }).sort(function (a, b) { return a.position - b.position; });

  ctx.race.results = savedResults;
  ctx.race.status = "Hoàn thành";
  ctx.race.resultFinalizedAt = new Date();
  simulation.status = "CONFIRMED";
  simulation.confirmedAt = new Date();
  simulation.confirmedBy = refereeId;

  var shouldPayReferee =
    ctx.race.refereePaymentStatus === "HELD" && Number(ctx.race.refereePaymentAmount || 0) > 0;
  await ctx.tournament.save();

  if (shouldPayReferee) {
    await payReferee(ctx.race.refereeId, ctx.race.refereePaymentAmount, {
      referenceType: "RACE",
      referenceId: String(ctx.race._id),
      description: "Thù lao trọng tài - " + (ctx.race.name || ""),
    });
    ctx.race.refereePaymentStatus = "PAID";
    await ctx.tournament.save();
  }

  await Promise.allSettled(savedResults.map(function (row) {
    return Horse.findByIdAndUpdate(row.horseId, {
      $inc: { races: 1, wins: row.position === 1 ? 1 : 0 },
    }).exec();
  }));

  return savedResults.map(function (row) {
    return {
      participantId: String(row.participantId),
      horseName: row.horseName,
      jockeyUsername: row.jockeyName,
      rank: row.position,
      finishTimeMillis: Number(row.time),
      status: "FINISHED",
      prizeAmount: prizeAmountForRank(ctx.race, row.position),
      note: "",
      source: "SIMULATION",
      simulationRunId: row.simulationRunId,
    };
  });
}

module.exports = { generate: generate, get: get, confirm: confirm, mapSimulation: mapSimulation };
