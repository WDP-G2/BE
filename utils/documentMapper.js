function toPlain(doc) {
  if (!doc) return null;
  var raw = typeof doc.toObject === "function" ? doc.toObject() : doc;
  raw.id = String(raw._id || raw.id || "");
  return raw;
}

function toPlainList(docs) {
  return (docs || []).map(toPlain);
}

module.exports = {
  toPlain: toPlain,
  toPlainList: toPlainList,
};
