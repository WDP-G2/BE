var { BetMarket, Bet } = require("../models/betting");
var { findRaceContext } = require("./tournamentRaceService");
var { settleBetWin, settleBetLoss, refundStake } = require("./walletLedger");
var { apiError } = require("../utils/apiResponse");
var tm = require("../utils/tournamentMapper");

async function settleMarket(marketId) {
  var market = await BetMarket.findById(marketId).exec();
  if (!market) throw apiError("Không tìm thấy kèo cược", 404);
  if (market.status === "SETTLED") throw apiError("Kèo cược đã được chốt", 400);
  if (market.status === "DRAFT") throw apiError("Kèo cược chưa được mở", 400);

  var ctx = await findRaceContext(market.raceId);
  if (!ctx) throw apiError("Không tìm thấy cuộc đua", 404);

  var race = ctx.race;
  var raceStatusCode = tm.toRaceStatusCode(race.status);
  var isCancelled = raceStatusCode === "CANCELLED";
  var winnerResult = (race.results || []).find(function (r) {
    return Number(r.position) === 1;
  });

  if (!isCancelled && !winnerResult) {
    throw apiError("Cuộc đua chưa có kết quả để chốt cược", 400);
  }

  var winnerParticipantId = winnerResult ? String(winnerResult.participantId || "") : null;

  var bets = await Bet.find({
    marketId: market._id,
    status: { $in: ["PLACED", "LOCKED"] },
  }).exec();

  for (var i = 0; i < bets.length; i += 1) {
    var bet = bets[i];
    var reference = { referenceType: "BET", referenceId: String(bet._id) };

    if (isCancelled || !winnerParticipantId) {
      await refundStake(
        bet.userId,
        bet.stakeAmount,
        Object.assign({ description: "Hoàn tiền cược - cuộc đua bị hủy" }, reference),
      );
      bet.status = "REFUNDED";
      bet.grossProfitAmount = 0;
      bet.netProfitAmount = 0;
    } else if (String(bet.participantId) === winnerParticipantId) {
      var payout = Number(bet.potentialPayoutAmount || bet.stakeAmount * 2);
      await settleBetWin(
        bet.userId,
        bet.stakeAmount,
        payout,
        Object.assign({ description: "Thắng cược " + (bet.horseName || "") }, reference),
      );
      bet.status = "WON";
      bet.grossProfitAmount = payout - bet.stakeAmount;
      bet.netProfitAmount = bet.grossProfitAmount - Number(bet.winningTaxAmount || 0);
    } else {
      await settleBetLoss(
        bet.userId,
        bet.stakeAmount,
        Object.assign({ description: "Thua cược " + (bet.horseName || "") }, reference),
      );
      bet.status = "LOST";
      bet.grossProfitAmount = -bet.stakeAmount;
      bet.netProfitAmount = -bet.stakeAmount;
    }

    bet.settledAt = new Date();
    await bet.save();
  }

  market.status = "SETTLED";
  market.settledAt = new Date();
  await market.save();

  return market;
}

module.exports = {
  settleMarket: settleMarket,
};
