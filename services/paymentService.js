var crypto = require("crypto");
var PaymentOrder = require("../models/paymentOrder");
var PaymentCallbackLog = require("../models/paymentCallbackLog");
var authService = require("./authService");
var walletService = require("./walletService");

var CALLBACK_TOKEN = process.env.PAYMENT_CALLBACK_TOKEN || "dev-callback-token";
var ZALOPAY_KEY2 = process.env.ZALOPAY_KEY2 || process.env.ZALO_PAY_KEY2 || "";

function validateAmount(amount) {
  var value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    var err = new Error("Amount must be greater than zero");
    err.status = 400;
    throw err;
  }
  if (!Number.isInteger(value)) {
    var integer = new Error("Amount must be a whole VND amount");
    integer.status = 400;
    throw integer;
  }
  return value;
}

function validateCurrency(currency) {
  if (currency && String(currency).toUpperCase() !== "VND") {
    var err = new Error("Only VND currency is supported");
    err.status = 400;
    throw err;
  }
}

function validateProvider(provider) {
  if (provider && provider !== "ZALOPAY") {
    var err = new Error("Only ZALOPAY provider is supported");
    err.status = 400;
    throw err;
  }
}

function referenceCode() {
  return "DEP-" + crypto.randomBytes(8).toString("hex").toUpperCase();
}

function mapOrder(order) {
  if (!order) return null;
  return {
    id: String(order._id),
    userId: String(order.userId),
    amount: order.amount,
    currency: order.currency,
    provider: order.provider,
    status: order.status,
    depositTarget: order.depositTarget || "USER_WALLET",
    referenceCode: order.referenceCode,
    providerTransactionId: order.providerTransactionId || "",
    orderCode: order.orderCode || "",
    paymentLinkId: order.paymentLinkId || "",
    checkoutUrl: order.checkoutUrl || "",
    qrCode: order.qrCode || "",
    transferContent: order.transferContent || "",
    paidAt: order.paidAt || null,
    expiredAt: order.expiredAt || null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

function mapCallbackLog(log) {
  return {
    id: String(log._id),
    referenceCode: log.referenceCode,
    providerTransactionId: log.providerTransactionId,
    status: log.status,
    validToken: log.validToken,
    processed: log.processed,
    errorMessage: log.errorMessage,
    metadata: log.metadata,
    createdAt: log.createdAt,
  };
}

async function createDepositOrder(user, payload, target) {
  var amount = validateAmount(payload.amount);
  validateCurrency(payload.currency);
  validateProvider(payload.provider);

  var code = referenceCode();
  var order = await PaymentOrder.create({
    userId: user._id || user.id || user.userId,
    amount: amount,
    currency: "VND",
    provider: "ZALOPAY",
    status: "PENDING",
    depositTarget: target || "USER_WALLET",
    referenceCode: code,
    orderCode: Date.now().toString(),
    paymentLinkId: code,
    checkoutUrl: payload.checkoutUrl || undefined,
    qrCode: payload.qrCode || undefined,
    transferContent: "HORSE " + code,
    expiredAt: new Date(Date.now() + 30 * 60 * 1000),
    createdBy: user.username || user.email || "SYSTEM",
    updatedBy: user.username || user.email || "SYSTEM",
  });

  return mapOrder(order);
}

async function listUserOrders(userId) {
  var orders = await PaymentOrder.find({ userId: userId }).sort({ createdAt: -1 }).exec();
  return orders.map(mapOrder);
}

async function getUserOrder(userId, orderId) {
  return mapOrder(await PaymentOrder.findOne({ _id: orderId, userId: userId }).exec());
}

async function listAdminWalletOrders() {
  var orders = await PaymentOrder.find({ depositTarget: "ADMIN_WALLET" })
    .sort({ createdAt: -1 })
    .exec();
  return orders.map(mapOrder);
}

async function getAdminWalletOrder(orderId) {
  return mapOrder(
    await PaymentOrder.findOne({ _id: orderId, depositTarget: "ADMIN_WALLET" }).exec(),
  );
}

async function listAdminOrders() {
  var orders = await PaymentOrder.find({}).sort({ createdAt: -1 }).exec();
  return orders.map(mapOrder);
}

async function getAdminOrder(orderId) {
  return mapOrder(await PaymentOrder.findById(orderId).exec());
}

async function recordCallback(payload, validToken, processed, errorMessage) {
  return PaymentCallbackLog.create({
    referenceCode: payload.referenceCode || payload.appTransId || "ZALOPAY_UNKNOWN",
    providerTransactionId: payload.providerTransactionId || payload.zpTransId || "",
    status: payload.status || "",
    callbackToken: payload.callbackToken || "",
    metadata: payload.metadata ? JSON.stringify(payload.metadata) : JSON.stringify(payload),
    validToken: Boolean(validToken),
    processed: Boolean(processed),
    errorMessage: errorMessage || "",
  });
}

function metadataJson(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value || {});
  } catch (err) {
    return "{}";
  }
}

function hmacSha256(key, data) {
  return crypto.createHmac("sha256", key || "").update(String(data || "")).digest("hex");
}

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function appTransIdFromParams(params) {
  return firstValue(params.apptransid || params.app_trans_id || params.appTransId || params.app_transid || params.paymentLinkId);
}

function findAmount(value) {
  var amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function normalizeZaloPayData(payload) {
  if (payload && payload.data && typeof payload.data === "string") {
    try {
      return JSON.parse(payload.data);
    } catch (err) {
      return null;
    }
  }
  return payload || {};
}

function isValidZaloPayRedirect(params) {
  if (!ZALOPAY_KEY2) return true;
  var checksum = firstValue(params.checksum);
  if (!checksum) return false;
  var checksumData = [
    firstValue(params.appid) || "",
    firstValue(params.apptransid) || "",
    firstValue(params.pmcid) || "",
    firstValue(params.bankcode) || "",
    firstValue(params.amount) || "",
    firstValue(params.discountamount) || "",
    firstValue(params.status) || "",
  ].join("|");
  return hmacSha256(ZALOPAY_KEY2, checksumData).toLowerCase() === String(checksum).toLowerCase();
}

function isValidZaloPayCallback(payload) {
  if (!ZALOPAY_KEY2) return true;
  if (!payload || !payload.data || !payload.mac) return false;
  return hmacSha256(ZALOPAY_KEY2, payload.data).toLowerCase() === String(payload.mac).toLowerCase();
}

async function creditDeposit(order, metadata, note) {
  var referenceId = order.referenceCode;
  if ((order.depositTarget || "USER_WALLET") === "USER_WALLET") {
    await walletService.credit(
      order.userId,
      order.amount,
      "DEPOSIT",
      "DEPOSIT_ORDER",
      referenceId,
      "deposit:user:" + referenceId,
      metadata || "",
      note || "Deposit paid",
    );
  }
  await walletService.creditAdmin(
    order.amount,
    "DEPOSIT",
    "DEPOSIT_ORDER",
    referenceId,
    "deposit:admin:" + referenceId,
    metadata || "",
    note || "Deposit paid",
  );
}

async function processZaloPayPaid(appTransId, providerTransactionId, amount, metadata, note) {
  var order = await PaymentOrder.findOne({ paymentLinkId: appTransId }).exec();
  if (!order) {
    await recordCallback({ referenceCode: appTransId, providerTransactionId: providerTransactionId, status: "PAID", metadata: metadata }, true, false, "Payment order not found");
    return { return_code: 0, return_message: "Payment order not found" };
  }
  if (amount != null && Number(order.amount) !== Number(amount)) {
    await recordCallback({ referenceCode: appTransId, providerTransactionId: providerTransactionId, status: "PAID", metadata: metadata }, true, false, "Invalid amount");
    return { return_code: 0, return_message: "Invalid amount" };
  }
  if (order.status === "PAID") {
    await recordCallback({ referenceCode: appTransId, providerTransactionId: providerTransactionId, status: "PAID", metadata: metadata }, true, true, "");
    return { return_code: 1, return_message: "success", order: mapOrder(order) };
  }
  if (order.status === "CANCELLED" || order.status === "EXPIRED") {
    await recordCallback({ referenceCode: appTransId, providerTransactionId: providerTransactionId, status: "PAID", metadata: metadata }, true, false, "Order cannot be updated from status " + order.status);
    return { return_code: 0, return_message: "Order cannot be updated from status " + order.status };
  }
  await creditDeposit(order, metadataJson(metadata), note || "ZaloPay paid");
  order.status = "PAID";
  order.providerTransactionId = providerTransactionId || order.providerTransactionId;
  order.metadata = metadataJson(metadata);
  order.paidAt = new Date();
  await order.save();
  await recordCallback({ referenceCode: appTransId, providerTransactionId: providerTransactionId, status: "PAID", metadata: metadata }, true, true, "");
  return { return_code: 1, return_message: "success", order: mapOrder(order) };
}

async function processZaloPayFailed(appTransId, metadata) {
  var order = await PaymentOrder.findOne({ paymentLinkId: appTransId }).exec();
  if (!order) {
    await recordCallback({ referenceCode: appTransId, status: "FAILED", metadata: metadata }, true, false, "Payment order not found");
    return { return_code: 0, return_message: "Payment order not found" };
  }
  if (order.status === "PENDING") {
    order.status = "FAILED";
    order.metadata = metadataJson(metadata);
    await order.save();
  }
  await recordCallback({ referenceCode: appTransId, status: "FAILED", metadata: metadata }, true, true, "");
  return { return_code: 2, return_message: "failed", order: mapOrder(order) };
}

async function handleDepositCallback(payload) {
  if (payload.callbackToken !== CALLBACK_TOKEN) {
    await recordCallback(payload, false, false, "Invalid payment callback token");
    var invalid = new Error("Invalid payment callback token");
    invalid.status = 400;
    throw invalid;
  }

  var order = await PaymentOrder.findOne({ referenceCode: payload.referenceCode }).exec();
  if (!order) {
    await recordCallback(payload, true, false, "Payment order not found");
    var missing = new Error("Payment order not found");
    missing.status = 404;
    throw missing;
  }

  if (order.status === "PAID") {
    await recordCallback(payload, true, true, "");
    return mapOrder(order);
  }
  if (order.status === "CANCELLED" || order.status === "EXPIRED") {
    await recordCallback(payload, true, false, "Payment order cannot be paid from status " + order.status);
    var blocked = new Error("Payment order cannot be paid from status " + order.status);
    blocked.status = 400;
    throw blocked;
  }

  if (payload.status === "FAILED" || payload.status === "CANCELLED") {
    order.status = payload.status;
    if (payload.providerTransactionId) {
      order.providerTransactionId = payload.providerTransactionId;
    }
    order.metadata = payload.metadata || "";
    await order.save();
    await recordCallback(payload, true, true, "");
    return mapOrder(order);
  }

  if (payload.status !== "PAID") {
    await recordCallback(payload, true, false, "Unsupported callback status: " + payload.status);
    var unsupported = new Error("Unsupported callback status: " + payload.status);
    unsupported.status = 400;
    throw unsupported;
  }

  await creditDeposit(order, payload.metadata || "", "Deposit paid");
  order.status = "PAID";
  if (payload.providerTransactionId) {
    order.providerTransactionId = payload.providerTransactionId;
  }
  order.metadata = payload.metadata || "";
  order.paidAt = new Date();
  await order.save();
  await recordCallback(payload, true, true, "");
  return mapOrder(order);
}

async function handleZaloPayReturn(params) {
  var appTransId = appTransIdFromParams(params || {});
  if (!isValidZaloPayRedirect(params || {})) {
    await recordCallback({ referenceCode: appTransId || "ZALOPAY_UNKNOWN", status: "FAILED", metadata: params }, false, false, "Invalid ZaloPay redirect checksum");
    return { return_code: 2, return_message: "Invalid checksum" };
  }
  if (!appTransId) {
    await recordCallback({ referenceCode: "ZALOPAY_UNKNOWN", status: "FAILED", metadata: params }, true, false, "ZaloPay transaction reference is required");
    return { return_code: 0, return_message: "ZaloPay transaction reference is required" };
  }
  var status = String(firstValue(params.status || params.return_code || "") || "");
  if (status === "1" || status.toUpperCase() === "PAID" || status.toUpperCase() === "SUCCESS") {
    return processZaloPayPaid(appTransId, firstValue(params.zptransid || params.zp_trans_id), findAmount(firstValue(params.amount)), params, "ZaloPay return paid");
  }
  if (status === "-49" || status === "2" || status.toUpperCase() === "FAILED" || status.toUpperCase() === "CANCELLED") {
    return processZaloPayFailed(appTransId, params);
  }
  var order = await PaymentOrder.findOne({ paymentLinkId: appTransId }).exec();
  return { return_code: 3, return_message: "pending", order: mapOrder(order) };
}

async function handleZaloPayCallback(payload) {
  if (!isValidZaloPayCallback(payload || {})) {
    await recordCallback({ referenceCode: "ZALOPAY_UNKNOWN", status: "FAILED", metadata: payload }, false, false, "Invalid ZaloPay callback mac");
    return { return_code: 2, return_message: "Invalid" };
  }
  var data = normalizeZaloPayData(payload);
  if (!data) {
    await recordCallback({ referenceCode: "ZALOPAY_UNKNOWN", status: "FAILED", metadata: payload }, true, false, "Invalid ZaloPay callback data");
    return { return_code: 0, return_message: "Invalid callback data" };
  }
  var appTransId = data.app_trans_id || data.apptransid || data.appTransId || data.paymentLinkId;
  var providerTransactionId = data.zp_trans_id || data.zptransid || data.providerTransactionId || "";
  var amount = findAmount(data.amount);
  return processZaloPayPaid(appTransId, providerTransactionId, amount, data, "ZaloPay callback paid");
}

async function listCallbackLogs() {
  var logs = await PaymentCallbackLog.find({}).sort({ createdAt: -1 }).exec();
  return logs.map(mapCallbackLog);
}

async function currentUserOrThrow(req) {
  var user = await authService.currentUser(req);
  if (!user || !user._id) {
    var err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }
  return user;
}

module.exports = {
  createDepositOrder: createDepositOrder,
  currentUserOrThrow: currentUserOrThrow,
  getAdminOrder: getAdminOrder,
  getAdminWalletOrder: getAdminWalletOrder,
  getUserOrder: getUserOrder,
  handleDepositCallback: handleDepositCallback,
  handleZaloPayCallback: handleZaloPayCallback,
  handleZaloPayReturn: handleZaloPayReturn,
  listAdminOrders: listAdminOrders,
  listAdminWalletOrders: listAdminWalletOrders,
  listCallbackLogs: listCallbackLogs,
  listUserOrders: listUserOrders,
  mapOrder: mapOrder,
};
