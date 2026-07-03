function mapMarket(market) {
  return {
    id: String(market._id),
    raceId: String(market.raceId),
    raceName: market.raceName,
    tournamentId: market.tournamentId ? String(market.tournamentId) : null,
    tournamentName: market.tournamentName,
    status: market.status,
    minStake: Number(market.minStake || 0),
    maxStake: Number(market.maxStake || 0),
    note: market.note || "",
    options: market.options || [],
    openedAt: market.openedAt,
    closedAt: market.closedAt,
  };
}

function mapBet(bet) {
  return {
    id: String(bet._id),
    marketId: String(bet.marketId),
    raceId: String(bet.raceId),
    raceName: bet.raceName || "",
    tournamentId: bet.tournamentId ? String(bet.tournamentId) : null,
    tournamentName: bet.tournamentName || "",
    userId: String(bet.userId),
    username: bet.username,
    participantId: bet.participantId,
    horseId: bet.horseId,
    horseName: bet.horseName,
    stakeAmount: Number(bet.stakeAmount || 0),
    potentialPayoutAmount: Number(bet.potentialPayoutAmount || 0),
    winningTaxAmount: Number(bet.winningTaxAmount || 0),
    grossProfitAmount: Number(bet.grossProfitAmount || 0),
    netProfitAmount: Number(bet.netProfitAmount || 0),
    status: bet.status,
    placedAt: bet.placedAt,
    lockedAt: bet.lockedAt || null,
    settledAt: bet.settledAt || null,
  };
}

module.exports = {
  mapMarket: mapMarket,
  mapBet: mapBet,
};
