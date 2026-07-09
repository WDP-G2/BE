var { toPublicUser } = require("../utils/userMapper");
var { fail, ok } = require("../utils/httpErrors");
var User = require("../models/user");
var authService = require("../services/authService");

function toAuthResponse(user, token) {
  var pub = toPublicUser(user);
  return {
    token: token,
    tokenType: "Bearer",
    userId: pub.userId,
    username: pub.username,
    email: pub.email,
    phone: pub.phone,
    role: pub.role,
    fullName: pub.fullName,
    active: pub.active,
    pendingRole: pub.pendingRole,
    roleApprovalStatus: pub.roleApprovalStatus,
    roleReviewReason: pub.roleReviewReason,
    roleReviewedBy: pub.roleReviewedBy,
    roleReviewedAt: pub.roleReviewedAt,
    avatarUrl: pub.avatarUrl,
    location: pub.location,
  };
}

async function register(req, res, next) {
  try {
    var result = await authService.registerUser(req.body);
    return ok(res, toAuthResponse(result.user, result.token), "Đăng ký thành công", 201);
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
    return ok(res, toAuthResponse(result.user, result.token), "Đăng nhập thành công");
  } catch (err) {
    if (err.status) {
      return fail(res, err.status, err.message);
    }
    next(err);
  }
}

async function getMe(req, res, next) {
  try {
    var user = await User.findById(req.user.id).exec();
    if (!user) {
      return fail(res, 401, "Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại");
    }
    return ok(res, toPublicUser(user));
  } catch (err) {
    next(err);
  }
}

function logout(req, res) {
  return ok(res, null, "Đăng xuất thành công");
}

async function changePassword(req, res, next) {
  try {
    await authService.changePassword(req.user.id, req.body.currentPassword, req.body.newPassword);
    return ok(res, null, "Đổi mật khẩu thành công");
  } catch (err) {
    if (err.status) {
      return fail(res, err.status, err.message);
    }
    next(err);
  }
}

function forgotPassword(req, res) {
  return ok(res, null, "Nếu email tồn tại, mã OTP sẽ được gửi đến hộp thư");
}

function resetPassword(req, res) {
  return fail(res, 501, "Chức năng đặt lại mật khẩu chưa được cấu hình trên môi trường này");
}

function googleLogin(req, res) {
  return fail(res, 501, "Đăng nhập Google chưa được cấu hình trên môi trường này");
}

function facebookLogin(req, res) {
  return fail(res, 501, "Đăng nhập Facebook chưa được cấu hình trên môi trường này");
}

module.exports = {
  register: register,
  login: login,
  getMe: getMe,
  logout: logout,
  changePassword: changePassword,
  forgotPassword: forgotPassword,
  resetPassword: resetPassword,
  googleLogin: googleLogin,
  facebookLogin: facebookLogin,
};
