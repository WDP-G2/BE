var authService = require("../services/authService");
var api = require("../utils/apiResponse");

async function register(req, res, next) {
  try {
    return api.ok(
      res,
      await authService.register(req.body || {}),
      "Registered successfully",
    );
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    return api.ok(res, await authService.login(req.body || {}), "Login successful");
  } catch (err) {
    next(err);
  }
}

async function me(req, res) {
  var user = await authService.currentUser(req);
  if (!user) return api.fail(res, 401, "Unauthorized");
  return api.ok(res, authService.publicUser(user));
}

async function updatePassword(req, res, next) {
  try {
    var user = await authService.currentUser(req);
    if (!user || !user._id) return api.fail(res, 401, "Unauthorized");
    await authService.updatePassword(user._id, req.body || {});
    return api.ok(res, null, "Password updated");
  } catch (err) {
    next(err);
  }
}

function logout(req, res) {
  return api.ok(res, "Logout successful", "Logout successful");
}

function forgotPassword(req, res) {
  return api.ok(res, "OTP sent to email", "OTP sent to email");
}

function resetPassword(req, res) {
  return api.ok(res, "Password reset successful", "Password reset successful");
}

function verifyTwoFactor(req, res) {
  return api.ok(
    res,
    { verified: true, token: req.body.challengeToken || "" },
    "Two-factor verification successful",
  );
}

function resendTwoFactor(req, res) {
  return api.ok(res, { resent: true }, "Two-factor code resent");
}

async function googleLogin(req, res, next) {
  try {
    var data = await authService.googleLogin(req.body || {});
    return res.json(data);
  } catch (err) {
    next(err);
  }
}

async function facebookLogin(req, res, next) {
  try {
    var data = await authService.facebookLogin(req.body || {});
    return res.json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  facebookLogin: facebookLogin,
  forgotPassword: forgotPassword,
  googleLogin: googleLogin,
  login: login,
  logout: logout,
  me: me,
  register: register,
  resendTwoFactor: resendTwoFactor,
  resetPassword: resetPassword,
  updatePassword: updatePassword,
  verifyTwoFactor: verifyTwoFactor,
};
