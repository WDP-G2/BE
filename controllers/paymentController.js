var api = require("../utils/apiResponse");
var paymentService = require("../services/paymentService");

async function createUserDeposit(req, res, next) {
  try {
    var user = await paymentService.currentUserOrThrow(req);
    return api.ok(
      res,
      await paymentService.createDepositOrder(user, req.body || {}, "USER_WALLET"),
      "Deposit order created",
    );
  } catch (err) {
    next(err);
  }
}

async function listUserDeposits(req, res, next) {
  try {
    var user = await paymentService.currentUserOrThrow(req);
    return api.ok(res, await paymentService.listUserOrders(user._id));
  } catch (err) {
    next(err);
  }
}

async function getUserDeposit(req, res, next) {
  try {
    var user = await paymentService.currentUserOrThrow(req);
    var order = await paymentService.getUserOrder(user._id, req.params.id);
    return order ? api.ok(res, order) : api.fail(res, 404, "Payment order not found");
  } catch (err) {
    next(err);
  }
}

async function createAdminDeposit(req, res, next) {
  try {
    var user = await paymentService.currentUserOrThrow(req);
    return api.ok(
      res,
      await paymentService.createDepositOrder(user, req.body || {}, "ADMIN_WALLET"),
      "Deposit order created",
    );
  } catch (err) {
    next(err);
  }
}

async function listAdminWalletDeposits(req, res, next) {
  try {
    return api.ok(res, await paymentService.listAdminWalletOrders());
  } catch (err) {
    next(err);
  }
}

async function getAdminWalletDeposit(req, res, next) {
  try {
    var order = await paymentService.getAdminWalletOrder(req.params.id);
    return order ? api.ok(res, order) : api.fail(res, 404, "Payment order not found");
  } catch (err) {
    next(err);
  }
}

async function callback(req, res, next) {
  try {
    return api.ok(res, await paymentService.handleDepositCallback(req.body || {}));
  } catch (err) {
    next(err);
  }
}

async function listAdminOrders(req, res, next) {
  try {
    return api.ok(res, await paymentService.listAdminOrders());
  } catch (err) {
    next(err);
  }
}

async function getAdminOrder(req, res, next) {
  try {
    var order = await paymentService.getAdminOrder(req.params.id);
    return order ? api.ok(res, order) : api.fail(res, 404, "Payment order not found");
  } catch (err) {
    next(err);
  }
}

async function listCallbackLogs(req, res, next) {
  try {
    return api.ok(res, await paymentService.listCallbackLogs());
  } catch (err) {
    next(err);
  }
}

module.exports = {
  callback: callback,
  createAdminDeposit: createAdminDeposit,
  createUserDeposit: createUserDeposit,
  getAdminOrder: getAdminOrder,
  getAdminWalletDeposit: getAdminWalletDeposit,
  getUserDeposit: getUserDeposit,
  listAdminOrders: listAdminOrders,
  listAdminWalletDeposits: listAdminWalletDeposits,
  listCallbackLogs: listCallbackLogs,
  listUserDeposits: listUserDeposits,
};
