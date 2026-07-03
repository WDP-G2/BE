var express = require("express");
var router = express.Router();
var bcrypt = require("bcryptjs");
var jwt = require("jsonwebtoken");
var mongoose = require("mongoose");
var multer = require("multer");
var User = require("../models/user");
var Tournament = require("../models/tournament");
var JockeyInvitation = require("../models/jockeyInvitation");
var { authenticate, requireRole } = require("../middleware/auth");
var { fail, ok } = require("../utils/httpErrors");
var {
  uploadBufferToCloudinary,
  isCloudinaryError,
} = require("../utils/cloudinaryUpload");

var avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

var JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
var JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

function toPublicUser(user) {
  if (!user) return null;
  return {
    id: String(user._id),
    userId: String(user._id),
    username: user.username || user.email?.split("@")[0] || "",
    fullName: user.fullName || user.name || "",
    name: user.name || user.fullName || "",
    email: user.email,
    phone: user.phone || "",
    role: user.role || "USER",
    active: user.active !== false,
    location: user.location || "",
    avatarUrl: user.avatarUrl || "",
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/* GET users listing (without passwords). */
router.get("/", async function (req, res, next) {
  try {
    var role = (req.query.role || "").trim().toUpperCase();
    var filter = {};

    if (role) {
      filter.role = role;
    }

    var users = await User.find(filter).sort({ createdAt: -1 }).exec();
    res.json(users.map(toPublicUser));
  } catch (err) {
    next(err);
  }
});

/* POST /users/register - register a new user */
router.post("/register", async function (req, res, next) {
  try {
    var name = (req.body.name || "").trim();
    var username = (req.body.username || "").trim();
    var fullName = (req.body.fullName || name || "").trim();
    var email = (req.body.email || "").trim().toLowerCase();
    var password = req.body.password || "";
    var phone = (req.body.phone || "").trim();

    if (!email || !password) {
      return fail(res, 400, "Vui lòng nhập email và mật khẩu");
    }
    if (password.length < 6) {
      return fail(res, 400, "Mật khẩu phải có ít nhất 6 ký tự");
    }

    var existing = await User.findOne({ email }).exec();
    if (existing) {
      return fail(res, 409, "Email này đã được sử dụng");
    }

    var hashed = bcrypt.hashSync(password, 8);
    var user = new User({
      name: fullName,
      username: username || email.split("@")[0],
      fullName,
      email,
      password: hashed,
      phone: phone || undefined,
      role: "USER",
    });
    await user.save();

    res.status(201).json(toPublicUser(user));
  } catch (err) {
    next(err);
  }
});

/* POST /users/login - authenticate user and return JWT */
router.post("/login", async function (req, res, next) {
  try {
    var email = (req.body.email || "").trim().toLowerCase();
    var password = req.body.password || "";

    if (!email || !password) {
      return fail(res, 400, "Vui lòng nhập email và mật khẩu");
    }

    var user = await User.findOne({ email }).exec();
    if (!user) {
      return fail(res, 401, "Email hoặc mật khẩu không đúng");
    }

    if (user.active === false) {
      return fail(res, 403, "Tài khoản đã bị khóa. Liên hệ quản trị viên để được mở khóa");
    }

    var isMatch = bcrypt.compareSync(password, user.password);
    if (!isMatch) {
      return fail(res, 401, "Email hoặc mật khẩu không đúng");
    }

    var publicUser = toPublicUser(user);
    var token = jwt.sign(
      {
        sub: String(user._id),
        userId: String(user._id),
        email: user.email,
        username: publicUser.username,
        fullName: publicUser.fullName,
        role: publicUser.role,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN },
    );

    res.json({ token: token, user: publicUser });
  } catch (err) {
    next(err);
  }
});

var ACTIVE_REGISTRATION_STATUSES = ["Đã duyệt", "Đang chạy"];
var COUNTED_REGISTRATION_STATUSES = ["Đã duyệt", "Đang chạy", "Hoàn thành"];
var ACTIVE_TOURNAMENT_STATUSES = ["Đang mở đăng ký", "Đang diễn ra"];

function yearsSince(dateValue) {
  if (!dateValue) return 0;
  var created = new Date(dateValue);
  if (Number.isNaN(created.getTime())) return 0;
  return Math.max(
    1,
    Math.floor((Date.now() - created.getTime()) / (365.25 * 24 * 60 * 60 * 1000)),
  );
}

function buildJockeyLicense(user, index) {
  var suffix = String(index + 1).padStart(3, "0");
  return "VN-JK-" + suffix;
}

function toDateInput(value) {
  if (!value) return "";
  var date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function mapInvitationSummary(invitation) {
  if (!invitation) return null;
  return {
    id: String(invitation._id),
    status: invitation.status || "Chờ xử lý",
    horseName: invitation.horseName || "",
    tournamentName: invitation.tournamentName || "",
    raceLabel: invitation.raceLabel || "",
    sentAt: toDateInput(invitation.createdAt),
    respondedAt: invitation.respondedAt
      ? toDateInput(invitation.respondedAt)
      : "",
  };
}

async function buildJockeyDirectory(ownerId) {
  var ownerObjectId = mongoose.Types.ObjectId.isValid(ownerId)
    ? new mongoose.Types.ObjectId(ownerId)
    : ownerId;

  var invitations = await JockeyInvitation.find({ ownerId: ownerObjectId })
    .sort({ createdAt: -1 })
    .exec();
  var latestInvitationByJockey = {};

  invitations.forEach(function (invitation) {
    var jockeyId = String(invitation.jockeyId || "");
    if (!jockeyId || latestInvitationByJockey[jockeyId]) return;
    latestInvitationByJockey[jockeyId] = invitation;
  });
  var jockeys = await User.find({ role: "JOCKEY" })
    .sort({ fullName: 1, name: 1, username: 1 })
    .exec();
  var tournaments = await Tournament.find({})
    .select("status registrations races")
    .exec();

  var statsByJockey = {};

  jockeys.forEach(function (jockey) {
    statsByJockey[String(jockey._id)] = {
      wins: 0,
      races: 0,
      isBusy: false,
      assigned: null,
      assignedForOwner: null,
    };
  });

  tournaments.forEach(function (tournament) {
    var isActiveTournament =
      ACTIVE_TOURNAMENT_STATUSES.indexOf(tournament.status) !== -1;

    (tournament.registrations || []).forEach(function (registration) {
      var jockeyId = String(registration.jockeyId || "");
      if (!jockeyId || !statsByJockey[jockeyId]) return;

      if (
        COUNTED_REGISTRATION_STATUSES.indexOf(registration.status) !== -1
      ) {
        statsByJockey[jockeyId].races += 1;
      }

      if (
        isActiveTournament &&
        ACTIVE_REGISTRATION_STATUSES.indexOf(registration.status) !== -1
      ) {
        statsByJockey[jockeyId].isBusy = true;
        statsByJockey[jockeyId].assigned = registration.horseName || null;

        if (String(registration.ownerId || "") === String(ownerId || "")) {
          statsByJockey[jockeyId].assignedForOwner =
            registration.horseName || null;
        }
      }
    });

    (tournament.races || []).forEach(function (race) {
      (race.results || []).forEach(function (result) {
        var jockeyId = String(result.jockeyId || "");
        if (!jockeyId || !statsByJockey[jockeyId]) return;
        if (Number(result.position) === 1) {
          statsByJockey[jockeyId].wins += 1;
        }
      });
    });
  });

  var mapped = jockeys.map(function (jockey, index) {
    var stats = statsByJockey[String(jockey._id)] || {
      wins: 0,
      races: 0,
      isBusy: false,
      assigned: null,
      assignedForOwner: null,
    };
    var races = Math.max(stats.races, stats.wins);
    var wins = stats.wins;
    var winRate = races > 0 ? Math.round((wins / races) * 1000) / 10 : 0;
    var availability = stats.isBusy ? "Bận" : "Sẵn sàng";
    var name = jockey.fullName || jockey.name || jockey.username || "Jockey";
    var latestInvitation = latestInvitationByJockey[String(jockey._id)] || null;
    var invitation = mapInvitationSummary(latestInvitation);
    var invitationStatus = invitation ? invitation.status : null;
    var canInvite =
      !invitationStatus || invitationStatus === "Đã từ chối";

    return {
      id: String(jockey._id),
      name: name,
      email: jockey.email,
      phone: jockey.phone || "",
      username: jockey.username || "",
      age: null,
      experience: yearsSince(jockey.createdAt),
      wins: wins,
      races: races,
      winRate: winRate,
      license: buildJockeyLicense(jockey, index),
      status: availability,
      statusTone: availability === "Bận" ? "red" : "green",
      availability: availability,
      assignedHorse: stats.assignedForOwner || null,
      assigned: stats.assignedForOwner || null,
      assignedOther: stats.assignedForOwner
        ? null
        : stats.assigned || null,
      isBusy: stats.isBusy,
      invitation: invitation,
      invitationStatus: invitationStatus,
      canInvite: canInvite,
    };
  });

  mapped.sort(function (first, second) {
    if (second.wins !== first.wins) return second.wins - first.wins;
    if (second.winRate !== first.winRate) return second.winRate - first.winRate;
    return first.name.localeCompare(second.name, "vi");
  });

  return mapped.map(function (item, index) {
    return Object.assign({}, item, { ranking: index + 1 });
  });
}

/* GET /users/jockeys/directory - all jockeys with stats for horse owner */
router.get(
  "/jockeys/directory",
  authenticate,
  requireRole("OWNER", "ADMIN"),
  async function (req, res, next) {
    try {
      var jockeys = await buildJockeyDirectory(req.user.id);
      res.json(jockeys);
    } catch (err) {
      next(err);
    }
  },
);

/* GET /users/jockeys - public jockey accounts */
router.get("/jockeys", async function (req, res, next) {
  try {
    var jockeys = await User.find({ role: "JOCKEY", active: { $ne: false } })
      .sort({ fullName: 1, username: 1 })
      .exec();
    ok(res, jockeys.map(toPublicUser));
  } catch (err) {
    next(err);
  }
});

/* GET /users/me/profile - current user profile */
router.get("/me/profile", authenticate, async function (req, res, next) {
  try {
    var user = await User.findById(req.user.id).exec();
    if (!user) {
      return fail(res, 401, "Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại");
    }
    ok(res, toPublicUser(user));
  } catch (err) {
    next(err);
  }
});

/* PUT /users/me/profile - update current user profile (supports optional avatar upload) */
router.put(
  "/me/profile",
  authenticate,
  avatarUpload.single("avatar"),
  async function (req, res, next) {
    try {
      var user = await User.findById(req.user.id).exec();
      if (!user) {
        return fail(res, 401, "Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại");
      }

      var fullName = (req.body.fullName || req.body.name || "").trim();
      var phone = (req.body.phone || "").trim();
      var location = (req.body.location || "").trim();

      if (fullName) {
        user.fullName = fullName;
        user.name = fullName;
      }
      if (phone) user.phone = phone;
      if (location) user.location = location;
      if (req.body.avatarUrl) user.avatarUrl = String(req.body.avatarUrl).trim();

      if (req.file) {
        var uploaded = await uploadBufferToCloudinary(req.file, "horse-racing/avatars");
        user.avatarUrl = uploaded ? uploaded.secure_url || uploaded.url || user.avatarUrl : user.avatarUrl;
      }

      await user.save();
      ok(res, toPublicUser(user), "Cập nhật hồ sơ thành công");
    } catch (err) {
      if (isCloudinaryError(err)) {
        return fail(res, 400, String(err.message || err));
      }
      next(err);
    }
  },
);

/* GET /users/me - current authenticated user */
router.get("/me", async function (req, res, next) {
  try {
    var authHeader = req.headers.authorization || "";
    var token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!token) {
      return fail(res, 401, "Vui lòng đăng nhập để tiếp tục");
    }

    var payload = jwt.verify(token, JWT_SECRET);
    var user = await User.findById(payload.userId || payload.sub).exec();

    if (!user) {
      return fail(res, 401, "Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại");
    }

    res.json(toPublicUser(user));
  } catch (err) {
    return fail(res, 401, "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại");
  }
});

router.get("/:id", async function (req, res, next) {
  try {
    var user = await User.findById(req.params.id).exec();

    if (!user) {
      return fail(res, 404, "Không tìm thấy người dùng");
    }

    res.json(toPublicUser(user));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
