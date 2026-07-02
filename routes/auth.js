var express = require("express");
var router = express.Router();
var bcrypt = require("bcryptjs");
var jwt = require("jsonwebtoken");
var User = require("../models/user");
var { authenticate } = require("../middleware/auth");
var { fail, ok } = require("../utils/httpErrors");

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
    avatarUrl: pub.avatarUrl,
    location: pub.location,
  };
}

function signToken(user) {
  var pub = toPublicUser(user);
  return jwt.sign(
    {
      sub: pub.userId,
      userId: pub.userId,
      email: pub.email,
      username: pub.username,
      fullName: pub.fullName,
      role: pub.role,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  );
}

router.post("/register", async function (req, res, next) {
  try {
    var name = (req.body.name || req.body.fullName || "").trim();
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
      fullName: fullName,
      email: email,
      password: hashed,
      phone: phone || undefined,
      role: "USER",
    });
    await user.save();

    var token = signToken(user);
    return ok(res, toAuthResponse(user, token), "Đăng ký thành công", 201);
  } catch (err) {
    next(err);
  }
});

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

    var token = signToken(user);
    return ok(res, toAuthResponse(user, token), "Đăng nhập thành công");
  } catch (err) {
    next(err);
  }
});

router.get("/me", authenticate, async function (req, res, next) {
  try {
    var user = await User.findById(req.user.id).exec();
    if (!user) {
      return fail(res, 401, "Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại");
    }
    return ok(res, toPublicUser(user));
  } catch (err) {
    next(err);
  }
});

router.post("/logout", authenticate, function (req, res) {
  return ok(res, null, "Đăng xuất thành công");
});

router.put("/password", authenticate, async function (req, res, next) {
  try {
    var currentPassword = req.body.currentPassword || "";
    var newPassword = req.body.newPassword || "";

    if (!currentPassword || !newPassword) {
      return fail(res, 400, "Vui lòng nhập đầy đủ mật khẩu");
    }
    if (newPassword.length < 6) {
      return fail(res, 400, "Mật khẩu mới phải có ít nhất 6 ký tự");
    }

    var user = await User.findById(req.user.id).exec();
    if (!user) {
      return fail(res, 401, "Phiên đăng nhập không hợp lệ");
    }

    if (!bcrypt.compareSync(currentPassword, user.password)) {
      return fail(res, 400, "Mật khẩu hiện tại không đúng");
    }

    user.password = bcrypt.hashSync(newPassword, 8);
    await user.save();
    return ok(res, null, "Đổi mật khẩu thành công");
  } catch (err) {
    next(err);
  }
});

router.post("/forgot-password", function (req, res) {
  return ok(res, null, "Nếu email tồn tại, mã OTP sẽ được gửi đến hộp thư");
});

router.post("/reset-password", function (req, res) {
  return fail(res, 501, "Chức năng đặt lại mật khẩu chưa được cấu hình trên môi trường này");
});

router.post("/google", function (req, res) {
  return fail(res, 501, "Đăng nhập Google chưa được cấu hình trên môi trường này");
});

router.post("/facebook", function (req, res) {
  return fail(res, 501, "Đăng nhập Facebook chưa được cấu hình trên môi trường này");
});

module.exports = router;
