function assertVndInteger(value, label) {
  var number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error((label || "Amount") + " must be an integer VND amount");
  return number;
}

function splitPrize(prize, jockeyPercent, hasJockey) {
  prize = assertVndInteger(prize, "Prize");
  jockeyPercent = Number(jockeyPercent);
  if (prize < 0) throw new Error("Prize cannot be negative");
  if (!Number.isFinite(jockeyPercent) || jockeyPercent < 0 || jockeyPercent > 100) throw new Error("Jockey percent must be between 0 and 100");
  var jockeyAmount = hasJockey ? Math.floor((prize * jockeyPercent) / 100) : 0;
  return { ownerAmount: prize - jockeyAmount, jockeyAmount: jockeyAmount };
}

module.exports = { assertVndInteger: assertVndInteger, splitPrize: splitPrize };
