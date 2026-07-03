function toDateInput(value) {
  if (!value) return "";
  var date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function toTimeInput(value) {
  if (!value) return "";
  var date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(11, 16);
}

function horseAgeFromBirthDate(birthDate) {
  if (!birthDate) return null;
  var birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  var now = new Date();
  var age = now.getFullYear() - birth.getFullYear();
  var monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

function buildHorseBreedLabel(horse) {
  var breed = horse.breed || "Chưa rõ giống";
  var age = horseAgeFromBirthDate(horse.birthDate);
  if (age === null) return breed;
  return breed + " · " + age + " tuổi";
}

function mapInvitation(doc) {
  var status = doc.status || "Chờ xử lý";
  var statusTone = "gold";
  if (status === "Đã chấp nhận") statusTone = "green";
  if (status === "Đã từ chối") statusTone = "red";

  return {
    id: String(doc._id),
    ownerId: String(doc.ownerId || ""),
    ownerName: doc.ownerName || "",
    owner: doc.ownerName || "",
    jockeyId: String(doc.jockeyId || ""),
    jockeyName: doc.jockeyName || "",
    horseId: String(doc.horseId || ""),
    horseName: doc.horseName || "",
    horse: doc.horseName || "",
    horseBreed: doc.horseBreed || "",
    horseBread: doc.horseBreed || "",
    tournamentId: String(doc.tournamentId || ""),
    tournamentName: doc.tournamentName || "",
    tournament: doc.tournamentName || "",
    raceId: doc.raceId ? String(doc.raceId) : "",
    raceLabel: doc.raceLabel || "",
    raceNo: doc.raceLabel || "",
    raceDate: doc.raceDate || "",
    raceTime: doc.raceTime || "",
    location: doc.location || "",
    reward: doc.reward || 0,
    status: status,
    statusTone: statusTone,
    sentAt: toDateInput(doc.createdAt),
    respondedAt: doc.respondedAt ? toDateInput(doc.respondedAt) : "",
  };
}

module.exports = {
  toDateInput: toDateInput,
  toTimeInput: toTimeInput,
  horseAgeFromBirthDate: horseAgeFromBirthDate,
  buildHorseBreedLabel: buildHorseBreedLabel,
  mapInvitation: mapInvitation,
};
