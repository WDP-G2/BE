var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");

var indexRouter = require("./routes/index");
var usersRouter = require("./routes/users");
var tournamentsRouter = require("./routes/tournaments");
var newsRouter = require("./routes/news");
var horsesRouter = require("./routes/horses");
var invitationsRouter = require("./routes/invitations");
// initialize DB (reads MONGODB_URI)
require("./db");
var { seedSampleData } = require("./scripts/seedSampleData");

var app = express();

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "jade");

app.use(logger("dev"));
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true, limit: "12mb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.use("/", indexRouter);
app.use("/users", usersRouter);
app.use("/tournaments", tournamentsRouter);
app.use("/news", newsRouter);
app.use("/horses", horsesRouter);
app.use("/invitations", invitationsRouter);

if (process.env.MONGODB_URI) {
  seedSampleData().catch(function (err) {
    console.error("Sample data seed error:", err.message || err);
  });
}

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render("error");
});

module.exports = app;
