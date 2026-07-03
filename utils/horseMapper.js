function mapHorse(doc) {
  var statusCode = doc.approvalStatus || "APPROVED";
  return {
    id: String(doc._id),
    slug: doc.slug,
    name: doc.name,
    breed: doc.breed || "",
    gender: doc.gender || "",
    age: Number(doc.age || 0),
    color: doc.color || "",
    heightCm: Number(doc.heightCm || 0),
    weightKg: Number(doc.weightKg || 0),
    birthDate: doc.birthDate || null,
    ownerName: doc.ownerName || "",
    ownerUsername: doc.ownerName || "",
    ownerId: doc.ownerId ? String(doc.ownerId) : "",
    imageUrl: doc.imageUrl || "",
    imagePublicId: doc.imagePublicId || "",
    licenseImageUrl: doc.licenseImageUrl || "",
    documentUrl: doc.licenseImageUrl || "",
    licenseImagePublicId: doc.licenseImagePublicId || "",
    healthStatus: doc.healthStatus || "Chưa cập nhật",
    approvalStatus: statusCode,
    status: statusCode,
    statusCode: statusCode,
    reviewReason: doc.notes || "",
    wins: Number(doc.wins || 0),
    races: Number(doc.races || 0),
    achievements: Array.isArray(doc.achievements) ? doc.achievements : [],
    history: Array.isArray(doc.history) ? doc.history : [],
    racingStatus: doc.racingStatus || "can-race",
    canRace: doc.racingStatus !== "cannot-race",
    notes: doc.notes || "",
    createdBy: doc.createdBy ? String(doc.createdBy) : "",
    updatedBy: doc.updatedBy ? String(doc.updatedBy) : "",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

module.exports = {
  mapHorse: mapHorse,
};
