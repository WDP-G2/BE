var Tournament = require("../models/tournament");

function findRaceAcrossTournaments(raceId) {
  return Tournament.findOne({ "races._id": raceId }).exec();
}

function findRaceAcrossTournamentsByRegistrationId(registrationId) {
  return Tournament.findOne({ "registrations._id": registrationId }).exec();
}

function buildHorseBreedLabel(horse) {
  var breed = horse.breed || "Chưa rõ giống";
  if (!horse.birthDate) return breed;
  var birth = new Date(horse.birthDate);
  if (Number.isNaN(birth.getTime())) return breed;
  var now = new Date();
  var age = now.getFullYear() - birth.getFullYear();
  var monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age >= 0 ? breed + " · " + age + " tuổi" : breed;
}

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

module.exports = {
  findRaceAcrossTournaments: findRaceAcrossTournaments,
  findRaceAcrossTournamentsByRegistrationId: findRaceAcrossTournamentsByRegistrationId,
  buildHorseBreedLabel: buildHorseBreedLabel,
  toDateInput: toDateInput,
  toTimeInput: toTimeInput,
};
