var express = require("express");
var router = express.Router();
var { authenticate, requireRole } = require("../middleware/auth");
var asyncHandler = require("../utils/asyncHandler");
var bettingController = require("../controllers/bettingController");

router.get("/:raceId/bet-market", asyncHandler(bettingController.getPublicMarket));
router.get("/:raceId/results", asyncHandler(bettingController.getRaceResults));
router.post(
  "/:raceId/bets",
  authenticate,
  requireRole("SPECTATOR"),
  asyncHandler(bettingController.placeBet),
);

var userRouter = express.Router();
userRouter.use(authenticate);

userRouter.get("/me/bettable-races", asyncHandler(bettingController.getBettableRaces));
userRouter.get("/me/bets", asyncHandler(bettingController.getMyBets));

module.exports = { racesRouter: router, usersBettingRouter: userRouter };
