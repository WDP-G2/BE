var createError = require("http-errors");
var path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
var express = require("express");
var cookieParser = require("cookie-parser");
var logger = require("morgan");

var indexRouter = require("./routes/index");
var authRouter = require("./routes/auth");
var usersRouter = require("./routes/users");
var tournamentsRouter = require("./routes/tournaments");
var tournamentExtrasRouter = require("./routes/tournamentExtras");
var newsRouter = require("./routes/news");
var horsesRouter = require("./routes/horses");
var invitationsRouter = require("./routes/invitations");
var adminRouter = require("./routes/admin");
var walletsRouter = require("./routes/wallets");
var notificationsRouter = require("./routes/notifications");
var spectatorRouter = require("./routes/spectator");
var refereeRouter = require("./routes/referee");
var ownerRouter = require("./routes/owner");
var jockeyRouter = require("./routes/jockey");
var jockeysRouter = require("./routes/jockeys");
var roleApplicationsRouter = require("./routes/roleApplications");
var rankingsRouter = require("./routes/rankings");
var betsRouter = require("./routes/bets");
var bettingRoutes = require("./routes/betting");
var zalopayRouter = require("./routes/zalopay");
var publicSystemSettingsRouter = require("./routes/publicSystemSettings");
var jsonErrorHandler = require("./middleware/errorHandler");

require("./db");
var { seedSampleData } = require("./scripts/seedSampleData");

var app = express();

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "jade");

app.use(logger("dev"));
app.use(express.json({ limit: "12mb", strict: false }));
app.use(express.urlencoded({ extended: true, limit: "12mb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.use("/", indexRouter);
app.use("/users", usersRouter);
app.use("/users", bettingRoutes.usersBettingRouter);
app.use("/tournaments", tournamentsRouter);
app.use("/tournaments", tournamentExtrasRouter);
app.use("/news", newsRouter);
app.use("/horses", horsesRouter);
app.use("/invitations", invitationsRouter);
app.use("/admin", adminRouter);
app.use("/wallets", walletsRouter);
app.use("/notifications", notificationsRouter);
app.use("/spectator", spectatorRouter);
app.use("/referee", refereeRouter);
app.use("/owner", ownerRouter);
app.use("/jockey", jockeyRouter);
app.use("/jockeys", jockeysRouter);
app.use("/role-applications", roleApplicationsRouter);
app.use("/rankings", rankingsRouter);
app.use("/bets", betsRouter);
app.use("/races", bettingRoutes.racesRouter);
app.use("/api/zalopay", zalopayRouter);

var apiRouter = express.Router();
apiRouter.use("/auth", authRouter);
apiRouter.use("/users", usersRouter);
apiRouter.use("/users", bettingRoutes.usersBettingRouter);
apiRouter.use("/tournaments", tournamentsRouter);
apiRouter.use("/tournaments", tournamentExtrasRouter);
apiRouter.use("/news", newsRouter);
apiRouter.use("/horses", horsesRouter);
apiRouter.use("/invitations", invitationsRouter);
apiRouter.use("/admin", adminRouter);
apiRouter.use("/wallets", walletsRouter);
apiRouter.use("/notifications", notificationsRouter);
apiRouter.use("/spectator", spectatorRouter);
apiRouter.use("/referee", refereeRouter);
apiRouter.use("/owner", ownerRouter);
apiRouter.use("/jockey", jockeyRouter);
apiRouter.use("/jockeys", jockeysRouter);
apiRouter.use("/role-applications", roleApplicationsRouter);
apiRouter.use("/rankings", rankingsRouter);
apiRouter.use("/bets", betsRouter);
apiRouter.use("/races", bettingRoutes.racesRouter);
apiRouter.use("/zalopay", zalopayRouter);
apiRouter.use("/system-settings", publicSystemSettingsRouter);

apiRouter.get("/health", function (req, res) {
  var mongoose = require("./db");
  res.json({
    success: true,
    message: "OK",
    data: {
      database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
      databaseName: mongoose.connection.name || null,
    },
  });
});

app.use("/api/v1", apiRouter);

if (process.env.MONGODB_URI) {
  var connectPromise = require("./db").connectPromise;
  connectPromise
    .then(function () {
      return seedSampleData();
    })
    .catch(function (err) {
      console.error("Sample data seed error:", err.message || err);
    });
}

app.use(function (req, res, next) {
  next(createError(404));
});

app.use(jsonErrorHandler);

module.exports = app;
