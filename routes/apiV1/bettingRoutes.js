var express = require("express");
var controller = require("../../controllers/bettingController");

var router = express.Router();

router.post("/admin/races/:raceId/bet-market", controller.createMarket);
router.put("/admin/bet-markets/:id/open", controller.openMarket);
router.put("/admin/bet-markets/:id/close", controller.closeMarket);
router.get("/admin/bet-markets", controller.listMarkets);
router.get("/admin/bet-markets/:id/bets", controller.listMarketBets);
router.get("/races/:raceId/bet-market", controller.publicMarket);
router.get("/users/me/bettable-races", controller.bettableRaces);
router.post("/races/:raceId/bets", controller.placeBet);
router.get("/users/me/bets", controller.userBets);
router.get("/bets/:id", controller.userBet);

module.exports = router;
