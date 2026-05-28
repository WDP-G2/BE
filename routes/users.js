var express = require("express");
var router = express.Router();
var bcrypt = require("bcryptjs");
var jwt = require("jsonwebtoken");
var User = require("../models/user");

var JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
var JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

function toPublicUser(user) {
  if (!user) return null;
  return {
    id: user._id,
    userId: user._id,
    username: user.username || user.email?.split("@")[0] || "",
    fullName: user.fullName || user.name || "",
    name: user.name || user.fullName || "",
    email: user.email,
    phone: user.phone || "",
    role: user.role || "USER",
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
      return res.status(400).json({ error: "Email and password are required" });
    }
    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
    }

    var existing = await User.findOne({ email }).exec();
    if (existing) {
      return res
        .status(409)
        .json({ error: "User with this email already exists" });
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
      return res.status(400).json({ error: "Email and password are required" });
    }

    var user = await User.findOne({ email }).exec();
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    var isMatch = bcrypt.compareSync(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
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

/* GET /users/me - current authenticated user */
router.get("/me", async function (req, res, next) {
  try {
    var authHeader = req.headers.authorization || "";
    var token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    var payload = jwt.verify(token, JWT_SECRET);
    var user = await User.findById(payload.userId || payload.sub).exec();

    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    res.json(toPublicUser(user));
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized" });
  }
});

module.exports = router;
