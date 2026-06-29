function apiSuccess(data, message) {
  return {
    success: true,
    message: message || "Thành công",
    data: data === undefined ? null : data,
  };
}

function apiError(message, status) {
  var err = new Error(message || "Request failed");
  err.status = status || 400;
  err.expose = true;
  return err;
}

module.exports = {
  apiSuccess: apiSuccess,
  apiError: apiError,
};
