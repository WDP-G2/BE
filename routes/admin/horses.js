var express = require("express");
var router = express.Router();
var Horse = require("../../models/horse");
var { authenticate, requireRole } = require("../../middleware/auth");
var asyncHandler = require("../../utils/asyncHandler");
var { apiSuccess, apiError } = require("../../utils/apiResponse");

router.use(authenticate, requireRole("ADMIN"));

var STATUS_LABELS = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Từ chối",
  SUSPENDED: "Tạm khóa",
};

function mapHorse(horse) {
  return {
    id: String(horse._id),
    name: horse.name,
    slug: horse.slug,
    breed: horse.breed,
    ownerName: horse.ownerName,
    ownerId: horse.ownerId ? String(horse.ownerId) : null,
    approvalStatus: horse.approvalStatus || "APPROVED",
    status: STATUS_LABELS[horse.approvalStatus] || horse.approvalStatus,
    statusCode: horse.approvalStatus || "APPROVED",
    reviewReason: horse.notes || "",
    racingStatus: horse.racingStatus,
    imageUrl: horse.imageUrl,
    healthStatus: horse.healthStatus,
    wins: horse.wins || 0,
    races: horse.races || 0,
    createdAt: horse.createdAt,
    updatedAt: horse.updatedAt,
  };
}

router.get(
  "/",
  asyncHandler(async function (req, res) {
    var filter = {};
    if (req.query.status) filter.approvalStatus = String(req.query.status).toUpperCase();
    var horses = await Horse.find(filter).sort({ updatedAt: -1 }).exec();
    res.json(apiSuccess(horses.map(mapHorse)));
  }),
);

router.put(
  "/:id/approve",
  asyncHandler(async function (req, res) {
    var horse = await Horse.findByIdAndUpdate(
      req.params.id,
      { $set: { approvalStatus: "APPROVED", racingStatus: "can-race", updatedBy: req.user.id } },
      { new: true },
    ).exec();
    if (!horse) throw apiError("Không tìm thấy ngựa", 404);
    res.json(apiSuccess(mapHorse(horse), "Duyệt ngựa thành công"));
  }),
);

router.put(
  "/:id/reject",
  asyncHandler(async function (req, res) {
    var horse = await Horse.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          approvalStatus: "REJECTED",
          racingStatus: "cannot-race",
          notes: req.body.reason || req.body.note || "Không đạt yêu cầu duyệt",
          updatedBy: req.user.id,
        },
      },
      { new: true },
    ).exec();
    if (!horse) throw apiError("Không tìm thấy ngựa", 404);
    res.json(apiSuccess(mapHorse(horse), "Từ chối ngựa thành công"));
  }),
);

router.put(
  "/:id/suspend",
  asyncHandler(async function (req, res) {
    var horse = await Horse.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          approvalStatus: "SUSPENDED",
          racingStatus: "cannot-race",
          notes: req.body.reason || req.body.note || "Tạm khóa bởi admin",
          updatedBy: req.user.id,
        },
      },
      { new: true },
    ).exec();
    if (!horse) throw apiError("Không tìm thấy ngựa", 404);
    res.json(apiSuccess(mapHorse(horse), "Tạm ngưng ngựa thành công"));
  }),
);

module.exports = router;
