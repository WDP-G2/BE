var mongoose = require("../db");
var User = require("../models/user");
var Horse = require("../models/horse");
var Tournament = require("../models/tournament");
var Wallet = require("../models/wallet");
var WalletTransaction = require("../models/walletTransaction");
var WithdrawalRequest = require("../models/withdrawalRequest");
var Notification = require("../models/notification");
var RaceRegistration = require("../models/raceRegistration");
var RaceParticipant = require("../models/raceParticipant");
var RaceResult = require("../models/raceResult");
var RaceComplaint = require("../models/raceComplaint");
var PaymentOrder = require("../models/paymentOrder");
var PaymentCallbackLog = require("../models/paymentCallbackLog");
var AdminWalletWithdrawal = require("../models/adminWalletWithdrawal");
var RoleApplication = require("../models/roleApplication");
var Bet = require("../models/bet");
var BetMarket = require("../models/betMarket");
var JockeyInvitation = require("../models/jockeyInvitation");
var walletService = require("./walletService");
var authService = require("./authService");

var RECENT_LIMIT = 5;
var VALID_REGISTRATION_STATUSES = ["PENDING", "APPROVED"];

function objectId(value) {
  if (!value) return null;
  if (mongoose.Types.ObjectId.isValid(value)) return new mongoose.Types.ObjectId(value);
  return null;
}

function id(value) {
  return value ? String(value._id || value.id || value) : null;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function labelMonth(date) {
  return "T" + (date.getMonth() + 1);
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function percent(numerator, denominator) {
  if (!denominator || denominator <= 0) return 0;
  return round2((numerator * 100) / denominator);
}

function growthPercent(current, previous) {
  current = Number(current) || 0;
  previous = Number(previous) || 0;
  if (previous === 0) return current === 0 ? 0 : null;
  return round2(((current - previous) * 100) / previous);
}

function countBy(items, mapper) {
  var result = {};
  (items || []).forEach(function (item) {
    var key = mapper(item) || "UNKNOWN";
    result[key] = (result[key] || 0) + 1;
  });
  return result;
}

function sumBy(items, mapper, amountMapper) {
  var result = {};
  (items || []).forEach(function (item) {
    var key = mapper(item) || "UNKNOWN";
    result[key] = round2((result[key] || 0) + (Number(amountMapper(item)) || 0));
  });
  return result;
}

function shortName(name) {
  name = String(name || "").trim();
  if (!name) return "";
  var initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map(function (word) {
      return word.charAt(0);
    })
    .join("")
    .toUpperCase();
  return (initials || name.toUpperCase()).slice(0, 5);
}

function item(type, itemId, title, status, at, metadata) {
  return {
    type: type,
    id: itemId ? String(itemId) : null,
    title: title || "",
    status: status || "",
    at: at || null,
    metadata: metadata || {},
  };
}

function addAlert(alerts, type, title, count) {
  if ((Number(count) || 0) > 0) {
    alerts.push(item(type, null, title, String(count), null));
  }
}

function link(label, enabled) {
  return {
    label: label,
    route: "/" + String(label).toLowerCase().replace(/\s+/g, "-"),
    enabled: enabled !== false,
  };
}

function links(labels) {
  return labels.map(function (label) {
    return link(label, true);
  });
}

function featureFlags() {
  return {
    betting: true,
    prediction: false,
    marketplace: false,
    refereeReports: false,
  };
}

function account(user) {
  return {
    id: id(user),
    username: user.username || (user.email ? user.email.split("@")[0] : ""),
    email: user.email || "",
    fullName: user.fullName || user.name || "",
    role: user.role || "USER",
    pendingRole: user.pendingRole || null,
    roleApprovalStatus: user.roleApprovalStatus || null,
    active: user.active !== false,
  };
}

function walletDto(wallet) {
  if (!wallet) return null;
  return {
    id: id(wallet),
    ownerType: wallet.ownerType,
    userId: wallet.userId ? String(wallet.userId) : null,
    currency: wallet.currency || "VND",
    availableBalance: Number(wallet.availableBalance) || 0,
    holdBalance: Number(wallet.holdBalance) || 0,
    totalBalance: (Number(wallet.availableBalance) || 0) + (Number(wallet.holdBalance) || 0),
    status: wallet.status || "ACTIVE",
    createdAt: wallet.createdAt,
    updatedAt: wallet.updatedAt,
  };
}

function transactionDto(transaction) {
  return {
    id: id(transaction),
    walletId: transaction.walletId ? String(transaction.walletId) : null,
    userId: transaction.userId ? String(transaction.userId) : null,
    type: transaction.type,
    direction: transaction.direction,
    amount: Number(transaction.amount) || 0,
    availableBefore: Number(transaction.availableBefore) || 0,
    availableAfter: Number(transaction.availableAfter) || 0,
    holdBefore: Number(transaction.holdBefore) || 0,
    holdAfter: Number(transaction.holdAfter) || 0,
    status: transaction.status,
    referenceType: transaction.referenceType || "",
    referenceId: transaction.referenceId || "",
    idempotencyKey: transaction.idempotencyKey || "",
    metadata: transaction.metadata || "",
    note: transaction.note || "",
    createdAt: transaction.createdAt,
  };
}

function notificationDto(notification) {
  return {
    id: id(notification),
    recipientId: notification.recipientId ? String(notification.recipientId) : null,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    referenceType: notification.referenceType,
    referenceId: notification.referenceId,
    metadataJson: notification.metadataJson || "",
    readAt: notification.readAt || null,
    createdAt: notification.createdAt,
  };
}

function raceDto(tournament, race) {
  if (!race) return null;
  return {
    id: id(race),
    tournamentId: tournament ? id(tournament) : null,
    name: race.name || "",
    distance: race.distance || 0,
    scheduledStartAt: race.scheduledAt || null,
    scheduledAt: race.scheduledAt || null,
    scheduledEndAt: null,
    minParticipants: race.minHorses || 0,
    maxParticipants: race.maxHorses || 0,
    entryFee: race.entryFee || 0,
    refereeId: race.refereeId ? String(race.refereeId) : null,
    status: race.status || "",
    note: race.description || "",
    resultFinalizedAt: race.resultFinalizedAt || null,
    participantCount: 0,
    createdAt: tournament ? tournament.createdAt : null,
    updatedAt: tournament ? tournament.updatedAt : null,
  };
}

async function raceDtosForQuery(predicate) {
  var tournaments = await Tournament.find({}).sort({ startDate: 1, createdAt: -1 }).exec();
  var races = [];
  tournaments.forEach(function (tournament) {
    (tournament.races || []).forEach(function (race) {
      if (!predicate || predicate(tournament, race)) {
        races.push(raceDto(tournament, race));
      }
    });
  });
  return races.sort(function (a, b) {
    return new Date(a.scheduledStartAt || 0) - new Date(b.scheduledStartAt || 0);
  });
}

function upcomingItems(races) {
  var now = Date.now();
  return (races || [])
    .filter(function (race) {
      return race.scheduledStartAt && new Date(race.scheduledStartAt).getTime() >= now;
    })
    .sort(function (a, b) {
      return new Date(a.scheduledStartAt) - new Date(b.scheduledStartAt);
    })
    .slice(0, RECENT_LIMIT)
    .map(function (race) {
      return item("RACE", race.id, race.name, race.status, race.scheduledStartAt);
    });
}

async function getWalletFor(user, admin) {
  return admin ? walletService.getOrCreateAdminWallet() : walletService.getOrCreateUserWallet(user._id);
}

async function transactionSums(walletId, directions) {
  var rows = await WalletTransaction.aggregate([
    { $match: { walletId: objectId(walletId), direction: { $in: directions }, status: "SUCCESS" } },
    { $group: { _id: "$type", amount: { $sum: "$amount" } } },
  ]).exec();
  var result = {};
  rows.forEach(function (row) {
    result[row._id] = round2(row.amount);
  });
  return result;
}

async function withdrawalSummary(match) {
  var rows = await WithdrawalRequest.aggregate([
    { $match: match || {} },
    { $group: { _id: "$status", count: { $sum: 1 }, amount: { $sum: "$amount" } } },
  ]).exec();
  var result = { total: 0, countByStatus: {}, amountByStatus: {} };
  rows.forEach(function (row) {
    result.total += row.count;
    result.countByStatus[row._id] = row.count;
    result.amountByStatus[row._id] = round2(row.amount);
  });
  return result;
}

async function buildDashboard(user, businessSummary, alerts, quickLinks, upcoming, admin) {
  var wallet = await getWalletFor(user, admin);
  var walletId = wallet._id;
  var transactions = await WalletTransaction.find({ walletId: walletId }).sort({ createdAt: -1 }).limit(RECENT_LIMIT).exec();
  var notifications = await Notification.find({ recipientId: user._id }).sort({ createdAt: -1 }).limit(RECENT_LIMIT).exec();
  return {
    role: user.role || "USER",
    account: account(user),
    wallet: walletDto(wallet),
    moneyIn: await transactionSums(walletId, ["CREDIT"]),
    moneyOut: await transactionSums(walletId, ["DEBIT", "CAPTURE"]),
    hold: await transactionSums(walletId, ["HOLD"]),
    withdrawals: await withdrawalSummary(admin ? {} : { userId: user._id }),
    recentTransactions: transactions.map(transactionDto),
    recentNotifications: notifications.map(notificationDto),
    businessSummary: businessSummary || {},
    alerts: alerts || [],
    upcoming: upcoming || [],
    quickLinks: quickLinks || [],
    featureFlags: featureFlags(),
  };
}

async function requireCurrentUser(req) {
  var user = await authService.currentUser(req);
  if (user && user._id) return user;
  var fallback = await User.findOne({}).sort({ createdAt: 1 }).exec();
  if (fallback) return fallback;
  var err = new Error("Unauthorized");
  err.status = 401;
  throw err;
}

async function requireRole(req, role) {
  var user = await requireCurrentUser(req);
  if (String(user.role || "").toUpperCase() !== role) {
    var err = new Error("Dashboard requires " + role + " role");
    err.status = 400;
    throw err;
  }
  return user;
}

async function getCurrentUserDashboard(req) {
  var user = await requireCurrentUser(req);
  return buildDashboard(
    user,
    {
      roleApprovalStatus: user.roleApprovalStatus || null,
      pendingRole: user.pendingRole || null,
      roleReviewReason: user.roleReviewReason || null,
    },
    [],
    links(["Choose Role", "Profile", "Wallet", "Notifications"]),
    [],
    false,
  );
}

async function getOwnerRacesForUser(userId) {
  var registrations = await RaceRegistration.find({ ownerId: userId }).sort({ createdAt: -1 }).exec();
  var raceIds = {};
  registrations.forEach(function (registration) {
    raceIds[String(registration.raceId)] = true;
  });
  return raceDtosForQuery(function (_tournament, race) {
    return raceIds[String(race._id)] === true;
  });
}

async function getJockeyRacesForUser(userId) {
  var registrations = await RaceRegistration.find({ jockeyId: userId }).sort({ createdAt: -1 }).exec();
  var raceIds = {};
  registrations.forEach(function (registration) {
    raceIds[String(registration.raceId)] = true;
  });
  return raceDtosForQuery(function (_tournament, race) {
    return raceIds[String(race._id)] === true;
  });
}

async function getOwnerDashboard(req) {
  var user = await requireRole(req, "OWNER");
  var horses = await Horse.find({ createdBy: user._id }).sort({ createdAt: -1 }).exec();
  var registrations = await RaceRegistration.find({ ownerId: user._id }).sort({ createdAt: -1 }).exec();
  var races = await getOwnerRacesForUser(user._id);
  var invites = await JockeyInvitation.find({ ownerId: user._id }).exec();
  var alerts = [];
  addAlert(alerts, "HORSE_PENDING", "Horses pending review", countBy(horses, function (h) { return h.status || h.racingStatus; }).PENDING || 0);
  addAlert(alerts, "REGISTRATION_PENDING", "Race registrations pending review", countBy(registrations, function (r) { return r.status; }).PENDING || 0);
  return buildDashboard(
    user,
    {
      horseCount: horses.length,
      horsesByStatus: countBy(horses, function (horse) { return horse.status || horse.racingStatus || "ACTIVE"; }),
      registrationsByStatus: countBy(registrations, function (registration) { return registration.status; }),
      jockeyInvitationsByStatus: countBy(invites, function (invite) { return invite.status; }),
      acceptedJockeyCount: 0,
      upcomingRaceCount: upcomingItems(races).length,
      openTournamentCount: await Tournament.countDocuments({ status: "Đang mở đăng ký" }).exec(),
    },
    alerts,
    links(["Horses", "Jockeys", "Tournaments", "Registrations", "My Races", "Wallet", "Prizes", "Notifications", "Profile"]),
    upcomingItems(races),
    false,
  );
}

async function getJockeyPerformanceForUser(userId) {
  var races = await getJockeyRacesForUser(userId);
  var results = await RaceResult.find({ jockeyId: userId }).exec();
  var transactions = await WalletTransaction.find({ userId: userId, type: { $in: ["PRIZE", "PAYOUT"] }, status: "SUCCESS" }).exec();
  return {
    jockeyId: String(userId),
    raceCount: races.length,
    completedRaceCount: results.filter(function (result) { return result.status === "FINISHED"; }).length,
    firstPlaces: results.filter(function (result) { return result.rank === 1; }).length,
    secondPlaces: results.filter(function (result) { return result.rank === 2; }).length,
    thirdPlaces: results.filter(function (result) { return result.rank === 3; }).length,
    totalJockeyPayout: round2(transactions.filter(function (tx) { return tx.type === "PAYOUT"; }).reduce(function (sum, tx) { return sum + (tx.amount || 0); }, 0)),
    totalPrizePayout: round2(transactions.filter(function (tx) { return tx.type === "PRIZE"; }).reduce(function (sum, tx) { return sum + (tx.amount || 0); }, 0)),
    recentRaces: races.slice(0, RECENT_LIMIT),
  };
}

async function getJockeyDashboard(req) {
  var user = await requireRole(req, "JOCKEY");
  var invitations = await JockeyInvitation.find({ jockeyId: user._id }).sort({ createdAt: -1 }).exec();
  var performance = await getJockeyPerformanceForUser(user._id);
  var alerts = [];
  addAlert(alerts, "JOCKEY_INVITATION_PENDING", "New invitations waiting for response", countBy(invitations, function (i) { return i.status; }).PENDING || 0);
  return buildDashboard(
    user,
    {
      profileStatus: "APPROVED",
      invitationsByStatus: countBy(invitations, function (invitation) { return invitation.status; }),
      raceCount: performance.raceCount,
      completedRaceCount: performance.completedRaceCount,
      firstPlaces: performance.firstPlaces,
      secondPlaces: performance.secondPlaces,
      thirdPlaces: performance.thirdPlaces,
      totalJockeyPayout: performance.totalJockeyPayout,
      totalPrizePayout: performance.totalPrizePayout,
    },
    alerts,
    links(["Profile", "Invitations", "My Races", "Performance", "Wallet", "Notifications"]),
    upcomingItems(performance.recentRaces),
    false,
  );
}

async function refereeRacesForUser(userId, onlyToday) {
  var today = new Date();
  var start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  var end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  return raceDtosForQuery(function (_tournament, race) {
    if (String(race.refereeId || "") !== String(userId)) return false;
    if (!onlyToday) return true;
    var at = race.scheduledAt ? new Date(race.scheduledAt) : null;
    return at && at >= start && at < end;
  });
}

async function getRefereeDashboard(req) {
  var user = await requireRole(req, "REFEREE");
  var races = await refereeRacesForUser(user._id, false);
  var todayRaces = await refereeRacesForUser(user._id, true);
  var alerts = [];
  addAlert(alerts, "REFEREE_CHECK_IN", "Races ready for check-in", races.filter(function (race) { return race.status === "Sắp chạy"; }).length);
  addAlert(alerts, "REFEREE_RESULT_ENTRY", "Races waiting for result entry", races.filter(function (race) { return race.status === "Đang chạy"; }).length);
  return buildDashboard(
    user,
    {
      racesByStatus: countBy(races, function (race) { return race.status; }),
      todayRaceCount: todayRaces.length,
      upcomingRaceCount: upcomingItems(races).length,
      checkInRaceCount: races.filter(function (race) { return race.status === "Sắp chạy"; }).length,
      resultEntryRaceCount: races.filter(function (race) { return race.status === "Đang chạy"; }).length,
    },
    alerts,
    links(["Assigned Races", "Check-in", "Results", "Reports", "Notifications", "Wallet"]),
    upcomingItems(races),
    false,
  );
}

async function getSpectatorDashboard(req) {
  var user = await requireRole(req, "SPECTATOR");
  var markets = await BetMarket.find({ status: "OPEN" }).sort({ createdAt: -1 }).limit(RECENT_LIMIT).exec();
  var bets = await Bet.find({ userId: user._id }).exec();
  return buildDashboard(
    user,
    {
      openTournamentCount: await Tournament.countDocuments({ status: "Đang mở đăng ký" }).exec(),
      openBetMarketCount: await BetMarket.countDocuments({ status: "OPEN" }).exec(),
      betsByStatus: countBy(bets, function (bet) { return bet.status; }),
      totalBetStake: round2(bets.reduce(function (sum, bet) { return sum + (bet.stakeAmount || bet.stake || 0); }, 0)),
      totalBetPayout: round2(bets.reduce(function (sum, bet) { return sum + (bet.netProfitAmount || bet.payoutAmount || 0); }, 0)),
      predictionEnabled: false,
      marketplaceEnabled: false,
    },
    [],
    [link("Tournaments", true), link("Races", true), link("Betting", true), link("Leaderboard", true), link("Wallet", true), link("Notifications", true), link("Predictions", false), link("Shop", false), link("Inventory", false)],
    markets.map(function (market) {
      return item("BET_MARKET", market._id, market.raceName || market.name || "Bet market", market.status, market.closesAt || market.createdAt);
    }),
    false,
  );
}

async function getAdminDashboard(req) {
  var user = await requireRole(req, "ADMIN");
  var today = new Date();
  var todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  var tomorrowStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  var races = await raceDtosForQuery();
  var users = await User.find({}).exec();
  var alerts = [];
  var pendingRoles = await RoleApplication.countDocuments({ status: "PENDING" }).exec();
  var pendingHorses = await Horse.countDocuments({ status: "PENDING" }).exec();
  var pendingWithdrawals = await WithdrawalRequest.countDocuments({ status: "PENDING" }).exec();
  addAlert(alerts, "ROLE_APPLICATION_PENDING", "Role applications pending review", pendingRoles);
  addAlert(alerts, "HORSE_PENDING", "Horses pending review", pendingHorses);
  addAlert(alerts, "WITHDRAWAL_PENDING", "Withdrawals pending review", pendingWithdrawals);
  return buildDashboard(
    user,
    {
      usersByRole: countBy(users, function (u) { return u.role || "USER"; }),
      activeUserCount: users.filter(function (u) { return u.active !== false; }).length,
      deactivatedUserCount: users.filter(function (u) { return u.active === false; }).length,
      pendingRoleApplicationCount: pendingRoles,
      pendingHorseCount: pendingHorses,
      pendingJockeyProfileCount: 0,
      openTournamentCount: await Tournament.countDocuments({ status: "Đang mở đăng ký" }).exec(),
      ongoingTournamentCount: await Tournament.countDocuments({ status: "Đang diễn ra" }).exec(),
      pendingWithdrawalCount: pendingWithdrawals,
      todayRaceCount: races.filter(function (race) {
        var at = race.scheduledStartAt ? new Date(race.scheduledStartAt) : null;
        return at && at >= todayStart && at < tomorrowStart;
      }).length,
      pendingComplaintCount: await RaceComplaint.countDocuments({ status: "PENDING" }).exec(),
      paymentOrdersByStatus: countBy(await PaymentOrder.find({}).exec(), function (order) { return order.status; }),
      paymentCallbackLogCount: await PaymentCallbackLog.countDocuments({}).exec(),
      adminWalletWithdrawalCount: await AdminWalletWithdrawal.countDocuments({}).exec(),
    },
    alerts,
    links(["Users", "Role Applications", "Horse Approval", "Jockey Approval", "Tournaments", "Registrations", "Races", "Results", "Finance", "Betting", "Notifications", "Audit Logs", "Settings"]),
    upcomingItems(races),
    true,
  );
}

async function adminRevenueBetween(from, to) {
  var adminWallets = await Wallet.find({ ownerType: "ADMIN" }).select("_id").exec();
  var walletIds = adminWallets.map(function (wallet) { return wallet._id; });
  if (!walletIds.length) return 0;
  var rows = await WalletTransaction.aggregate([
    { $match: { walletId: { $in: walletIds }, direction: "CREDIT", status: "SUCCESS", createdAt: { $gte: from, $lt: to } } },
    { $group: { _id: null, amount: { $sum: "$amount" } } },
  ]).exec();
  return rows[0] ? round2(rows[0].amount) : 0;
}

async function adminRevenueTotal() {
  return adminRevenueBetween(new Date(1970, 0, 1), new Date(9999, 11, 31));
}

async function getAdminDashboardSummary() {
  var current = startOfMonth(new Date());
  var previous = addMonths(current, -1);
  var next = addMonths(current, 1);
  var tournaments = await Tournament.find({ status: { $ne: "Đã hủy" } }).exec();
  var races = [];
  tournaments.forEach(function (tournament) {
    (tournament.races || []).forEach(function (race) {
      if (race.status !== "Đã hủy") races.push({ race: race, tournament: tournament });
    });
  });
  var registrationCount = await RaceRegistration.countDocuments({ status: { $in: VALID_REGISTRATION_STATUSES } }).exec();
  var activeUserCount = await User.countDocuments({ active: { $ne: false }, role: { $ne: "ADMIN" } }).exec();
  var revenue = await adminRevenueTotal();
  return {
    tournamentCount: tournaments.length,
    raceCount: races.length,
    registrationCount: registrationCount,
    revenue: revenue,
    tournament: {
      value: tournaments.length,
      growthPercent: growthPercent(
        tournaments.filter(function (t) { return t.createdAt >= current && t.createdAt < next; }).length,
        tournaments.filter(function (t) { return t.createdAt >= previous && t.createdAt < current; }).length,
      ),
    },
    race: {
      value: races.length,
      growthPercent: growthPercent(
        races.filter(function (r) { return r.tournament.createdAt >= current && r.tournament.createdAt < next; }).length,
        races.filter(function (r) { return r.tournament.createdAt >= previous && r.tournament.createdAt < current; }).length,
      ),
    },
    activeUser: {
      value: activeUserCount,
      growthPercent: growthPercent(
        await User.countDocuments({ active: { $ne: false }, role: { $ne: "ADMIN" }, createdAt: { $gte: current, $lt: next } }).exec(),
        await User.countDocuments({ active: { $ne: false }, role: { $ne: "ADMIN" }, createdAt: { $gte: previous, $lt: current } }).exec(),
      ),
    },
    revenueMetric: {
      value: revenue,
      growthPercent: growthPercent(await adminRevenueBetween(current, next), await adminRevenueBetween(previous, current)),
    },
  };
}

async function getAdminDashboardRevenue(months) {
  months = Number(months || 6);
  if (months < 1 || months > 24) {
    var err = new Error("months must be between 1 and 24");
    err.status = 400;
    throw err;
  }
  var current = startOfMonth(new Date());
  var first = addMonths(current, -(months - 1));
  var previousFirst = addMonths(first, -1);
  var adminWallets = await Wallet.find({ ownerType: "ADMIN" }).select("_id").exec();
  var walletIds = adminWallets.map(function (wallet) { return wallet._id; });
  var rows = walletIds.length
    ? await WalletTransaction.aggregate([
        { $match: { walletId: { $in: walletIds }, direction: "CREDIT", status: "SUCCESS", createdAt: { $gte: previousFirst, $lt: addMonths(current, 1) } } },
        { $group: { _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } }, amount: { $sum: "$amount" } } },
      ]).exec()
    : [];
  var byKey = {};
  rows.forEach(function (row) {
    byKey[row._id.year + "-" + row._id.month] = round2(row.amount);
  });
  var response = [];
  for (var offset = 0; offset < months; offset += 1) {
    var monthDate = addMonths(first, offset);
    var key = monthDate.getFullYear() + "-" + (monthDate.getMonth() + 1);
    var previousKey = addMonths(monthDate, -1).getFullYear() + "-" + (addMonths(monthDate, -1).getMonth() + 1);
    var amount = byKey[key] || 0;
    response.push({
      year: monthDate.getFullYear(),
      month: monthDate.getMonth() + 1,
      label: labelMonth(monthDate),
      amount: amount,
      growthPercent: offset === months - 1 ? growthPercent(amount, byKey[previousKey] || 0) : null,
    });
  }
  return response;
}

async function tournamentRegistrationSummaries() {
  var tournaments = await Tournament.find({}).sort({ createdAt: -1 }).exec();
  var rows = await RaceRegistration.aggregate([
    { $match: { status: { $in: VALID_REGISTRATION_STATUSES } } },
    { $group: { _id: "$tournamentId", count: { $sum: 1 } } },
  ]).exec();
  var byTournament = {};
  rows.forEach(function (row) {
    byTournament[String(row._id)] = row.count;
  });
  return tournaments
    .map(function (tournament) {
      var raceCount = (tournament.races || []).length;
      var capacity = (tournament.races || []).reduce(function (sum, race) {
        return sum + (Number(race.maxHorses) || 0);
      }, 0);
      var registrations = byTournament[String(tournament._id)] || 0;
      return {
        tournamentId: id(tournament),
        tournamentName: tournament.name,
        raceCount: raceCount,
        registrationCount: registrations,
        capacity: capacity,
        fillRate: percent(registrations, capacity),
      };
    })
    .sort(function (a, b) {
      return b.registrationCount - a.registrationCount || String(a.tournamentId).localeCompare(String(b.tournamentId));
    });
}

async function getAdminTopHorses(limit) {
  limit = Number(limit || 5);
  if (limit < 1 || limit > 20) {
    var err = new Error("limit must be between 1 and 20");
    err.status = 400;
    throw err;
  }
  var rows = await RaceResult.aggregate([
    { $match: { status: "FINISHED" } },
    { $group: { _id: "$horseId", winCount: { $sum: { $cond: [{ $eq: ["$rank", 1] }, 1, 0] } }, totalPrizeAmount: { $sum: "$prizeAmount" }, ownerId: { $first: "$ownerId" } } },
    { $sort: { winCount: -1, totalPrizeAmount: -1 } },
    { $limit: limit },
  ]).exec();
  var horseIds = rows.map(function (row) { return row._id; });
  var ownerIds = rows.map(function (row) { return row.ownerId; });
  var horses = await Horse.find({ _id: { $in: horseIds } }).exec();
  var owners = await User.find({ _id: { $in: ownerIds } }).exec();
  var horseById = {};
  var ownerById = {};
  horses.forEach(function (horse) { horseById[String(horse._id)] = horse; });
  owners.forEach(function (owner) { ownerById[String(owner._id)] = owner; });
  var previousWins = null;
  var previousPrize = null;
  var rank = 0;
  return rows.map(function (row, index) {
    if (previousWins !== row.winCount || previousPrize !== row.totalPrizeAmount) rank = index + 1;
    previousWins = row.winCount;
    previousPrize = row.totalPrizeAmount;
    var horse = horseById[String(row._id)] || {};
    var owner = ownerById[String(row.ownerId)] || {};
    return {
      rank: rank,
      horseId: String(row._id),
      horseName: horse.name || "",
      ownerId: row.ownerId ? String(row.ownerId) : null,
      ownerName: owner.fullName || owner.name || owner.username || "",
      winCount: row.winCount,
      totalPrizeAmount: round2(row.totalPrizeAmount),
    };
  });
}

async function getAdminQuickInsights(months) {
  months = Number(months || 6);
  if (months < 1 || months > 24) {
    var err = new Error("months must be between 1 and 24");
    err.status = 400;
    throw err;
  }
  var insights = [];
  var tournaments = await tournamentRegistrationSummaries();
  var totalCapacity = tournaments.reduce(function (sum, tournament) { return sum + tournament.capacity; }, 0);
  var totalRegistrations = tournaments.reduce(function (sum, tournament) { return sum + tournament.registrationCount; }, 0);
  if (totalCapacity > 0) {
    var fillRate = percent(totalRegistrations, totalCapacity);
    insights.push({
      code: "AVERAGE_FILL_RATE",
      message: "Ty le lap day dang ky trung binh dat " + fillRate + "%.",
      value: fillRate,
      unit: "PERCENT",
      metadata: { registrationCount: totalRegistrations, capacity: totalCapacity },
    });
  }
  if (tournaments[0] && tournaments[0].registrationCount > 0) {
    insights.push({
      code: "TOP_TOURNAMENT_REGISTRATIONS",
      message: tournaments[0].tournamentName + " co so dang ky cao nhat.",
      value: tournaments[0].registrationCount,
      unit: "COUNT",
      metadata: { tournamentId: tournaments[0].tournamentId, tournamentName: tournaments[0].tournamentName },
    });
  }
  var totalPrizeRows = await RaceResult.aggregate([{ $group: { _id: null, total: { $sum: "$prizeAmount" } } }]).exec();
  var totalPrize = totalPrizeRows[0] ? totalPrizeRows[0].total : 0;
  if (totalPrize > 0) {
    var topThree = await getAdminTopHorses(3);
    var topThreePrize = topThree.reduce(function (sum, horse) { return sum + horse.totalPrizeAmount; }, 0);
    if (topThree.length === 3 && topThreePrize > 0) {
      var share = percent(topThreePrize, totalPrize);
      insights.push({
        code: "TOP_THREE_HORSE_PRIZE_SHARE",
        message: "Top 3 ngua tao ra " + share + "% tong tien thuong.",
        value: share,
        unit: "PERCENT",
        metadata: { topThreePrizeAmount: topThreePrize, totalPrizeAmount: totalPrize },
      });
    }
  }
  if (months >= 2) {
    var current = startOfMonth(new Date());
    var previous = addMonths(current, -1);
    var next = addMonths(current, 1);
    var currentCount = await RaceRegistration.countDocuments({ status: { $in: VALID_REGISTRATION_STATUSES }, createdAt: { $gte: current, $lt: next } }).exec();
    var previousCount = await RaceRegistration.countDocuments({ status: { $in: VALID_REGISTRATION_STATUSES }, createdAt: { $gte: previous, $lt: current } }).exec();
    if (currentCount || previousCount) {
      insights.push({
        code: "MONTHLY_REGISTRATION_TREND",
        message: currentCount === previousCount ? "So dang ky thang nay khong doi so voi thang truoc." : "So dang ky thang nay " + (currentCount > previousCount ? "tang " : "giam ") + Math.abs(currentCount - previousCount) + " so voi thang truoc.",
        value: currentCount - previousCount,
        unit: "COUNT_CHANGE",
        metadata: { currentCount: currentCount, previousCount: previousCount },
      });
    }
  }
  return insights.slice(0, 4);
}

async function getTournamentRaceCounts(limit) {
  limit = Number(limit || 5);
  if (limit < 1 || limit > 50) {
    var err = new Error("limit must be between 1 and 50");
    err.status = 400;
    throw err;
  }
  var tournaments = await Tournament.find({}).exec();
  return tournaments
    .map(function (tournament) {
      return {
        tournamentId: id(tournament),
        tournamentName: tournament.name,
        shortName: shortName(tournament.name),
        raceCount: (tournament.races || []).length,
      };
    })
    .sort(function (a, b) {
      return b.raceCount - a.raceCount || String(a.tournamentId).localeCompare(String(b.tournamentId));
    })
    .slice(0, limit);
}

async function getFeaturedTournaments(limit) {
  limit = Number(limit || 5);
  if (limit < 1 || limit > 10) {
    var err = new Error("limit must be between 1 and 10");
    err.status = 400;
    throw err;
  }
  var summaries = await tournamentRegistrationSummaries();
  var registrationByTournament = {};
  summaries.forEach(function (summary) {
    registrationByTournament[summary.tournamentId] = summary.registrationCount;
  });
  var now = Date.now();
  var tournaments = await Tournament.find({}).exec();
  return tournaments
    .map(function (tournament) {
      return {
        tournamentId: id(tournament),
        name: tournament.name,
        bannerUrl: tournament.banner || "",
        startAt: tournament.startDate || null,
        status: tournament.status,
        raceCount: (tournament.races || []).length,
        registrationCount: registrationByTournament[id(tournament)] || 0,
      };
    })
    .sort(function (a, b) {
      var distanceA = a.startAt ? Math.abs(new Date(a.startAt).getTime() - now) : Number.MAX_SAFE_INTEGER;
      var distanceB = b.startAt ? Math.abs(new Date(b.startAt).getTime() - now) : Number.MAX_SAFE_INTEGER;
      return b.registrationCount - a.registrationCount || distanceA - distanceB || String(a.tournamentId).localeCompare(String(b.tournamentId));
    })
    .slice(0, limit);
}

async function ownerPrizes(req) {
  var user = await requireRole(req, "OWNER");
  var wallet = await walletService.getOrCreateUserWallet(user._id);
  var transactions = await WalletTransaction.find({ walletId: wallet._id, type: "PRIZE" }).sort({ createdAt: -1 }).exec();
  return transactions.map(transactionDto);
}

async function jockeyPrizes(req) {
  var user = await requireRole(req, "JOCKEY");
  var wallet = await walletService.getOrCreateUserWallet(user._id);
  var transactions = await WalletTransaction.find({ walletId: wallet._id, type: { $in: ["PRIZE", "PAYOUT"] } }).sort({ createdAt: -1 }).exec();
  return transactions.map(transactionDto);
}

async function refereeCheckedInCount(req) {
  var user = await requireRole(req, "REFEREE");
  var races = await refereeRacesForUser(user._id, false);
  var raceIds = races.map(function (race) { return objectId(race.id); }).filter(Boolean);
  return { count: await RaceParticipant.countDocuments({ raceId: { $in: raceIds }, status: "CHECKED_IN" }).exec() };
}

async function refereePendingCheckInCount(req) {
  var user = await requireRole(req, "REFEREE");
  var races = await refereeRacesForUser(user._id, false);
  var raceIds = races.map(function (race) { return objectId(race.id); }).filter(Boolean);
  return { count: await RaceParticipant.countDocuments({ raceId: { $in: raceIds }, status: "REGISTERED" }).exec() };
}

async function getAdminRaces(query) {
  var from = query && query.from ? new Date(query.from) : new Date(1970, 0, 1);
  var to = query && query.to ? new Date(query.to) : new Date(9999, 11, 31);
  var status = query && query.status ? String(query.status) : "";
  var races = await raceDtosForQuery(function (_tournament, race) {
    var at = race.scheduledAt ? new Date(race.scheduledAt) : null;
    if (at && (at < from || at > to)) return false;
    return !status || race.status === status;
  });
  return races.slice(0, 200);
}

module.exports = {
  getAdminDashboard: getAdminDashboard,
  getAdminDashboardRevenue: getAdminDashboardRevenue,
  getAdminRaces: getAdminRaces,
  getAdminDashboardSummary: getAdminDashboardSummary,
  getAdminQuickInsights: getAdminQuickInsights,
  getAdminTopHorses: getAdminTopHorses,
  getCurrentUserDashboard: getCurrentUserDashboard,
  getFeaturedTournaments: getFeaturedTournaments,
  getJockeyDashboard: getJockeyDashboard,
  getJockeyPerformanceForUser: getJockeyPerformanceForUser,
  getJockeyRacesForUser: getJockeyRacesForUser,
  getOwnerDashboard: getOwnerDashboard,
  getOwnerRacesForUser: getOwnerRacesForUser,
  getRefereeDashboard: getRefereeDashboard,
  getSpectatorDashboard: getSpectatorDashboard,
  getTournamentRaceCounts: getTournamentRaceCounts,
  jockeyPrizes: jockeyPrizes,
  ownerPrizes: ownerPrizes,
  refereeCheckedInCount: refereeCheckedInCount,
  refereePendingCheckInCount: refereePendingCheckInCount,
  refereeRacesForUser: refereeRacesForUser,
  requireRole: requireRole,
  tournamentRegistrationSummaries: tournamentRegistrationSummaries,
};
