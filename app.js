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
var apiV1Router = require("./routes/apiV1");
var zaloPayRouter = require("./routes/zalopay");
// initialize DB (reads MONGODB_URI)
require("./db");
var { seedSampleData } = require("./scripts/seedSampleData");

var app = express();

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "jade");

app.use(logger("dev"));
app.use(function (req, res, next) {
  res.header(
    "Access-Control-Allow-Origin",
    req.headers.origin || "http://localhost:5173",
  );
  res.header("Vary", "Origin");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization",
  );
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});
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
app.use("/api/v1", apiV1Router);
app.use("/api/zalopay", zaloPayRouter);

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
  if (req.originalUrl && req.originalUrl.indexOf("/api/") === 0) {
    return res.status(err.status || 500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }

  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render("error");
});

module.exports = app;
