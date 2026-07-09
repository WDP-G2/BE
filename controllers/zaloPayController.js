var zaloPay = require("../services/zaloPayService");
var depositOrderService = require("../services/depositOrderService");
var asyncHandler = require("../utils/asyncHandler");

async function handleCallback(req, res) {
  var payload = req.body || {};
  var data = payload.data;
  var mac = payload.mac;

  if (!zaloPay.isValidCallbackMac(data, mac)) {
    return res.json(zaloPay.zaloResponse(2, "Invalid"));
  }

  try {
    var dataMap = typeof data === "string" ? JSON.parse(data) : data;
    var appTransId = dataMap.app_trans_id;
    var providerTransactionId = dataMap.zp_trans_id ? String(dataMap.zp_trans_id) : "";
    var amount = dataMap.amount != null ? Number(dataMap.amount) : null;

    await depositOrderService.processZaloPayPaid(appTransId, providerTransactionId, amount, dataMap);
    return res.json(zaloPay.zaloResponse(1, "success"));
  } catch (err) {
    return res.json(zaloPay.zaloResponse(0, err.message || "error"));
  }
}

async function handleReturn(req, res) {
  var params = req.query || {};

  if (!zaloPay.isValidRedirectChecksum(params)) {
    return res.json(zaloPay.zaloResponse(2, "Invalid checksum"));
  }

  try {
    var appTransId = params.apptransid;
    var queryResponse = await zaloPay.queryOrder(appTransId);
    var returnCode = Number(queryResponse.return_code);

    if (returnCode === 1) {
      await depositOrderService.processZaloPayPaid(
        appTransId,
        queryResponse.zp_trans_id ? String(queryResponse.zp_trans_id) : "",
        queryResponse.amount != null ? Number(queryResponse.amount) : null,
        queryResponse,
      );
    } else if (returnCode === 2) {
      await depositOrderService.processZaloPayFailed(appTransId, queryResponse);
    }

    return res.json(queryResponse);
  } catch (err) {
    return res.json(zaloPay.zaloResponse(0, err.message || "error"));
  }
}

module.exports = {
  handleCallback: asyncHandler(handleCallback),
  handleReturn: asyncHandler(handleReturn),
};
