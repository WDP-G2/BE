var jwt = require("jsonwebtoken");
var User = require("../models/user");

var JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

function getToken(req) {
  var authHeader = req.headers.authorization || "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
}

async function authenticate(req, res, next) {
  try {
    var token = getToken(req);

    if (!token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    var payload = jwt.verify(token, JWT_SECRET);
    var user = await User.findById(payload.userId || payload.sub).exec();

    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
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
    return res.status(401).json({ error: "Unauthorized" });
  }
}

function requireRole() {
  var allowedRoles = Array.prototype.slice.call(arguments);

  return function (req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (
      allowedRoles.length === 0 ||
      allowedRoles.indexOf(req.user.role) !== -1
    ) {
      return next();
    }

    return res.status(403).json({ error: "Forbidden" });
  };
}

module.exports = {
  authenticate: authenticate,
  requireRole: requireRole,
};
