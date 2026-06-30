var api = require("../utils/apiResponse");
var compat = require("../services/compatService");

function list(collection) {
  return function (req, res) {
    return api.ok(res, compat.list(collection));
  };
}

function get(collection, paramName) {
  return function (req, res) {
    return api.ok(res, compat.get(collection, req.params[paramName || "id"]));
  };
}

function create(collection, defaults, message) {
  return function (req, res) {
    return api.ok(
      res,
      compat.create(collection, Object.assign({}, req.body || {}, req.params || {}), defaults),
      message || "Created successfully",
    );
  };
}

function update(collection, status, message, paramName) {
  return function (req, res) {
    return api.ok(
      res,
      compat.update(collection, req.params[paramName || "id"], req.body || {}, status),
      message || "Updated successfully",
    );
  };
}

function remove(collection, paramName, message) {
  return function (req, res) {
    compat.remove(collection, req.params[paramName || "id"]);
    return api.ok(res, null, message || "Deleted successfully");
  };
}

function value(key) {
  return function (req, res) {
    return api.ok(res, compat.value(key));
  };
}

function mergeValue(key, message) {
  return function (req, res) {
    return api.ok(res, compat.mergeValue(key, req.body || {}), message || "Updated successfully");
  };
}

function setArray(key, message) {
  return function (req, res) {
    return api.ok(
      res,
      compat.setValue(key, Array.isArray(req.body) ? req.body : req.body.items || []),
      message || "Updated successfully",
    );
  };
}

function emptyArray(req, res) {
  return api.ok(res, []);
}

function emptyObject(req, res) {
  return api.ok(res, {});
}

function count(req, res) {
  return api.ok(res, { count: 0 });
}

module.exports = {
  count: count,
  create: create,
  emptyArray: emptyArray,
  emptyObject: emptyObject,
  get: get,
  list: list,
  mergeValue: mergeValue,
  remove: remove,
  setArray: setArray,
  update: update,
  value: value,
};
