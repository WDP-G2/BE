function fail(res, status, message, data) {
  return res.status(status).json({
    success: false,
    message: message || "Đã có lỗi xảy ra",
    data: data === undefined ? null : data,
  });
}

function ok(res, data, message, status) {
  return res.status(status || 200).json({
    success: true,
    message: message || "Thành công",
    data: data === undefined ? null : data,
  });
}

module.exports = {
  fail: fail,
  ok: ok,
};
