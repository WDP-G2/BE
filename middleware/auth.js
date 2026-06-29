var jwt = require("jsonwebtoken");
var User = require("../models/user");
var { fail } = require("../utils/httpErrors");

var JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

function getToken(req) {
  var authHeader = req.headers.authorization || "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
}

async function authenticate(req, res, next) {
  try {
    var token = getToken(req);

    if (!token) {
      return fail(res, 401, "Vui lòng đăng nhập để tiếp tục");
    }

    var payload = jwt.verify(token, JWT_SECRET);
    var user = await User.findById(payload.userId || payload.sub).exec();

    if (!user) {
      return fail(res, 401, "Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại");
    }

    if (user.active === false) {
      return fail(res, 403, "Tài khoản đã bị khóa. Liên hệ quản trị viên để được mở khóa");
    }

    req.user = {
      id: String(user._id),
      role: user.role,
      email: user.email,
      fullName: user.fullName || user.name || "",
      username: user.username || "",
    };

    next();
  } catch (err) {
    return fail(res, 401, "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại");
  }
}

function requireRole() {
  var allowedRoles = Array.prototype.slice.call(arguments);

  return function (req, res, next) {
    if (!req.user) {
      return fail(res, 401, "Vui lòng đăng nhập để tiếp tục");
    }

    if (
      allowedRoles.length === 0 ||
      allowedRoles.indexOf(req.user.role) !== -1
    ) {
      return next();
    }

    return fail(res, 403, "Bạn không có quyền thực hiện thao tác này");
  };
}

module.exports = {
  authenticate: authenticate,
  requireRole: requireRole,
};
