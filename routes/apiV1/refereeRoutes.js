var express = require("express");
var controller = require("../../controllers/refereeController");

var router = express.Router();

router.post("/admin/referee-invitations", controller.createInvitation);
router.get("/admin/referee-invitations", controller.adminInvitations);
router.get("/admin/referee-invitations/:id", controller.getInvitation);
router.put("/admin/referee-invitations/:id/cancel", controller.cancelInvitation);
router.get("/referee/invitations", controller.refereeInvitations);
router.get("/referee/invitations/:id", controller.getInvitation);
router.put("/referee/invitations/:id/accept", controller.acceptInvitation);
router.put("/referee/invitations/:id/reject", controller.rejectInvitation);

router.post("/admin/referee-salary-configs", controller.createSalaryConfig);
router.get("/admin/referee-salary-configs", controller.salaryConfigs);
router.get("/admin/referee-salary-configs/:id", controller.getSalaryConfig);
router.put("/admin/referee-salary-configs/:id", controller.updateSalaryConfig);
router.delete("/admin/referee-salary-configs/:id", controller.deleteSalaryConfig);

module.exports = router;
