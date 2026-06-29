var express = require("express");
var router = express.Router();

router.use("/users", require("./users"));
router.use("/role-applications", require("./roleApplications"));
router.use("/dashboard", require("./dashboard"));
router.use("/horses", require("./horses"));
router.use("/wallet", require("./wallet"));
router.use("/bet-markets", require("./betMarkets"));
router.use("/referee-salary-configs", require("./refereeSalaryConfigs"));
router.use("/", require("./settings"));
router.use("/", require("./races"));

module.exports = router;
