var crypto = require("crypto");

var ZALOPAY_APP_ID = process.env.ZALOPAY_APP_ID || "";
var ZALOPAY_KEY1 = process.env.ZALOPAY_KEY1 || "";
var ZALOPAY_KEY2 = process.env.ZALOPAY_KEY2 || "";
var ZALOPAY_CREATE_URL =
  process.env.ZALOPAY_CREATE_URL || "https://sb-openapi.zalopay.vn/v2/create";
var ZALOPAY_QUERY_URL =
  process.env.ZALOPAY_QUERY_URL || "https://sb-openapi.zalopay.vn/v2/query";
var ZALOPAY_CALLBACK_URL =
  process.env.ZALOPAY_CALLBACK_URL || "http://localhost:8080/api/v1/zalopay/callback";
var ZALOPAY_REDIRECT_URL =
  process.env.ZALOPAY_REDIRECT_URL || "http://localhost:5173/admin/wallet";

function isConfigured() {
  return Boolean(ZALOPAY_APP_ID && ZALOPAY_KEY1 && ZALOPAY_KEY2);
}

function hmacSha256(key, data) {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest("hex");
}

function formatTransDate(date) {
  var yy = String(date.getFullYear()).slice(-2);
  var mm = String(date.getMonth() + 1).padStart(2, "0");
  var dd = String(date.getDate()).padStart(2, "0");
  return yy + mm + dd;
}

function buildAppTransId(orderCode) {
  return formatTransDate(new Date()) + "_" + orderCode;
}

function buildEmbedData(paymentChannel) {
  var channel = String(paymentChannel || "QR").toUpperCase();
  if (channel === "VISA" || channel === "CARD" || channel === "INTERNATIONAL_CARD") {
    return JSON.stringify({ preferred_payment_method: ["international_card"] });
  }
  if (channel === "WALLET" || channel === "ZALOPAY_WALLET") {
    return JSON.stringify({ preferred_payment_method: ["zalopay_wallet"] });
  }
  return JSON.stringify({ preferred_payment_method: ["vietqr"] });
}

function pickCheckoutUrl(response) {
  return response.cashier_order_url || response.order_url || "";
}

async function postForm(url, fields) {
  var body = new URLSearchParams();
  Object.keys(fields).forEach(function (key) {
    body.append(key, String(fields[key]));
  });

  var response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error("ZaloPay HTTP " + response.status);
  }

  return response.json();
}

async function createOrder(order, appUser, paymentChannel) {
  if (!isConfigured()) {
    throw new Error("ZaloPay chưa được cấu hình. Thêm ZALOPAY_APP_ID, KEY1, KEY2 vào .env");
  }

  var appTransId = order.paymentLinkId || buildAppTransId(order.orderCode);
  var amount = Math.round(Number(order.amount || 0));
  var appTime = Date.now();
  var item = "[]";
  var embedData = buildEmbedData(paymentChannel || order.paymentChannel);
  var description = order.transferContent || "HOSER deposit order " + order.orderCode;
  var user = appUser && appUser.trim() ? appUser.trim() : "hoser";

  var macData = [ZALOPAY_APP_ID, appTransId, user, String(amount), String(appTime), embedData, item].join("|");
  var mac = hmacSha256(ZALOPAY_KEY1, macData);

  var response = await postForm(ZALOPAY_CREATE_URL, {
    app_id: ZALOPAY_APP_ID,
    app_trans_id: appTransId,
    app_user: user,
    app_time: appTime,
    amount: amount,
    item: item,
    embed_data: embedData,
    description: description,
    callback_url: ZALOPAY_CALLBACK_URL,
    redirect_url: ZALOPAY_REDIRECT_URL,
    mac: mac,
  });

  if (Number(response.return_code) !== 1) {
    throw new Error(
      "Không tạo được lệnh ZaloPay: " + (response.return_message || JSON.stringify(response)),
    );
  }

  return {
    appTransId: appTransId,
    checkoutUrl: pickCheckoutUrl(response),
    cashierOrderUrl: response.cashier_order_url || "",
    orderUrl: response.order_url || "",
    qrCode: response.qr_code || "",
    orderToken: response.zp_trans_token || response.order_token || "",
    raw: response,
  };
}

async function queryOrder(appTransId) {
  if (!isConfigured()) {
    throw new Error("ZaloPay chưa được cấu hình");
  }
  if (!appTransId) {
    throw new Error("Thiếu mã giao dịch ZaloPay");
  }

  var macData = ZALOPAY_APP_ID + "|" + appTransId + "|" + ZALOPAY_KEY1;
  return postForm(ZALOPAY_QUERY_URL, {
    app_id: ZALOPAY_APP_ID,
    app_trans_id: appTransId,
    mac: hmacSha256(ZALOPAY_KEY1, macData),
  });
}

function isValidRedirectChecksum(params) {
  var checksum = params.checksum;
  if (!checksum) return false;

  var checksumData = [
    params.appid || "",
    params.apptransid || "",
    params.pmcid || "",
    params.bankcode || "",
    params.amount || "",
    params.discountamount || "",
    params.status || "",
  ].join("|");

  return hmacSha256(ZALOPAY_KEY2, checksumData).toLowerCase() === String(checksum).toLowerCase();
}

function isValidCallbackMac(data, mac) {
  if (!data || !mac) return false;
  return hmacSha256(ZALOPAY_KEY2, data).toLowerCase() === String(mac).toLowerCase();
}

function zaloResponse(returnCode, message) {
  return { return_code: returnCode, return_message: message };
}

module.exports = {
  isConfigured: isConfigured,
  buildAppTransId: buildAppTransId,
  createOrder: createOrder,
  queryOrder: queryOrder,
  isValidRedirectChecksum: isValidRedirectChecksum,
  isValidCallbackMac: isValidCallbackMac,
  zaloResponse: zaloResponse,
  getRedirectUrl: function () {
    return ZALOPAY_REDIRECT_URL;
  },
  getCallbackUrl: function () {
    return ZALOPAY_CALLBACK_URL;
  },
};
