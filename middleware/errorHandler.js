module.exports = function jsonErrorHandler(err, req, res, next) {
  var status = err.status || err.statusCode || 500;
  var message = err.expose ? err.message : "Máy chủ đang gặp sự cố. Vui lòng thử lại sau.";

  if (err.name === "ValidationError" && err.errors) {
    status = 400;
    message = Object.values(err.errors)
      .map(function (item) {
        return item.message;
      })
      .join(". ");
  }

  if (err.code === 11000) {
    status = 409;
    if (/email/i.test(JSON.stringify(err.keyPattern || {}))) {
      message = "Email này đã được sử dụng";
    } else {
      message = "Dữ liệu đã tồn tại trong hệ thống";
    }
  }

  if (req.path.startsWith("/admin") ||
    req.path.startsWith("/wallets") ||
    req.path.startsWith("/notifications") ||
    req.path.startsWith("/spectator") ||
    req.path.startsWith("/referee") ||
    req.path.startsWith("/owner") ||
    req.path.startsWith("/jockey") ||
    req.path.startsWith("/role-applications") ||
    req.path.startsWith("/races") ||
    req.path.startsWith("/rankings") ||
    req.path.startsWith("/bets") ||
    req.path.startsWith("/users") ||
    req.path.startsWith("/tournaments") ||
    req.path.startsWith("/horses") ||
    req.path.startsWith("/invitations") ||
    req.path.startsWith("/news") ||
    req.headers.accept?.includes("application/json")) {
    return res.status(status).json({
      success: false,
      message: message,
      data: null,
    });
  }

  res.locals.message = message;
  res.locals.error = req.app.get("env") === "development" ? err : {};
  res.status(status);
  res.render("error");
};
