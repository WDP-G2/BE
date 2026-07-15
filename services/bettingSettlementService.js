var { BetMarket, Bet } = require("../models/betting");
var { findRaceContext } = require("./tournamentRaceService");
var { settleBetWin, settleBetLoss, refundStake } = require("./walletLedger");
var systemSettingsService = require("./systemSettingsService");
var { apiError } = require("../utils/apiResponse");
var tm = require("../utils/tournamentMapper");
var featureFlags = require("./financialFeatureFlags");

async function settleMarket(marketId) {
  featureFlags.assertEnabled("BETTING");
  var market = await BetMarket.findById(marketId).exec();
  if (!market) throw apiError("Không tìm thấy kèo cược", 404);
  if (market.status === "SETTLED") return market;
  if (market.status === "DRAFT") throw apiError("Kèo cược chưa được mở", 400);

  if (market.status !== "SETTLING") {
    market = await BetMarket.findOneAndUpdate(
      { _id: market._id, status: { $in: ["OPEN", "CLOSED", "CANCELLED"] } },
      { $set: { status: "SETTLING", settlementStartedAt: new Date() } },
      { new: true },
    ).exec();
    if (!market) throw apiError("Kèo cược đang được xử lý bởi yêu cầu khác", 409);
  }

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

  var settingsDoc = await systemSettingsService.getSettingsDoc();
  var taxPercent = Number(
    settingsDoc.fees && settingsDoc.fees.winningTaxPercent != null ? settingsDoc.fees.winningTaxPercent : 0,
  );

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
        Object.assign({
          description: "Hoàn tiền cược - cuộc đua bị hủy",
          idempotencyKey: "bet:settle:refund:" + bet._id,
          mutateDomain: async function (session, operation) {
            var updated = await Bet.findOneAndUpdate(
              { _id: bet._id, status: { $in: ["PLACED", "LOCKED"] } },
              { $set: { status: "REFUNDED", grossProfitAmount: 0, netProfitAmount: 0, settledAt: new Date(), settlementOperationId: operation._id } },
              { new: true, session: session },
            ).exec();
            if (!updated) throw apiError("Cược đã được xử lý", 409);
          },
        }, reference),
      );
    } else if (String(bet.participantId) === winnerParticipantId) {
      var potential = Number(bet.potentialPayoutAmount || bet.stakeAmount * 2);
      var grossProfit = potential - bet.stakeAmount;
      var tax = Math.max(0, Math.round((grossProfit * taxPercent) / 100));
      var netProfit = grossProfit - tax;
      var actualPayout = bet.stakeAmount + netProfit;
      await settleBetWin(
        bet.userId,
        bet.stakeAmount,
        actualPayout,
        Object.assign({
          description: "Thắng cược " + (bet.horseName || ""),
          idempotencyKey: "bet:settle:win:" + bet._id,
          mutateDomain: async function (session, operation) {
            var updated = await Bet.findOneAndUpdate(
              { _id: bet._id, status: { $in: ["PLACED", "LOCKED"] } },
              { $set: { status: "WON", winningTaxAmount: tax, grossProfitAmount: grossProfit, netProfitAmount: netProfit, settledAt: new Date(), settlementOperationId: operation._id } },
              { new: true, session: session },
            ).exec();
            if (!updated) throw apiError("Cược đã được xử lý", 409);
          },
        }, reference),
      );
    } else {
      await settleBetLoss(
        bet.userId,
        bet.stakeAmount,
        Object.assign({
          description: "Thua cược " + (bet.horseName || ""),
          idempotencyKey: "bet:settle:loss:" + bet._id,
          mutateDomain: async function (session, operation) {
            var updated = await Bet.findOneAndUpdate(
              { _id: bet._id, status: { $in: ["PLACED", "LOCKED"] } },
              { $set: { status: "LOST", grossProfitAmount: -bet.stakeAmount, netProfitAmount: -bet.stakeAmount, settledAt: new Date(), settlementOperationId: operation._id } },
              { new: true, session: session },
            ).exec();
            if (!updated) throw apiError("Cược đã được xử lý", 409);
          },
        }, reference),
      );
    }
  }

  var remaining = await Bet.countDocuments({ marketId: market._id, status: { $in: ["PLACED", "LOCKED"] } });
  if (remaining > 0) throw apiError("Còn cược chưa được quyết toán; hãy retry", 409);
  market = await BetMarket.findOneAndUpdate(
    { _id: market._id, status: "SETTLING" },
    { $set: { status: "SETTLED", settledAt: new Date() } },
    { new: true },
  ).exec();

  return market;
}

module.exports = {
  settleMarket: settleMarket,
};
