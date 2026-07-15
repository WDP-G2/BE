var { apiError } = require("../utils/apiResponse");

function enabled(name) {
  var raw = process.env["WALLET_LEDGER_" + String(name).toUpperCase() + "_ENABLED"];
  return raw == null || String(raw).toLowerCase() !== "false";
}

function assertEnabled(name) {
  if (!enabled(name)) throw apiError("Nghiệp vụ tài chính " + name + " đang bảo trì để chuyển đổi ledger", 503);
}

module.exports = { enabled: enabled, assertEnabled: assertEnabled };
