var express = require("express");
var multer = require("multer");
var controller = require("../../controllers/newsController");

var router = express.Router();
var upload = multer({ storage: multer.memoryStorage() });

router.post("/admin/news", upload.any(), controller.create);
router.put("/admin/news/:id", upload.any(), controller.update);
router.delete("/admin/news/:id", controller.remove);
router.get("/admin/news", controller.listAll);
router.get("/admin/news/:id", controller.get);
router.get("/news", controller.listPublic);
router.get("/news/all", controller.listAll);
router.get("/news/:id", controller.get);

module.exports = router;
