function mapEvidence(item) {
  return {
    name: item.name || "",
    size: item.size || 0,
    mimeType: item.mimeType || "",
    url: item.url || "",
  };
}

function formatDisplayCode(doc) {
  var year = doc.createdAt ? new Date(doc.createdAt).getFullYear() : new Date().getFullYear();
  var suffix = String(doc._id || "").slice(-3).toUpperCase() || "---";
  return "V-" + year + "-" + suffix;
}

function mapViolation(doc) {
  return {
    id: String(doc._id),
    displayCode: formatDisplayCode(doc),
    raceId: String(doc.raceId),
    tournamentId: String(doc.tournamentId),
    raceName: doc.raceName || "",
    refereeId: String(doc.refereeId),
    refereeName: doc.refereeName || "",
    participantId: doc.participantId ? String(doc.participantId) : null,
    horseNo: doc.horseNo ?? null,
    horse: doc.horseName || "",
    jockey: doc.jockeyName || "",
    type: doc.type || "",
    severity: doc.severity || "",
    description: doc.description || "",
    penalty: doc.penalty || "",
    timestamp: doc.occurredAt || "",
    evidence: (doc.evidence || []).map(mapEvidence),
    reporter: doc.refereeName || "",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

module.exports = { mapViolation: mapViolation };
