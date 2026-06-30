function ok(res, data, message) {
  return res.json({
    success: true,
    message: message || "Success",
    data: data,
  });
}

function fail(res, status, message) {
  return res.status(status || 400).json({
    success: false,
    message: message || "Error",
  });
}

module.exports = {
  ok: ok,
  fail: fail,
};
