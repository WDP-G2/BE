var express = require("express");
var bcrypt = require("bcryptjs");
var jwt = require("jsonwebtoken");
var multer = require("multer");
var mongoose = require("mongoose");
var User = require("../models/user");
var Horse = require("../models/horse");
var Tournament = require("../models/tournament");
var News = require("../models/news");

var router = express.Router();
var upload = multer({ storage: multer.memoryStorage() });
var authRoutes = require("./apiV1/authRoutes");
var userRoutes = require("./apiV1/userRoutes");
var horseRoutes = require("./apiV1/horseRoutes");
var newsRoutes = require("./apiV1/newsRoutes");
var tournamentRoutes = require("./apiV1/tournamentRoutes");
var financeRoutes = require("./apiV1/financeRoutes");
var roleApplicationRoutes = require("./apiV1/roleApplicationRoutes");
var walletRoutes = require("./apiV1/walletRoutes");
var paymentRoutes = require("./apiV1/paymentRoutes");
var notificationRoutes = require("./apiV1/notificationRoutes");
var locationRoutes = require("./apiV1/locationRoutes");
var systemSettingsRoutes = require("./apiV1/systemSettingsRoutes");
var dashboardRoutes = require("./apiV1/dashboardRoutes");
var bettingRoutes = require("./apiV1/bettingRoutes");
var raceDayRoutes = require("./apiV1/raceDayRoutes");
var refereeRoutes = require("./apiV1/refereeRoutes");
var jockeyRoutes = require("./apiV1/jockeyRoutes");

router.use(authRoutes);
router.use(userRoutes);
router.use(horseRoutes);
router.use(newsRoutes);
router.use(tournamentRoutes);
router.use(financeRoutes);
router.use(roleApplicationRoutes);
router.use(walletRoutes);
router.use(paymentRoutes);
router.use(notificationRoutes);
router.use(locationRoutes);
router.use(systemSettingsRoutes);
router.use(dashboardRoutes);
router.use(bettingRoutes);
router.use(raceDayRoutes);
router.use(refereeRoutes);
router.use(jockeyRoutes);

var JWT_SECRET = process.env.JWT_SECRET || process.env.APP_JWT_SECRET || "dev-secret-change-me";
var JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

var memory = {
  roleApplications: [],
  refereeInvitations: [],
  refereeSalaryConfigs: [],
  notificationCampaigns: [],
  notifications: [],
  depositOrders: [],
  withdrawals: [],
  paymentCallbacks: [],
  wallets: {},
  financeSettings: {
    platformFeePercent: 5,
    bettingTaxPercent: 0,
    withdrawalFee: 0,
  },
  racePrizeShares: [],
  provinces: [],
  venues: [],
  systemSettings: {
    fees: {},
    rules: {},
    emailTemplates: {},
    security: {},
    branding: {
      appName: "Horse Racing",
      logoUrl: "",
      primaryColor: "#0f766e",
    },
    raceDistances: [1000, 1200, 1600, 2000],
  },
  betMarkets: [],
  bets: [],
  auditLogs: [],
  adminWalletWithdrawals: [],
  complaints: [],
};

function ok(res, data, message) {
  return res.json({ success: true, message: message || "Success", data: data });
}

function fail(res, status, message) {
  return res.status(status || 400).json({ success: false, message: message || "Error" });
}

function nowIso() {
  return new Date().toISOString();
}

function id() {
  return new mongoose.Types.ObjectId().toString();
}

function createSlug(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function getBearerToken(req) {
  var auth = req.headers.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

async function currentUser(req) {
  var token = getBearerToken(req);
  if (!token) return null;
  try {
    var payload = jwt.verify(token, JWT_SECRET);
    if (payload.userId || payload.sub) {
      var user = await User.findById(payload.userId || payload.sub).exec();
      if (user) return user;
    }
    return payload;
  } catch (error) {
    return null;
  }
}

function publicUser(user) {
  if (!user) return null;
  var raw = typeof user.toObject === "function" ? user.toObject() : user;
  return {
    id: String(raw._id || raw.id || raw.userId || ""),
    userId: String(raw._id || raw.id || raw.userId || ""),
    username: raw.username || (raw.email ? raw.email.split("@")[0] : ""),
    fullName: raw.fullName || raw.name || "",
    name: raw.name || raw.fullName || "",
    email: raw.email || "",
    phone: raw.phone || "",
    role: raw.role || "USER",
    active: raw.active !== false,
    createdAt: raw.createdAt || null,
  };
}

function issueToken(user) {
  var dto = publicUser(user);
  return jwt.sign(
    {
      sub: dto.userId,
      userId: dto.userId,
      email: dto.email,
      username: dto.username,
      fullName: dto.fullName,
      role: dto.role,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  );
}

function authPayload(user) {
  return { token: issueToken(user), accessToken: issueToken(user), user: publicUser(user) };
}

function isObjectId(value) {
  return /^[a-fA-F0-9]{24}$/.test(String(value || ""));
}

async function findTournament(identifier) {
  if (isObjectId(identifier)) {
    var byId = await Tournament.findById(identifier).exec();
    if (byId) return byId;
  }
  return Tournament.findOne({ slug: identifier }).exec();
}

async function findHorse(identifier) {
  if (isObjectId(identifier)) {
    var byId = await Horse.findById(identifier).exec();
    if (byId) return byId;
  }
  return Horse.findOne({ slug: identifier }).exec();
}

async function findNews(identifier) {
  if (isObjectId(identifier)) {
    var byId = await News.findById(identifier).exec();
    if (byId) return byId;
  }
  return News.findOne({ slug: identifier }).exec();
}

function toPlain(doc) {
  if (!doc) return null;
  var raw = typeof doc.toObject === "function" ? doc.toObject() : doc;
  raw.id = String(raw._id || raw.id || "");
  return raw;
}

function genericCreate(collectionName, defaults) {
  return function (req, res) {
    var item = Object.assign(
      {
        id: id(),
        status: req.body.status || "PENDING",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
      defaults || {},
      req.body || {},
      req.params || {},
    );
    memory[collectionName].unshift(item);
    return ok(res, item, "Created successfully");
  };
}

function genericList(collectionName) {
  return function (req, res) {
    var items = memory[collectionName] || [];
    return ok(res, items);
  };
}

function genericGet(collectionName) {
  return function (req, res) {
    var items = memory[collectionName] || [];
    var item = items.find(function (entry) {
      return String(entry.id) === String(req.params.id || req.params.profileId || req.params.venueId);
    });
    return ok(res, item || null);
  };
}

function genericUpdate(collectionName, status, message) {
  return function (req, res) {
    var key = req.params.id || req.params.profileId || req.params.venueId || req.params.userId;
    var items = memory[collectionName] || [];
    var item = items.find(function (entry) {
      return String(entry.id) === String(key);
    });
    if (!item) {
      item = { id: String(key || id()), createdAt: nowIso() };
      items.unshift(item);
      memory[collectionName] = items;
    }
    Object.assign(item, req.body || {}, { updatedAt: nowIso() });
    if (status) item.status = status;
    return ok(res, item, message || "Updated successfully");
  };
}

router.post("/auth/register", async function (req, res, next) {
  try {
    var email = String(req.body.email || "").trim().toLowerCase();
    var password = String(req.body.password || "");
    if (!email || !password) return fail(res, 400, "Email and password are required");

    var existing = await User.findOne({ email: email }).exec();
    if (existing) return fail(res, 409, "User with this email already exists");

    var fullName = req.body.fullName || req.body.name || req.body.username || email.split("@")[0];
    var user = await User.create({
      name: fullName,
      username: req.body.username || email.split("@")[0],
      fullName: fullName,
      email: email,
      password: bcrypt.hashSync(password, 8),
      phone: req.body.phone || "",
      role: req.body.role || "USER",
    });
    return ok(res, authPayload(user), "Registered successfully");
  } catch (err) {
    next(err);
  }
});

router.post("/auth/login", async function (req, res, next) {
  try {
    var email = String(req.body.email || req.body.username || "").trim().toLowerCase();
    var password = String(req.body.password || "");
    var user = await User.findOne({
      $or: [{ email: email }, { username: email }],
    }).exec();
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return fail(res, 401, "Invalid email or password");
    }
    return ok(res, authPayload(user), "Login successful");
  } catch (err) {
    next(err);
  }
});

router.get("/auth/me", async function (req, res) {
  var user = await currentUser(req);
  if (!user) return fail(res, 401, "Unauthorized");
  return ok(res, publicUser(user));
});

router.put("/auth/password", function (req, res) {
  return ok(res, null, "Password updated");
});

router.post("/auth/logout", function (req, res) {
  return ok(res, "Logout successful", "Logout successful");
});

router.post("/auth/forgot-password", function (req, res) {
  return ok(res, "OTP sent to email", "OTP sent to email");
});

router.post("/auth/reset-password", function (req, res) {
  return ok(res, "Password reset successful", "Password reset successful");
});

router.post("/auth/google", async function (req, res, next) {
  try {
    var authService = require("../services/authService");
    return res.json(await authService.googleLogin(req.body || {}));
  } catch (err) {
    next(err);
  }
});

router.post("/auth/facebook", async function (req, res, next) {
  try {
    var authService = require("../services/authService");
    return res.json(await authService.facebookLogin(req.body || {}));
  } catch (err) {
    next(err);
  }
});

router.post("/auth/2fa/verify", function (req, res) {
  return ok(res, { verified: true, token: req.body.challengeToken || "" }, "Two-factor verification successful");
});

router.post("/auth/2fa/resend", function (req, res) {
  return ok(res, { resent: true }, "Two-factor code resent");
});

router.get("/admin/users", async function (req, res, next) {
  try {
    var users = await User.find({}).sort({ createdAt: -1 }).exec();
    return ok(res, users.map(publicUser));
  } catch (err) {
    next(err);
  }
});

router.get("/admin/users/active", async function (req, res, next) {
  try {
    var users = await User.find({ active: { $ne: false } }).sort({ createdAt: -1 }).exec();
    return ok(res, users.map(publicUser));
  } catch (err) {
    next(err);
  }
});

router.get("/admin/users/deactivated", function (req, res) {
  return ok(res, []);
});

router.get("/admin/users/:id", async function (req, res, next) {
  try {
    var user = await User.findById(req.params.id).exec();
    return user ? ok(res, publicUser(user)) : fail(res, 404, "User not found");
  } catch (err) {
    next(err);
  }
});

router.put("/admin/users/:userId/deactivate", async function (req, res, next) {
  try {
    var user = await User.findByIdAndUpdate(req.params.userId, { active: false }, { new: true }).exec();
    return ok(res, publicUser(user), "User deactivated");
  } catch (err) {
    next(err);
  }
});

router.put("/admin/users/:userId/activate", async function (req, res, next) {
  try {
    var user = await User.findByIdAndUpdate(req.params.userId, { active: true }, { new: true }).exec();
    return ok(res, publicUser(user), "User activated");
  } catch (err) {
    next(err);
  }
});

router.put("/admin/users/:userId/role", async function (req, res, next) {
  try {
    var user = await User.findByIdAndUpdate(req.params.userId, { role: req.body.role }, { new: true }).exec();
    return ok(res, publicUser(user), "Role updated");
  } catch (err) {
    next(err);
  }
});

router.get("/users/me/profile", async function (req, res) {
  var user = await currentUser(req);
  return user ? ok(res, publicUser(user)) : fail(res, 401, "Unauthorized");
});

router.put("/users/me/profile", upload.any(), async function (req, res, next) {
  try {
    var user = await currentUser(req);
    if (!user || !user._id) return fail(res, 401, "Unauthorized");
    Object.assign(user, req.body || {});
    await user.save();
    return ok(res, publicUser(user), "Profile updated");
  } catch (err) {
    next(err);
  }
});

router.get("/users/jockeys", async function (req, res, next) {
  try {
    var users = await User.find({ role: "JOCKEY" }).sort({ fullName: 1 }).exec();
    return ok(res, users.map(publicUser));
  } catch (err) {
    next(err);
  }
});

router.get("/horses/approved", async function (req, res, next) {
  try {
    var horses = await Horse.find({ racingStatus: { $ne: "cannot-race" } }).sort({ createdAt: -1 }).exec();
    return ok(res, horses.map(toPlain));
  } catch (err) {
    next(err);
  }
});

router.get("/owner/horses", async function (req, res, next) {
  try {
    var horses = await Horse.find({}).sort({ createdAt: -1 }).exec();
    return ok(res, horses.map(toPlain));
  } catch (err) {
    next(err);
  }
});

router.post("/owner/horses", upload.any(), async function (req, res, next) {
  try {
    var name = req.body.name || "Horse " + Date.now();
    var horse = await Horse.create(
      Object.assign({}, req.body, {
        name: name,
        slug: req.body.slug || createSlug(name) + "-" + Date.now(),
      }),
    );
    return ok(res, toPlain(horse), "Horse created");
  } catch (err) {
    next(err);
  }
});

router.get("/owner/horses/:id", async function (req, res, next) {
  try {
    var horse = await findHorse(req.params.id);
    return horse ? ok(res, toPlain(horse)) : fail(res, 404, "Horse not found");
  } catch (err) {
    next(err);
  }
});

router.get("/horses/:id", async function (req, res, next) {
  try {
    var horse = await findHorse(req.params.id);
    return horse ? ok(res, toPlain(horse)) : fail(res, 404, "Horse not found");
  } catch (err) {
    next(err);
  }
});

router.put("/owner/horses/:id", upload.any(), async function (req, res, next) {
  try {
    var horse = await Horse.findByIdAndUpdate(req.params.id, req.body, { new: true }).exec();
    return ok(res, toPlain(horse), "Horse updated");
  } catch (err) {
    next(err);
  }
});

router.delete("/owner/horses/:id", async function (req, res, next) {
  try {
    await Horse.findByIdAndDelete(req.params.id).exec();
    return ok(res, null, "Horse deleted");
  } catch (err) {
    next(err);
  }
});

router.get("/admin/horses", async function (req, res, next) {
  try {
    var horses = await Horse.find({}).sort({ createdAt: -1 }).exec();
    return ok(res, horses.map(toPlain));
  } catch (err) {
    next(err);
  }
});

router.put("/admin/horses/:id/approve", genericUpdate("adminWalletWithdrawals", "APPROVED", "Horse approved"));
router.put("/admin/horses/:id/reject", genericUpdate("adminWalletWithdrawals", "REJECTED", "Horse rejected"));
router.put("/admin/horses/:id/suspend", async function (req, res, next) {
  try {
    var horse = await Horse.findByIdAndUpdate(req.params.id, { racingStatus: "cannot-race" }, { new: true }).exec();
    return ok(res, toPlain(horse), "Horse suspended");
  } catch (err) {
    next(err);
  }
});

router.get("/tournaments", async function (req, res, next) {
  try {
    var tournaments = await Tournament.find({}).sort({ startDate: 1, createdAt: -1 }).exec();
    return ok(res, tournaments.map(toPlain));
  } catch (err) {
    next(err);
  }
});

router.get("/tournaments/:id", async function (req, res, next) {
  try {
    var tournament = await findTournament(req.params.id);
    return tournament ? ok(res, toPlain(tournament)) : fail(res, 404, "Tournament not found");
  } catch (err) {
    next(err);
  }
});

router.get("/tournaments/:id/races", async function (req, res, next) {
  try {
    var tournament = await findTournament(req.params.id);
    return ok(res, tournament ? tournament.races || [] : []);
  } catch (err) {
    next(err);
  }
});

router.get("/tournaments/:id/leaderboard", function (req, res) {
  return ok(res, []);
});

router.post("/admin/tournament-banners", upload.any(), function (req, res) {
  return ok(res, { url: req.body.banner || "", imageUrl: req.body.banner || "" }, "Banner uploaded");
});

router.post("/admin/tournaments", async function (req, res, next) {
  try {
    var name = req.body.name || "Tournament " + Date.now();
    var tournament = await Tournament.create(
      Object.assign({}, req.body, {
        name: name,
        slug: req.body.slug || createSlug(name) + "-" + Date.now(),
        location: req.body.location || req.body.venue || "TBD",
      }),
    );
    return ok(res, toPlain(tournament), "Tournament created");
  } catch (err) {
    next(err);
  }
});

router.get("/admin/tournaments", async function (req, res, next) {
  try {
    var tournaments = await Tournament.find({}).sort({ createdAt: -1 }).exec();
    return ok(res, tournaments.map(toPlain));
  } catch (err) {
    next(err);
  }
});

router.get("/admin/tournaments/:id", async function (req, res, next) {
  try {
    var tournament = await findTournament(req.params.id);
    return tournament ? ok(res, toPlain(tournament)) : fail(res, 404, "Tournament not found");
  } catch (err) {
    next(err);
  }
});

router.put("/admin/tournaments/:id", async function (req, res, next) {
  try {
    var tournament = await Tournament.findByIdAndUpdate(req.params.id, req.body, { new: true }).exec();
    return ok(res, toPlain(tournament), "Tournament updated");
  } catch (err) {
    next(err);
  }
});

router.put("/admin/tournaments/:id/banner", upload.any(), function (req, res) {
  return ok(res, { id: req.params.id, banner: req.body.banner || "" }, "Banner updated");
});

router.delete("/admin/tournaments/:id", async function (req, res, next) {
  try {
    await Tournament.findByIdAndDelete(req.params.id).exec();
    return ok(res, null, "Tournament deleted");
  } catch (err) {
    next(err);
  }
});

router.post("/admin/tournaments/:id/races", async function (req, res, next) {
  try {
    var tournament = await Tournament.findById(req.params.id).exec();
    if (!tournament) return fail(res, 404, "Tournament not found");
    tournament.races.push(Object.assign({ raceNumber: tournament.races.length + 1, name: "Race", distance: 1000 }, req.body));
    await tournament.save();
    return ok(res, tournament.races[tournament.races.length - 1], "Race created");
  } catch (err) {
    next(err);
  }
});

router.put("/admin/races/:raceId", async function (req, res, next) {
  try {
    var tournament = await Tournament.findOne({ "races._id": req.params.raceId }).exec();
    if (!tournament) return fail(res, 404, "Race not found");
    var race = tournament.races.id(req.params.raceId);
    Object.assign(race, req.body || {});
    await tournament.save();
    return ok(res, race, "Race updated");
  } catch (err) {
    next(err);
  }
});

router.delete("/admin/races/:raceId", async function (req, res, next) {
  try {
    var tournament = await Tournament.findOne({ "races._id": req.params.raceId }).exec();
    if (tournament) {
      tournament.races.id(req.params.raceId).deleteOne();
      await tournament.save();
    }
    return ok(res, null, "Race deleted");
  } catch (err) {
    next(err);
  }
});

router.put("/admin/tournaments/:id/races", genericUpdate("auditLogs", null, "Races updated"));
router.put("/admin/tournaments/:id/status", async function (req, res, next) {
  try {
    var tournament = await Tournament.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true }).exec();
    return ok(res, toPlain(tournament), "Status updated");
  } catch (err) {
    next(err);
  }
});
router.put("/admin/tournaments/:id/open-registration", async function (req, res, next) {
  try {
    var tournament = await Tournament.findByIdAndUpdate(req.params.id, { status: "Đang mở đăng ký" }, { new: true }).exec();
    return ok(res, toPlain(tournament), "Registration opened");
  } catch (err) {
    next(err);
  }
});
router.put("/admin/tournaments/:id/close-registration", async function (req, res, next) {
  try {
    var tournament = await Tournament.findByIdAndUpdate(req.params.id, { status: "Nháp" }, { new: true }).exec();
    return ok(res, toPlain(tournament), "Registration closed");
  } catch (err) {
    next(err);
  }
});
router.put("/admin/tournaments/:id/finalize", genericUpdate("auditLogs", "FINALIZED", "Tournament finalized"));
router.get("/admin/tournaments/:id/statistics", function (req, res) {
  return ok(res, { tournamentId: req.params.id, registrations: 0, races: 0, revenue: 0 });
});
router.get("/admin/tournaments/:id/payouts", function (req, res) {
  return ok(res, []);
});
router.get("/admin/tournaments/:id/venues", function (req, res) {
  return ok(res, memory.venues);
});

router.get("/news/all", async function (req, res, next) {
  try {
    var items = await News.find({}).sort({ createdAt: -1 }).exec();
    return ok(res, items.map(toPlain));
  } catch (err) {
    next(err);
  }
});

router.get("/news", async function (req, res, next) {
  try {
    var items = await News.find({ status: "published" }).sort({ createdAt: -1 }).exec();
    return ok(res, items.map(toPlain));
  } catch (err) {
    next(err);
  }
});

router.get("/news/:id", async function (req, res, next) {
  try {
    var item = await findNews(req.params.id);
    return item ? ok(res, toPlain(item)) : fail(res, 404, "News not found");
  } catch (err) {
    next(err);
  }
});

router.post("/admin/news", upload.any(), async function (req, res, next) {
  try {
    var title = req.body.title || "News " + Date.now();
    var item = await News.create(
      Object.assign({}, req.body, {
        title: title,
        slug: req.body.slug || createSlug(title) + "-" + Date.now(),
      }),
    );
    return ok(res, toPlain(item), "News created");
  } catch (err) {
    next(err);
  }
});
router.get("/admin/news", async function (req, res, next) {
  try {
    var items = await News.find({}).sort({ createdAt: -1 }).exec();
    return ok(res, items.map(toPlain));
  } catch (err) {
    next(err);
  }
});
router.get("/admin/news/:id", async function (req, res, next) {
  try {
    var item = await findNews(req.params.id);
    return item ? ok(res, toPlain(item)) : fail(res, 404, "News not found");
  } catch (err) {
    next(err);
  }
});
router.put("/admin/news/:id", upload.any(), async function (req, res, next) {
  try {
    var item = await News.findByIdAndUpdate(req.params.id, req.body, { new: true }).exec();
    return ok(res, toPlain(item), "News updated");
  } catch (err) {
    next(err);
  }
});
router.delete("/admin/news/:id", async function (req, res, next) {
  try {
    await News.findByIdAndDelete(req.params.id).exec();
    return ok(res, null, "News deleted");
  } catch (err) {
    next(err);
  }
});

router.get("/admin/finance-settings", function (req, res) {
  return ok(res, memory.financeSettings);
});
router.put("/admin/finance-settings", function (req, res) {
  Object.assign(memory.financeSettings, req.body || {});
  return ok(res, memory.financeSettings, "Finance settings updated");
});
router.get("/admin/finance-settings/race-prize-shares", function (req, res) {
  return ok(res, memory.racePrizeShares);
});
router.put("/admin/finance-settings/race-prize-shares", function (req, res) {
  memory.racePrizeShares = Array.isArray(req.body) ? req.body : req.body.items || [];
  return ok(res, memory.racePrizeShares, "Race prize shares updated");
});

router.get("/api-health", function (req, res) {
  return ok(res, { service: "BE Node.js compatibility API", status: "UP" });
});

router.get("/admin/payout-debts", function (req, res) {
  return ok(res, { totalDebt: 0, items: [] });
});
router.get("/admin/audit-logs", genericList("auditLogs"));

router.get("/admin/role-applications", genericList("roleApplications"));
router.get("/admin/role-applications/role/:role", function (req, res) {
  return ok(res, memory.roleApplications.filter(function (item) { return item.role === req.params.role; }));
});
router.get("/admin/role-applications/status/:status", function (req, res) {
  return ok(res, memory.roleApplications.filter(function (item) { return item.status === req.params.status; }));
});
router.put("/admin/role-applications/:profileId/approve", genericUpdate("roleApplications", "APPROVED", "Application approved"));
router.put("/admin/role-applications/:profileId/reject", genericUpdate("roleApplications", "REJECTED", "Application rejected"));

router.post("/role-applications/owner", upload.any(), genericCreate("roleApplications", { role: "OWNER" }));
router.post("/role-applications/jockey", upload.any(), genericCreate("roleApplications", { role: "JOCKEY" }));
router.post("/role-applications/spectator", genericCreate("roleApplications", { role: "SPECTATOR" }));
router.post("/role-applications/referee", upload.any(), genericCreate("roleApplications", { role: "REFEREE" }));
router.post("/role-applications/kyc/ocr", upload.any(), function (req, res) {
  return ok(res, { kycVerificationId: id(), status: "PENDING", extracted: {} });
});
router.post("/role-applications/kyc/:kycVerificationId/face-match", upload.any(), function (req, res) {
  return ok(res, { kycVerificationId: req.params.kycVerificationId, matched: true, score: 100 });
});
router.get("/role-applications/me", genericList("roleApplications"));

router.get("/jockey/profile", function (req, res) { return ok(res, {}); });
router.put("/jockey/profile", upload.any(), function (req, res) { return ok(res, req.body || {}, "Jockey profile updated"); });
router.get("/jockeys/available", async function (req, res, next) {
  try {
    var users = await User.find({ role: "JOCKEY" }).sort({ fullName: 1 }).exec();
    return ok(res, users.map(publicUser));
  } catch (err) { next(err); }
});
router.get("/jockeys/:id", async function (req, res, next) {
  try {
    var user = await User.findById(req.params.id).exec();
    return user ? ok(res, publicUser(user)) : fail(res, 404, "Jockey not found");
  } catch (err) { next(err); }
});
router.get("/admin/jockey-profiles", async function (req, res, next) {
  try {
    var users = await User.find({ role: "JOCKEY" }).sort({ fullName: 1 }).exec();
    return ok(res, users.map(publicUser));
  } catch (err) { next(err); }
});

router.post("/owner/jockey-invitations", genericCreate("roleApplications", { type: "JOCKEY_INVITATION" }));
router.get("/owner/jockey-invitations", genericList("roleApplications"));
router.get("/owner/jockey-invitations/:id", genericGet("roleApplications"));
router.get("/owners/me/jockeys", async function (req, res, next) {
  try {
    var users = await User.find({ role: "JOCKEY" }).sort({ fullName: 1 }).exec();
    return ok(res, users.map(publicUser));
  } catch (err) { next(err); }
});
router.put("/owner/jockey-invitations/:id/cancel", genericUpdate("roleApplications", "CANCELLED", "Invitation cancelled"));
router.get("/jockey/invitations", genericList("roleApplications"));
router.get("/jockey/invitations/:id", genericGet("roleApplications"));
router.put("/jockey/invitations/:id/accept", genericUpdate("roleApplications", "ACCEPTED", "Invitation accepted"));
router.put("/jockey/invitations/:id/reject", genericUpdate("roleApplications", "REJECTED", "Invitation rejected"));

router.get("/owner/horse-teams/eligible", function (req, res) { return ok(res, []); });
router.get("/admin/tournaments/:id/eligible-horse-teams", function (req, res) { return ok(res, []); });

router.get("/admin/provinces", function (req, res) { return ok(res, memory.provinces); });
router.post("/admin/provinces", genericCreate("provinces"));
router.put("/admin/provinces/:id", genericUpdate("provinces", null, "Province updated"));
router.delete("/admin/provinces/:id", function (req, res) {
  memory.provinces = memory.provinces.filter(function (item) { return item.id !== req.params.id; });
  return ok(res, null, "Province deleted");
});
router.put("/admin/provinces/:id/active", genericUpdate("provinces", "ACTIVE", "Province active status updated"));
router.get("/admin/provinces/:provinceId/venues", function (req, res) {
  return ok(res, memory.venues.filter(function (item) { return String(item.provinceId) === String(req.params.provinceId); }));
});
router.post("/admin/provinces/:provinceId/venues", genericCreate("venues"));
router.put("/admin/venues/:venueId", genericUpdate("venues", null, "Venue updated"));
router.delete("/admin/venues/:venueId", function (req, res) {
  memory.venues = memory.venues.filter(function (item) { return item.id !== req.params.venueId; });
  return ok(res, null, "Venue deleted");
});
router.put("/admin/venues/:venueId/active", genericUpdate("venues", "ACTIVE", "Venue active status updated"));

router.post("/admin/notification-campaigns", genericCreate("notificationCampaigns"));
router.get("/admin/notification-campaigns", genericList("notificationCampaigns"));
router.get("/admin/notification-campaigns/audience-count", function (req, res) { return ok(res, { count: 0 }); });
router.get("/admin/notification-campaigns/:id", genericGet("notificationCampaigns"));

router.get("/rankings", function (req, res) {
  return ok(res, { horses: [], jockeys: [] });
});

router.post("/wallets/me/deposit-orders", genericCreate("depositOrders"));
router.get("/wallets/me/deposit-orders", genericList("depositOrders"));
router.get("/wallets/me/deposit-orders/:id", genericGet("depositOrders"));
router.post("/admin/wallet/deposit-orders", genericCreate("depositOrders"));
router.get("/admin/wallet/deposit-orders", genericList("depositOrders"));
router.get("/admin/wallet/deposit-orders/:id", genericGet("depositOrders"));
router.post("/payment-callbacks/deposits", genericCreate("paymentCallbacks"));
router.get("/admin/payment-orders", genericList("depositOrders"));
router.get("/admin/payment-orders/:id", genericGet("depositOrders"));
router.get("/admin/payment-callback-logs", genericList("paymentCallbacks"));

router.get("/notifications", genericList("notifications"));
router.get("/notifications/unread-count", function (req, res) { return ok(res, { unreadCount: 0 }); });
router.put("/notifications/:id/read", genericUpdate("notifications", "READ", "Notification marked as read"));
router.put("/notifications/read-all", function (req, res) { return ok(res, null, "All notifications marked as read"); });
router.get("/admin/notifications", genericList("notifications"));

router.post("/races/:id/registrations", genericCreate("auditLogs", { type: "RACE_REGISTRATION" }));
router.get("/owner/race-registrations", genericList("auditLogs"));
router.put("/owner/race-registrations/:id/withdraw", genericUpdate("auditLogs", "WITHDRAWN", "Registration withdrawn"));
router.get("/admin/tournaments/:id/race-registrations", genericList("auditLogs"));
router.put("/admin/race-registrations/:id/approve", genericUpdate("auditLogs", "APPROVED", "Registration approved"));
router.put("/admin/race-registrations/:id/reject", genericUpdate("auditLogs", "REJECTED", "Registration rejected"));
router.put("/admin/tournaments/:id/schedule", genericUpdate("auditLogs", "SCHEDULED", "Tournament scheduled"));
router.get("/admin/races/:id/participants", function (req, res) { return ok(res, []); });
router.put("/admin/races/:id/cancel", genericUpdate("auditLogs", "CANCELLED", "Race cancelled"));
router.get("/admin/races/:id/referee-payment", function (req, res) { return ok(res, { raceId: req.params.id, amount: 0, status: "PENDING" }); });
router.get("/referee/races", function (req, res) { return ok(res, []); });
router.get("/referee/races/today", function (req, res) { return ok(res, []); });
router.get("/referee/payments", function (req, res) { return ok(res, []); });
router.get("/referee/races/:id/participants", function (req, res) { return ok(res, []); });
router.put("/referee/races/:id/participants/:participantId/gate", genericUpdate("auditLogs", null, "Gate updated"));
router.put("/referee/races/:id/participants/:participantId/check-in", genericUpdate("auditLogs", "CHECKED_IN", "Participant checked in"));
router.put("/referee/races/:id/start", genericUpdate("auditLogs", "RUNNING", "Race started"));
router.post("/referee/races/:id/results/finalize", genericCreate("auditLogs", { type: "RACE_RESULT" }));
router.get("/races/:id/results", function (req, res) { return ok(res, []); });
router.post("/races/:id/complaints", upload.any(), genericCreate("complaints"));
router.get("/owner/race-complaints", genericList("complaints"));
router.get("/admin/race-complaints", genericList("complaints"));
router.put("/admin/race-complaints/:id/resolve", genericUpdate("complaints", "RESOLVED", "Complaint resolved"));
router.put("/admin/tournaments/:id/jockey-challenge/finalize", genericUpdate("auditLogs", "FINALIZED", "Jockey challenge finalized"));
router.get("/tournaments/:id/jockey-challenge", function (req, res) { return ok(res, []); });

router.post("/admin/referee-invitations", genericCreate("refereeInvitations"));
router.get("/admin/referee-invitations", genericList("refereeInvitations"));
router.get("/admin/referee-invitations/:id", genericGet("refereeInvitations"));
router.put("/admin/referee-invitations/:id/cancel", genericUpdate("refereeInvitations", "CANCELLED", "Invitation cancelled"));
router.get("/referee/invitations", genericList("refereeInvitations"));
router.get("/referee/invitations/:id", genericGet("refereeInvitations"));
router.put("/referee/invitations/:id/accept", genericUpdate("refereeInvitations", "ACCEPTED", "Invitation accepted"));
router.put("/referee/invitations/:id/reject", genericUpdate("refereeInvitations", "REJECTED", "Invitation rejected"));

router.post("/admin/referee-salary-configs", genericCreate("refereeSalaryConfigs"));
router.get("/admin/referee-salary-configs", genericList("refereeSalaryConfigs"));
router.get("/admin/referee-salary-configs/:id", genericGet("refereeSalaryConfigs"));
router.put("/admin/referee-salary-configs/:id", genericUpdate("refereeSalaryConfigs", null, "Salary config updated"));
router.delete("/admin/referee-salary-configs/:id", function (req, res) {
  memory.refereeSalaryConfigs = memory.refereeSalaryConfigs.filter(function (item) { return item.id !== req.params.id; });
  return ok(res, null, "Salary config deleted");
});

router.get("/system-settings/branding", function (req, res) { return ok(res, memory.systemSettings.branding); });
router.get("/admin/system-settings", function (req, res) { return ok(res, memory.systemSettings); });
["fees", "rules", "email-templates", "security", "branding", "race-distances"].forEach(function (key) {
  router.put("/admin/system-settings/" + key, function (req, res) {
    var prop = key.replace(/-([a-z])/g, function (_, char) { return char.toUpperCase(); });
    memory.systemSettings[prop] = req.body || {};
    return ok(res, memory.systemSettings, "System settings updated");
  });
});

router.get("/wallets/me", function (req, res) { return ok(res, { balance: 0, status: "ACTIVE" }); });
router.get("/wallets/me/transactions", function (req, res) { return ok(res, []); });
router.get("/admin/wallet", function (req, res) { return ok(res, { balance: 0, status: "ACTIVE" }); });
router.get("/admin/wallet/transactions", function (req, res) { return ok(res, []); });

router.post("/wallets/me/withdrawals", genericCreate("withdrawals"));
router.get("/wallets/me/withdrawals", genericList("withdrawals"));
router.get("/wallets/me/withdrawals/:id", genericGet("withdrawals"));
router.get("/admin/withdrawals", genericList("withdrawals"));
router.get("/admin/withdrawals/:id", genericGet("withdrawals"));
router.put("/admin/withdrawals/:id/approve", genericUpdate("withdrawals", "APPROVED", "Withdrawal approved"));
router.put("/admin/withdrawals/:id/reject", genericUpdate("withdrawals", "REJECTED", "Withdrawal rejected"));
router.put("/admin/withdrawals/:id/mark-paid", genericUpdate("withdrawals", "PAID", "Withdrawal marked paid"));
router.post("/admin/wallet/withdrawals", genericCreate("adminWalletWithdrawals"));
router.get("/admin/wallet/withdrawals", genericList("adminWalletWithdrawals"));

router.post("/admin/races/:raceId/bet-market", genericCreate("betMarkets"));
router.put("/admin/bet-markets/:id/open", genericUpdate("betMarkets", "OPEN", "Bet market opened"));
router.put("/admin/bet-markets/:id/close", genericUpdate("betMarkets", "CLOSED", "Bet market closed"));
router.get("/admin/bet-markets", genericList("betMarkets"));
router.get("/admin/bet-markets/:id/bets", function (req, res) {
  return ok(res, memory.bets.filter(function (item) { return String(item.marketId) === String(req.params.id); }));
});
router.get("/races/:raceId/bet-market", function (req, res) {
  return ok(res, memory.betMarkets.find(function (item) { return String(item.raceId) === String(req.params.raceId); }) || null);
});
router.get("/users/me/bettable-races", function (req, res) { return ok(res, []); });
router.post("/races/:raceId/bets", genericCreate("bets"));
router.get("/users/me/bets", genericList("bets"));
router.get("/bets/:id", genericGet("bets"));

router.get("/users/me/dashboard", function (req, res) { return ok(res, { metrics: [], items: [], quickLinks: [] }); });
router.get("/owner/dashboard", function (req, res) { return ok(res, { metrics: [], items: [], quickLinks: [] }); });
router.get("/owner/races", function (req, res) { return ok(res, []); });
router.get("/owner/prizes", function (req, res) { return ok(res, []); });
router.get("/jockey/dashboard", function (req, res) { return ok(res, { metrics: [], items: [], quickLinks: [] }); });
router.get("/jockey/races", function (req, res) { return ok(res, []); });
router.get("/jockey/performance", function (req, res) { return ok(res, {}); });
router.get("/jockey/prizes", function (req, res) { return ok(res, []); });
router.get("/referee/dashboard", function (req, res) { return ok(res, { metrics: [], items: [], quickLinks: [] }); });
router.get("/referee/dashboard/checked-in-count", function (req, res) { return ok(res, { count: 0 }); });
router.get("/referee/dashboard/pending-check-in-count", function (req, res) { return ok(res, { count: 0 }); });
router.get("/spectator/dashboard", function (req, res) { return ok(res, { metrics: [], items: [], quickLinks: [] }); });
router.get("/admin/dashboard", function (req, res) { return ok(res, { metrics: [], items: [], quickLinks: [] }); });
router.get("/admin/races", function (req, res) { return ok(res, []); });
router.get("/admin/dashboard/summary", function (req, res) { return ok(res, { users: 0, tournaments: 0, races: 0, revenue: 0 }); });
router.get("/admin/dashboard/revenue", function (req, res) { return ok(res, []); });
router.get("/admin/dashboard/tournament-registrations", function (req, res) { return ok(res, []); });
router.get("/admin/dashboard/top-horses", function (req, res) { return ok(res, []); });
router.get("/admin/dashboard/quick-insights", function (req, res) { return ok(res, []); });
router.get("/admin/dashboard/tournament-race-counts", function (req, res) { return ok(res, []); });
router.get("/admin/dashboard/featured-tournaments", function (req, res) { return ok(res, []); });

module.exports = router;
