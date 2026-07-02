var express = require("express");
var router = express.Router();
var { authenticate, requireRole } = require("../../middleware/auth");

router.use("/users", require("./users"));
router.use("/role-applications", require("./roleApplications"));
router.use("/dashboard", require("./dashboard"));
router.use("/horses", require("./horses"));
router.use("/wallet", require("./wallet"));
router.use("/bet-markets", require("./betMarkets"));
router.use("/referee-salary-configs", require("./refereeSalaryConfigs"));
router.use(
  "/tournaments",
  authenticate,
  requireRole("ADMIN"),
  require("../tournaments"),
);
router.use("/tournament-banners", require("./tournamentBanners"));
router.use("/news", require("../news"));
router.use("/", require("./settings"));
router.use("/", require("./races"));

module.exports = router;
