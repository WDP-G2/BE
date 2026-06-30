var api = require("../utils/apiResponse");
var withdrawalService = require("../services/withdrawalService");

async function createUserWithdrawal(req, res, next) {
  try {
    var user = await withdrawalService.currentUserOrThrow(req);
    return api.ok(
      res,
      await withdrawalService.createUserWithdrawal(user, req.body || {}),
      "Withdrawal created",
    );
  } catch (err) {
    next(err);
  }
}

async function listUserWithdrawals(req, res, next) {
  try {
    var user = await withdrawalService.currentUserOrThrow(req);
    return api.ok(res, await withdrawalService.listUserWithdrawals(user._id));
  } catch (err) {
    next(err);
  }
}

async function getUserWithdrawal(req, res, next) {
  try {
    var user = await withdrawalService.currentUserOrThrow(req);
    var item = await withdrawalService.getUserWithdrawal(user._id, req.params.id);
    return item ? api.ok(res, item) : api.fail(res, 404, "Withdrawal not found");
  } catch (err) {
    next(err);
  }
}

async function listAdminWithdrawals(req, res, next) {
  try {
    return api.ok(res, await withdrawalService.listAdminWithdrawals(req.query.status));
  } catch (err) {
    next(err);
  }
}

async function getAdminWithdrawal(req, res, next) {
  try {
    var item = await withdrawalService.getAdminWithdrawal(req.params.id);
    return item ? api.ok(res, item) : api.fail(res, 404, "Withdrawal not found");
  } catch (err) {
    next(err);
  }
}

async function approve(req, res, next) {
  try {
    var admin = await withdrawalService.currentUserOrThrow(req);
    return api.ok(
      res,
      await withdrawalService.approve(req.params.id, admin, req.body || {}),
      "Withdrawal approved",
    );
  } catch (err) {
    next(err);
  }
}

async function reject(req, res, next) {
  try {
    var admin = await withdrawalService.currentUserOrThrow(req);
    return api.ok(
      res,
      await withdrawalService.reject(req.params.id, admin, req.body || {}),
      "Withdrawal rejected",
    );
  } catch (err) {
    next(err);
  }
}

async function markPaid(req, res, next) {
  try {
    var admin = await withdrawalService.currentUserOrThrow(req);
    return api.ok(
      res,
      await withdrawalService.markPaid(req.params.id, admin, req.body || {}),
      "Withdrawal marked paid",
    );
  } catch (err) {
    next(err);
  }
}

async function createAdminWithdrawal(req, res, next) {
  try {
    var admin = await withdrawalService.currentUserOrThrow(req);
    return api.ok(
      res,
      await withdrawalService.createAdminWithdrawal(admin, req.body || {}),
      "Admin wallet withdrawal created",
    );
  } catch (err) {
    next(err);
  }
}

async function listAdminWalletWithdrawals(req, res, next) {
  try {
    return api.ok(res, await withdrawalService.listAdminWalletWithdrawals());
  } catch (err) {
    next(err);
  }
}

module.exports = {
  approve: approve,
  createAdminWithdrawal: createAdminWithdrawal,
  createUserWithdrawal: createUserWithdrawal,
  getAdminWithdrawal: getAdminWithdrawal,
  getUserWithdrawal: getUserWithdrawal,
  listAdminWalletWithdrawals: listAdminWalletWithdrawals,
  listAdminWithdrawals: listAdminWithdrawals,
  listUserWithdrawals: listUserWithdrawals,
  markPaid: markPaid,
  reject: reject,
};
