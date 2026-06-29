var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");

var indexRouter = require("./routes/index");
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
var roleApplicationsRouter = require("./routes/roleApplications");
var rankingsRouter = require("./routes/rankings");
var betsRouter = require("./routes/bets");
var bettingRoutes = require("./routes/betting");
var jsonErrorHandler = require("./middleware/errorHandler");

require("./db");
var { seedSampleData } = require("./scripts/seedSampleData");

var app = express();

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "jade");

app.use(logger("dev"));
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true, limit: "12mb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

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
app.use("/role-applications", roleApplicationsRouter);
app.use("/rankings", rankingsRouter);
app.use("/bets", betsRouter);
app.use("/races", bettingRoutes.racesRouter);

if (process.env.MONGODB_URI) {
  seedSampleData().catch(function (err) {
    console.error("Sample data seed error:", err.message || err);
  });
}

app.use(function (req, res, next) {
  next(createError(404));
});

app.use(jsonErrorHandler);

module.exports = app;
