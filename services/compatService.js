var store = require("../stores/compatStore");
var ids = require("../utils/ids");

function list(collection) {
  return store[collection] || [];
}

function get(collection, itemId) {
  return list(collection).find(function (item) {
    return String(item.id) === String(itemId);
  }) || null;
}

function create(collection, payload, defaults) {
  var item = Object.assign(
    {
      id: ids.id(),
      status: payload.status || "PENDING",
      createdAt: ids.nowIso(),
      updatedAt: ids.nowIso(),
    },
    defaults || {},
    payload || {},
  );
  store[collection].unshift(item);
  return item;
}

function update(collection, itemId, payload, status) {
  var items = store[collection] || [];
  var item = get(collection, itemId);

  if (!item) {
    item = { id: String(itemId || ids.id()), createdAt: ids.nowIso() };
    items.unshift(item);
    store[collection] = items;
  }

  Object.assign(item, payload || {}, { updatedAt: ids.nowIso() });
  if (status) item.status = status;
  return item;
}

function remove(collection, itemId) {
  store[collection] = list(collection).filter(function (item) {
    return String(item.id) !== String(itemId);
  });
}

function value(key) {
  return store[key];
}

function setValue(key, payload) {
  store[key] = payload;
  return store[key];
}

function mergeValue(key, payload) {
  store[key] = Object.assign({}, store[key] || {}, payload || {});
  return store[key];
}

module.exports = {
  create: create,
  get: get,
  list: list,
  mergeValue: mergeValue,
  remove: remove,
  setValue: setValue,
  update: update,
  value: value,
};
