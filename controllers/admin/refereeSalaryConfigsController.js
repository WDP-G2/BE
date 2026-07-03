var RefereeSalaryConfig = require("../../models/refereeSalaryConfig");
var { apiSuccess, apiError } = require("../../utils/apiResponse");

function mapConfig(item) {
  return {
    id: String(item._id),
    name: item.name,
    raceType: item.raceType,
    amount: Number(item.amount || 0),
    active: item.active !== false,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

async function list(req, res) {
  var rows = await RefereeSalaryConfig.find({}).sort({ createdAt: -1 }).exec();
  res.json(apiSuccess(rows.map(mapConfig)));
}

async function create(req, res) {
  var amount = Number(req.body.amount || 0);
  if (amount <= 0) throw apiError("Mức lương phải lớn hơn 0", 400);
  var item = await RefereeSalaryConfig.create({
    name: req.body.name || "Lương trọng tài mặc định",
    raceType: req.body.raceType || "Chung",
    amount: Number(req.body.amount || 0),
    active: req.body.active !== false,
  });
  res.status(201).json(apiSuccess(mapConfig(item), "Tạo cấu hình lương thành công"));
}

async function getById(req, res) {
  var item = await RefereeSalaryConfig.findById(req.params.id).exec();
  if (!item) throw apiError("Không tìm thấy cấu hình", 404);
  res.json(apiSuccess(mapConfig(item)));
}

async function update(req, res) {
  if (req.body.amount != null && Number(req.body.amount) <= 0) {
    throw apiError("Mức lương phải lớn hơn 0", 400);
  }
  var item = await RefereeSalaryConfig.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true }).exec();
  if (!item) throw apiError("Không tìm thấy cấu hình", 404);
  res.json(apiSuccess(mapConfig(item), "Cập nhật cấu hình thành công"));
}

async function remove(req, res) {
  await RefereeSalaryConfig.findByIdAndDelete(req.params.id).exec();
  res.json(apiSuccess(null, "Xóa cấu hình thành công"));
}

module.exports = {
  list: list,
  create: create,
  getById: getById,
  update: update,
  remove: remove,
};
