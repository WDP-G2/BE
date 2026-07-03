var jwt = require("jsonwebtoken");
var User = require("../models/user");
var { toPublicUser } = require("../utils/userMapper");
var { fail, ok } = require("../utils/httpErrors");
var { isCloudinaryError, uploadBufferToCloudinary } = require("../utils/cloudinaryUpload");
var authService = require("../services/authService");
var { buildJockeyDirectory } = require("../services/jockeyDirectoryService");

var JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

async function listUsers(req, res, next) {
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
}

async function register(req, res, next) {
  try {
    var result = await authService.registerUser(req.body);
    res.status(201).json(toPublicUser(result.user));
  } catch (err) {
    if (err.status) {
      return fail(res, err.status, err.message);
    }
    next(err);
  }
}

async function login(req, res, next) {
  try {
    var result = await authService.loginUser(req.body.email, req.body.password);
    res.json({ token: result.token, user: toPublicUser(result.user) });
  } catch (err) {
    if (err.status) {
      return fail(res, err.status, err.message);
    }
    next(err);
  }
}

async function getJockeyDirectory(req, res, next) {
  try {
    var jockeys = await buildJockeyDirectory(req.user.id);
    res.json(jockeys);
  } catch (err) {
    next(err);
  }
}

async function getPublicJockeys(req, res, next) {
  try {
    var jockeys = await User.find({ role: "JOCKEY", active: { $ne: false } })
      .sort({ fullName: 1, username: 1 })
      .exec();
    ok(res, jockeys.map(toPublicUser));
  } catch (err) {
    next(err);
  }
}

async function getMyProfile(req, res, next) {
  try {
    var user = await User.findById(req.user.id).exec();
    if (!user) {
      return fail(res, 401, "Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại");
    }
    ok(res, toPublicUser(user));
  } catch (err) {
    next(err);
  }
}

async function updateMyProfile(req, res, next) {
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
}

async function getMe(req, res, next) {
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
}

async function getUserById(req, res, next) {
  try {
    var user = await User.findById(req.params.id).exec();

    if (!user) {
      return fail(res, 404, "Không tìm thấy người dùng");
    }

    res.json(toPublicUser(user));
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listUsers: listUsers,
  register: register,
  login: login,
  getJockeyDirectory: getJockeyDirectory,
  getPublicJockeys: getPublicJockeys,
  getMyProfile: getMyProfile,
  updateMyProfile: updateMyProfile,
  getMe: getMe,
  getUserById: getUserById,
};
