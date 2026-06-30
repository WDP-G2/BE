var mongoose = require("mongoose");

function nowIso() {
  return new Date().toISOString();
}

function id() {
  return new mongoose.Types.ObjectId().toString();
}

function createSlug(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function isObjectId(value) {
  return /^[a-fA-F0-9]{24}$/.test(String(value || ""));
}

module.exports = {
  nowIso: nowIso,
  id: id,
  createSlug: createSlug,
  isObjectId: isObjectId,
};
