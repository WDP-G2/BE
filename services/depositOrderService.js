var crypto = require("crypto");
var { DepositOrder } = require("../models/wallet");
var { apiError } = require("../utils/apiResponse");
var {
  getSystemWallet,
  getUserWallet,
  recordTransaction,
} = require("./walletLedger");
var zaloPay = require("./zaloPayService");

function generateReferenceCode() {
  return "DEP-" + crypto.randomBytes(8).toString("hex").toUpperCase();
}

function generateOrderCode() {
  return Math.floor(Date.now() % 1000000000);
}

function mapDepositOrder(order) {
  return {
    id: String(order._id),
    userId: order.userId ? String(order.userId) : null,
    amount: Number(order.amount || 0),
    currency: order.currency || "VND",
    provider: order.provider || order.paymentMethod || "MANUAL",
    status: order.status,
    paymentChannel: order.paymentChannel || "QR",
    depositTarget: order.depositTarget || "USER",
    referenceCode: order.referenceCode || "",
    providerTransactionId: order.providerTransactionId || "",
    orderCode: order.orderCode || null,
    paymentLinkId: order.paymentLinkId || "",
    checkoutUrl: order.checkoutUrl || "",
    cashierOrderUrl: order.cashierOrderUrl || "",
    orderUrl: order.orderUrl || "",
    qrCode: order.qrCode || "",
    transferContent: order.transferContent || "",
    paidAt: order.paidAt || null,
    expiredAt: order.expiredAt || null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

function resolveProvider(body) {
  var provider = String(body.provider || body.paymentMethod || "ZALOPAY").toUpperCase();
  if (provider !== "ZALOPAY") {
    throw apiError("Chỉ hỗ trợ thanh toán ZaloPay", 400);
  }
  return provider;
}

function validateAmount(amount) {
  var value = Number(amount || 0);
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
    throw apiError("Số tiền phải là số nguyên VND lớn hơn 0", 400);
  }
  return value;
}

async function creditPaidOrder(order) {
  if (order.status === "PAID") return order;

  var referenceId = order.referenceCode || String(order._id);
  var metadata = order.metadata || "";

  if (order.depositTarget === "SYSTEM") {
    var systemWallet = await getSystemWallet();
    await recordTransaction(systemWallet, {
      userId: order.userId,
      type: "DEPOSIT",
      amount: order.amount,
      referenceType: "DEPOSIT_ORDER",
      referenceId: referenceId,
      description: "Nạp quỹ hệ thống",
    });
  } else {
    var userWallet = await getUserWallet(order.userId);
    await recordTransaction(userWallet, {
      userId: order.userId,
      type: "DEPOSIT",
      amount: order.amount,
      referenceType: "DEPOSIT_ORDER",
      referenceId: referenceId,
      description: "Nạp tiền vào ví",
    });

    var adminWallet = await getSystemWallet();
    await recordTransaction(adminWallet, {
      userId: order.userId,
      type: "DEPOSIT",
      amount: order.amount,
      referenceType: "DEPOSIT_ORDER",
      referenceId: referenceId,
      description: "Nạp tiền người dùng vào quỹ hệ thống",
    });
  }

  order.status = "PAID";
  order.paidAt = new Date();
  order.metadata = metadata;
  await order.save();
  return order;
}

async function markOrderFailed(order, metadata) {
  if (order.status !== "PENDING") return order;
  order.status = "FAILED";
  if (metadata) {
    try {
      order.metadata = typeof metadata === "string" ? metadata : JSON.stringify(metadata);
    } catch {
      order.metadata = String(metadata);
    }
  }
  await order.save();
  return order;
}

async function syncPendingOrder(order) {
  if (!order || order.status !== "PENDING") return order;
  if (order.expiredAt && new Date(order.expiredAt) < new Date()) {
    order.status = "EXPIRED";
    await order.save();
    return order;
  }
  if (!order.paymentLinkId) return order;

  try {
    var queryResponse = await zaloPay.queryOrder(order.paymentLinkId);
    var returnCode = Number(queryResponse.return_code);

    if (returnCode === 1) {
      order.providerTransactionId = String(queryResponse.zp_trans_id || "");
      var paidAmount = Number(queryResponse.amount || 0);
      if (paidAmount && paidAmount !== Number(order.amount)) {
        throw apiError("Số tiền thanh toán không khớp", 400);
      }
      try {
        order.metadata = JSON.stringify(queryResponse);
      } catch {
        order.metadata = String(queryResponse);
      }
      return creditPaidOrder(order);
    }

    if (returnCode === 2) {
      return markOrderFailed(order, queryResponse);
    }
  } catch (err) {
    // Bỏ qua lỗi tạm khi poll — ZaloPay có thể chưa cập nhật
    if (err.status) throw err;
  }

  return order;
}

function normalizePaymentChannel(body) {
  var raw = String(body.paymentChannel || body.depositMethod || "QR").toUpperCase();
  if (raw === "VISA" || raw === "CARD" || raw === "INTERNATIONAL_CARD") return "VISA";
  if (raw === "WALLET" || raw === "ZALOPAY_WALLET") return "WALLET";
  return "QR";
}

var SANDBOX_TEST_CARDS = [
  {
    number: "4111111111111111",
    name: "NGUYEN VAN A",
    expiry: "01/25",
    cvv: "123",
  },
];

function normalizeCardNumber(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeCardName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function normalizeExpiry(value) {
  return String(value || "").trim();
}

function validateSandboxCard(body) {
  var number = normalizeCardNumber(body.cardNumber || body.number);
  var name = normalizeCardName(body.cardName || body.cardHolder || body.name);
  var expiry = normalizeExpiry(body.expiry || body.expireDate);
  var cvv = String(body.cvv || body.cvc || "").trim();

  if (!number || !name || !expiry || !cvv) {
    throw apiError("Vui lòng nhập đầy đủ thông tin thẻ", 400);
  }

  var matched = SANDBOX_TEST_CARDS.some(function (card) {
    return (
      card.number === number &&
      card.name === name &&
      card.expiry === expiry &&
      card.cvv === cvv
    );
  });

  if (!matched) {
    throw apiError(
      "Thẻ test không hợp lệ. Dùng: 4111111111111111 | NGUYEN VAN A | 01/25 | 123",
      400,
    );
  }

  return { number: number, name: name, expiry: expiry, cvv: cvv };
}

async function confirmCardDepositOrder(orderId, body, options) {
  var order = await DepositOrder.findById(orderId).exec();
  if (!order) throw apiError("Không tìm thấy lệnh nạp", 404);

  if (options.depositTarget && order.depositTarget !== options.depositTarget) {
    throw apiError("Không tìm thấy lệnh nạp", 404);
  }
  if (options.userId && String(order.userId) !== String(options.userId)) {
    throw apiError("Không tìm thấy lệnh nạp", 404);
  }
  if (order.paymentChannel !== "VISA") {
    throw apiError("Lệnh này không hỗ trợ thanh toán thẻ trực tiếp", 400);
  }
  if (order.status === "PAID") return mapDepositOrder(order);
  if (order.status !== "PENDING") throw apiError("Lệnh nạp không thể thanh toán", 400);
  if (order.expiredAt && new Date(order.expiredAt) < new Date()) {
    order.status = "EXPIRED";
    await order.save();
    throw apiError("Lệnh nạp đã hết hạn", 400);
  }

  var card = validateSandboxCard(body || {});
  order.providerTransactionId = "CARD-" + Date.now();
  try {
    order.metadata = JSON.stringify({
      method: "SANDBOX_VISA",
      cardLast4: card.number.slice(-4),
      cardName: card.name,
    });
  } catch {
    order.metadata = "SANDBOX_VISA";
  }

  order = await creditPaidOrder(order);
  return mapDepositOrder(order);
}

async function createZaloPayDepositOrder(options) {
  var amount = validateAmount(options.amount);
  var provider = resolveProvider(options.body || {});
  var paymentChannel = normalizePaymentChannel(options.body || {});
  var depositTarget = options.depositTarget === "SYSTEM" ? "SYSTEM" : "USER";
  var wallet = options.wallet;
  var userId = options.userId;
  var appUser = options.appUser || "hoser";

  var orderCode = generateOrderCode();
  var referenceCode = generateReferenceCode();
  var expiredAt = new Date(Date.now() + 30 * 60 * 1000);

  var order = await DepositOrder.create({
    walletId: wallet._id,
    userId: userId,
    amount: amount,
    currency: "VND",
    status: "PENDING",
    provider: provider,
    paymentMethod: provider,
    paymentChannel: paymentChannel,
    depositTarget: depositTarget,
    orderCode: orderCode,
    referenceCode: referenceCode,
    transferContent: "HOSER deposit order " + orderCode,
    paymentLinkId: paymentChannel === "VISA" ? "" : zaloPay.buildAppTransId(orderCode),
    expiredAt: expiredAt,
    note: depositTarget === "SYSTEM" ? "Admin nạp quỹ hệ thống" : "Nạp tiền ví người dùng",
  });

  if (paymentChannel === "VISA") {
    await order.save();
    return mapDepositOrder(order);
  }

  if (!zaloPay.isConfigured()) {
    throw apiError(
      "ZaloPay chưa được cấu hình. Thêm ZALOPAY_APP_ID, ZALOPAY_KEY1, ZALOPAY_KEY2 vào file .env của BE",
      500,
    );
  }

  try {
    var zaloResult = await zaloPay.createOrder(order, appUser, paymentChannel);
    order.paymentLinkId = zaloResult.appTransId;
    order.checkoutUrl = zaloResult.checkoutUrl;
    order.cashierOrderUrl = zaloResult.cashierOrderUrl || zaloResult.checkoutUrl;
    order.orderUrl = zaloResult.orderUrl || zaloResult.checkoutUrl || "";
    order.qrCode = zaloResult.qrCode;
    order.transferContent = order.transferContent || "HOSER deposit order " + order.orderCode;
    try {
      order.metadata = JSON.stringify(zaloResult.raw);
    } catch {
      order.metadata = "";
    }
    await order.save();
  } catch (err) {
    order.status = "FAILED";
    order.note = err.message || "Tạo lệnh ZaloPay thất bại";
    await order.save();
    throw apiError(err.message || "Không tạo được lệnh ZaloPay", 502);
  }

  return mapDepositOrder(order);
}

async function findOrderByPaymentLinkId(appTransId) {
  return DepositOrder.findOne({ paymentLinkId: appTransId }).exec();
}

async function processZaloPayPaid(appTransId, providerTransactionId, amount, metadata) {
  var order = await findOrderByPaymentLinkId(appTransId);
  if (!order) throw apiError("Không tìm thấy lệnh nạp", 404);
  if (order.status === "PAID") return order;
  if (order.status === "CANCELLED" || order.status === "EXPIRED") return order;

  if (amount != null && Number(amount) !== Number(order.amount)) {
    throw apiError("Số tiền thanh toán không khớp", 400);
  }

  order.providerTransactionId = providerTransactionId || order.providerTransactionId;
  if (metadata) {
    try {
      order.metadata = typeof metadata === "string" ? metadata : JSON.stringify(metadata);
    } catch {
      order.metadata = String(metadata);
    }
  }

  return creditPaidOrder(order);
}

async function processZaloPayFailed(appTransId, metadata) {
  var order = await findOrderByPaymentLinkId(appTransId);
  if (!order) return null;
  return markOrderFailed(order, metadata);
}

module.exports = {
  mapDepositOrder: mapDepositOrder,
  createZaloPayDepositOrder: createZaloPayDepositOrder,
  confirmCardDepositOrder: confirmCardDepositOrder,
  syncPendingOrder: syncPendingOrder,
  processZaloPayPaid: processZaloPayPaid,
  processZaloPayFailed: processZaloPayFailed,
  findOrderByPaymentLinkId: findOrderByPaymentLinkId,
};
