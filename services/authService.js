var bcrypt = require("bcryptjs");
var jwt = require("jsonwebtoken");
var User = require("../models/user");

var JWT_SECRET =
  process.env.JWT_SECRET || process.env.APP_JWT_SECRET || "dev-secret-change-me";
var JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

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
    pendingRole: raw.pendingRole || null,
    roleApprovalStatus: raw.roleApprovalStatus || null,
    roleReviewReason: raw.roleReviewReason || null,
    roleReviewedBy: raw.roleReviewedBy ? String(raw.roleReviewedBy) : null,
    roleReviewedAt: raw.roleReviewedAt || null,
    active: raw.active !== false,
    avatarUrl: raw.avatarUrl || null,
    location: raw.location || null,
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
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
  var dto = publicUser(user);
  var token = issueToken(user);
  return {
    token: token,
    accessToken: token,
    tokenType: "Bearer",
    userId: dto.userId,
    username: dto.username,
    fullName: dto.fullName,
    email: dto.email,
    phone: dto.phone || "",
    role: dto.role,
    pendingRole: dto.pendingRole || null,
    roleApprovalStatus: dto.roleApprovalStatus || null,
    roleReviewReason: dto.roleReviewReason || null,
    twoFactorRequired: false,
    challengeId: null,
    challengeExpiresAt: null,
    user: dto,
  };
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

async function updatePassword(userId, payload) {
  var user = await User.findById(userId).exec();
  if (!user) {
    var notFound = new Error("User not found");
    notFound.status = 404;
    throw notFound;
  }
  var oldPassword = String(payload.oldPassword || payload.currentPassword || "");
  var newPassword = String(payload.newPassword || "");
  if (!newPassword) {
    var missing = new Error("New password is required");
    missing.status = 400;
    throw missing;
  }
  if (oldPassword && !bcrypt.compareSync(oldPassword, user.password)) {
    var invalid = new Error("Current password is incorrect");
    invalid.status = 400;
    throw invalid;
  }
  user.password = bcrypt.hashSync(newPassword, 8);
  user.updatedAt = new Date();
  await user.save();
}

async function googleLogin(payload) {
  var idToken = String(payload.idToken || payload.token || payload.credential || "");
  var email = String(payload.email || "").trim().toLowerCase();
  var fullName = String(payload.fullName || payload.name || "");

  if (idToken) {
    try {
      var decoded = jwt.decode(idToken);
      if (decoded) {
        if (!email && decoded.email) email = String(decoded.email).trim().toLowerCase();
        if (!fullName && decoded.name) fullName = decoded.name;
        else if (!fullName && (decoded.given_name || decoded.family_name)) {
          fullName = [decoded.given_name, decoded.family_name].filter(Boolean).join(" ");
        }
      }
    } catch (_) { /* ignore decode errors */ }
  }

  if (!email) {
    var err = new Error("Email is required for Google login");
    err.status = 400;
    throw err;
  }

  var user = await User.findOne({ email: email }).exec();
  if (!user) {
    user = await User.create({
      email: email,
      password: bcrypt.hashSync(email + Date.now(), 8),
      fullName: fullName || email.split("@")[0],
      name: fullName || email.split("@")[0],
      username: email.split("@")[0],
    });
  }
  return authPayload(user);
}

async function facebookLogin(payload) {
  var email = String(payload.email || "").trim().toLowerCase();
  var fullName = String(payload.fullName || payload.name || "");

  if (!email) {
    var err = new Error("Email is required for Facebook login");
    err.status = 400;
    throw err;
  }

  var user = await User.findOne({ email: email }).exec();
  if (!user) {
    user = await User.create({
      email: email,
      password: bcrypt.hashSync(email + Date.now(), 8),
      fullName: fullName || email.split("@")[0],
      name: fullName || email.split("@")[0],
      username: email.split("@")[0],
    });
  }
  return authPayload(user);
}

async function register(payload) {
  var email = String(payload.email || "").trim().toLowerCase();
  var password = String(payload.password || "");
  if (!email || !password) {
    var missing = new Error("Email and password are required");
    missing.status = 400;
    throw missing;
  }

  var existing = await User.findOne({ email: email }).exec();
  if (existing) {
    var duplicate = new Error("User with this email already exists");
    duplicate.status = 409;
    throw duplicate;
  }

  var fullName =
    payload.fullName || payload.name || payload.username || email.split("@")[0];
  var user = await User.create({
    name: fullName,
    username: payload.username || email.split("@")[0],
    fullName: fullName,
    email: email,
    password: bcrypt.hashSync(password, 8),
    phone: payload.phone || "",
    role: payload.role || "USER",
  });

  return authPayload(user);
}

async function login(payload) {
  var email = String(payload.email || payload.username || "")
    .trim()
    .toLowerCase();
  var password = String(payload.password || "");
  var user = await User.findOne({
    $or: [{ email: email }, { username: email }],
  }).exec();

  if (!user || !bcrypt.compareSync(password, user.password)) {
    var invalid = new Error("Invalid email or password");
    invalid.status = 401;
    throw invalid;
  }

  return authPayload(user);
}

module.exports = {
  authPayload: authPayload,
  currentUser: currentUser,
  facebookLogin: facebookLogin,
  googleLogin: googleLogin,
  issueToken: issueToken,
  login: login,
  publicUser: publicUser,
  register: register,
  updatePassword: updatePassword,
};
