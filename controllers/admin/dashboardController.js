var Tournament = require("../../models/tournament");
var User = require("../../models/user");
var Horse = require("../../models/horse");
var { Wallet, WalletTransaction } = require("../../models/wallet");
var { apiSuccess } = require("../../utils/apiResponse");

var PAID_REGISTRATION_STATUSES = ["Đã duyệt", "Hoàn thành", "Đang chạy"];

function findRaceInTournament(tournament, raceId) {
  if (!raceId || !tournament || !tournament.races || !tournament.races.id) return null;
  return tournament.races.id(raceId);
}

function sumEntryFeeRevenue(tournaments) {
  var total = 0;
  tournaments.forEach(function (t) {
    (t.registrations || []).forEach(function (reg) {
      if (!PAID_REGISTRATION_STATUSES.includes(reg.status)) return;
      if (reg.paymentStatus && reg.paymentStatus !== "CHARGED" && reg.paymentStatus !== "FORFEITED") return;
      var race = findRaceInTournament(t, reg.raceId);
      total += Number(reg.entryFeeAmount != null ? reg.entryFeeAmount : race?.entryFee || 0);
    });
  });
  return total;
}

function buildEntryFeeRevenueByMonth(tournaments, months, now) {
  var rows = [];
  var bucketMap = {};

  for (var i = months - 1; i >= 0; i -= 1) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    var key = d.getFullYear() + "-" + d.getMonth();
    var row = { month: "T" + (d.getMonth() + 1), value: 0 };
    bucketMap[key] = row;
    rows.push(row);
  }

  tournaments.forEach(function (t) {
    (t.registrations || []).forEach(function (reg) {
      if (!PAID_REGISTRATION_STATUSES.includes(reg.status)) return;
      var race = findRaceInTournament(t, reg.raceId);
      var fee = Number(reg.entryFeeAmount != null ? reg.entryFeeAmount : race?.entryFee || 0);
      if (!fee) return;

      var bookedAt = reg.reviewedAt || reg.registeredAt || reg.createdAt;
      if (!bookedAt) return;

      var booked = new Date(bookedAt);
      var key = booked.getFullYear() + "-" + booked.getMonth();
      if (bucketMap[key]) bucketMap[key].value += fee;
    });
  });

  return rows;
}

async function getSummary(req, res) {
  var tournaments = await Tournament.find({}).exec();
  var raceCount = 0;
  var registrationCount = 0;

  tournaments.forEach(function (t) {
    raceCount += (t.races || []).length;
    registrationCount += (t.registrations || []).length;
  });

  var entryFeeRevenue = sumEntryFeeRevenue(tournaments);

  var feeAgg = await WalletTransaction.aggregate([
    { $match: { type: { $in: ["FEE", "ENTRY_FEE"] }, amount: { $gt: 0 } } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]).exec();
  var feeRevenue = feeAgg[0]?.total || 0;
  var revenue = feeRevenue > 0 ? feeRevenue : entryFeeRevenue;

  var activeUsers = await User.countDocuments({ active: { $ne: false } }).exec();
  var balanceRows = await Wallet.aggregate([
    { $match: { status: { $in: ["ACTIVE", "FROZEN"] } } },
    { $group: { _id: "$ownerType", available: { $sum: "$availableBalance" }, hold: { $sum: "$holdBalance" } } },
  ]).exec();
  var treasury = balanceRows.find(function (row) { return row._id === "SYSTEM"; }) || { available: 0, hold: 0 };
  var liabilities = balanceRows.find(function (row) { return row._id === "USER"; }) || { available: 0, hold: 0 };

  res.json(
    apiSuccess({
      tournamentCount: tournaments.length,
      raceCount: raceCount,
      registrationCount: registrationCount,
      revenue: revenue,
      tournament: { value: tournaments.length, delta: "+0%" },
      race: { value: raceCount, delta: "+0%" },
      activeUser: { value: activeUsers, delta: "+0%" },
      revenueMetric: { value: revenue, delta: "+0%" },
      treasuryAsset: Number(treasury.available || 0) + Number(treasury.hold || 0),
      userLiability: Number(liabilities.available || 0) + Number(liabilities.hold || 0),
    }),
  );
}

async function getTournamentRegistrations(req, res) {
  var tournaments = await Tournament.find({}).sort({ updatedAt: -1 }).exec();
  var rows = [];

  tournaments.forEach(function (tournament) {
    var pending = (tournament.registrations || []).filter(function (r) {
      return r.status === "Chờ duyệt";
    }).length;
    rows.push({
      tournamentId: String(tournament._id),
      tournamentName: tournament.name,
      status: tournament.status,
      totalRegistrations: (tournament.registrations || []).length,
      pendingRegistrations: pending,
      raceCount: (tournament.races || []).length,
    });
  });

  res.json(apiSuccess(rows));
}

async function getRevenue(req, res) {
  var months = Math.max(1, Math.min(12, Number(req.query.months || 6)));
  var now = new Date();
  var startMonth = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

  var txs = await WalletTransaction.find({
    type: { $in: ["FEE", "ENTRY_FEE"] },
    amount: { $gt: 0 },
    createdAt: { $gte: startMonth },
  })
    .sort({ createdAt: 1 })
    .exec();

  var rows = [];
  for (var i = months - 1; i >= 0; i -= 1) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    var label = "T" + (d.getMonth() + 1);
    var total = txs
      .filter(function (tx) {
        var created = new Date(tx.createdAt);
        return created.getFullYear() === d.getFullYear() && created.getMonth() === d.getMonth();
      })
      .reduce(function (sum, tx) {
        return sum + Number(tx.amount || 0);
      }, 0);
    rows.push({ month: label, value: total });
  }

  var hasFeeRevenue = rows.some(function (row) {
    return row.value > 0;
  });
  if (!hasFeeRevenue) {
    var tournaments = await Tournament.find({}).exec();
    rows = buildEntryFeeRevenueByMonth(tournaments, months, now);
  }

  res.json(apiSuccess(rows));
}

async function getTopHorses(req, res) {
  var limit = Math.max(1, Math.min(20, Number(req.query.limit || 4)));
  var horses = await Horse.find({ approvalStatus: "APPROVED" })
    .sort({ wins: -1, races: -1 })
    .limit(limit)
    .exec();

  res.json(
    apiSuccess(
      horses.map(function (horse) {
        return {
          id: String(horse._id),
          name: horse.name,
          wins: horse.wins || 0,
          races: horse.races || 0,
        };
      }),
    ),
  );
}

module.exports = {
  getSummary: getSummary,
  getTournamentRegistrations: getTournamentRegistrations,
  getRevenue: getRevenue,
  getTopHorses: getTopHorses,
};
