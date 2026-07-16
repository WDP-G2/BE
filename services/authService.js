var bcrypt = require("bcryptjs");
var jwt = require("jsonwebtoken");
var User = require("../models/user");
var { apiError } = require("../utils/apiResponse");

var JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
var JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
var REGISTERABLE_ROLES = ["OWNER", "JOCKEY", "REFEREE", "SPECTATOR", "USER"];

function normalizeRegisterRole(role) {
  var normalized = String(role || "USER")
    .replace(/^ROLE_/, "")
    .trim()
    .toUpperCase();
  if (normalized === "HORSE_OWNER") normalized = "OWNER";
  return REGISTERABLE_ROLES.indexOf(normalized) !== -1 ? normalized : "USER";
}

function signToken(user) {
  return jwt.sign(
    {
      sub: String(user._id),
      userId: String(user._id),
      email: user.email,
      username: user.username || "",
      fullName: user.fullName || user.name || "",
      role: user.role || "USER",
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  );
}

async function registerUser(payload) {
  var name = (payload.name || payload.fullName || "").trim();
  var username = (payload.username || "").trim();
  var fullName = (payload.fullName || name || "").trim();
  var email = (payload.email || "").trim().toLowerCase();
  var password = payload.password || "";
  var phone = (payload.phone || "").trim();
  var role = normalizeRegisterRole(payload.role);

  if (!email || !password) {
    throw apiError("Vui lòng nhập email và mật khẩu", 400);
  }
  if (password.length < 6) {
    throw apiError("Mật khẩu phải có ít nhất 6 ký tự", 400);
  }

  var existing = await User.findOne({ email: email }).exec();
  if (existing) {
    throw apiError("Email này đã được sử dụng", 409);
  }

  var user = new User({
    name: fullName,
    username: username || email.split("@")[0],
    fullName: fullName,
    email: email,
    password: bcrypt.hashSync(password, 8),
    phone: phone || undefined,
    role: role,
  });
  await user.save();

  return { user: user, token: signToken(user) };
}

async function loginUser(email, password) {
  var normalizedEmail = (email || "").trim().toLowerCase();
  var rawPassword = password || "";

  if (!normalizedEmail || !rawPassword) {
    throw apiError("Vui lòng nhập email và mật khẩu", 400);
  }

  var user = await User.findOne({ email: normalizedEmail }).exec();
  if (!user) {
    throw apiError("Email hoặc mật khẩu không đúng", 401);
  }

  if (user.active === false) {
    throw apiError("Tài khoản đã bị khóa. Liên hệ quản trị viên để được mở khóa", 403);
  }

  if (!bcrypt.compareSync(rawPassword, user.password)) {
    throw apiError("Email hoặc mật khẩu không đúng", 401);
  }

  return { user: user, token: signToken(user) };
}

async function changePassword(userId, currentPassword, newPassword) {
  if (!currentPassword || !newPassword) {
    throw apiError("Vui lòng nhập đầy đủ mật khẩu", 400);
  }
  if (newPassword.length < 6) {
    throw apiError("Mật khẩu mới phải có ít nhất 6 ký tự", 400);
  }

  var user = await User.findById(userId).exec();
  if (!user) {
    throw apiError("Phiên đăng nhập không hợp lệ", 401);
  }

  if (!bcrypt.compareSync(currentPassword, user.password)) {
    throw apiError("Mật khẩu hiện tại không đúng", 400);
  }

  user.password = bcrypt.hashSync(newPassword, 8);
  await user.save();
}

module.exports = {
  signToken: signToken,
  registerUser: registerUser,
  loginUser: loginUser,
  changePassword: changePassword,
};
