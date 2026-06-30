var api = require("../utils/apiResponse");
var paymentService = require("../services/paymentService");
var walletService = require("../services/walletService");

async function currentWallet(req, res, next) {
  try {
    var user = await paymentService.currentUserOrThrow(req);
    return api.ok(res, await walletService.getCurrentUserWallet(user._id));
  } catch (err) {
    next(err);
  }
}

async function currentTransactions(req, res, next) {
  try {
    var user = await paymentService.currentUserOrThrow(req);
    return api.ok(res, await walletService.getCurrentUserTransactions(user._id));
  } catch (err) {
    next(err);
  }
}

async function adminWallet(req, res, next) {
  try {
    return api.ok(res, await walletService.getAdminWallet());
  } catch (err) {
    next(err);
  }
}

async function adminTransactions(req, res, next) {
  try {
    return api.ok(res, await walletService.getAdminWalletTransactions());
  } catch (err) {
    next(err);
  }
}

module.exports = {
  adminTransactions: adminTransactions,
  adminWallet: adminWallet,
  currentTransactions: currentTransactions,
  currentWallet: currentWallet,
};
