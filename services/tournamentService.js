var mongoose = require("mongoose");
var Tournament = require("../models/tournament");
var { uploadBufferToCloudinary } = require("../utils/cloudinaryUpload");

function createSlug(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function toDate(value) {
  if (!value) return undefined;
  var str = String(value);
  // Date-time strings without a timezone designator (e.g. "2026-07-08T08:00:00")
  // are parsed using the server's local timezone by the JS Date constructor,
  // which silently shifts the wall-clock time the admin entered whenever the
  // server isn't running in UTC. Treat them as UTC instead so the value the
  // admin typed round-trips unchanged regardless of server timezone.
  if (/T\d{2}:\d{2}/.test(str) && !/[Zz]$|[+-]\d{2}:\d{2}$/.test(str)) {
    str += "Z";
  }
  var date = new Date(str);
  return Number.isNaN(date.getTime()) ? undefined : date;
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

function toNumber(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  var number = Number(value);
  return Number.isNaN(number) ? fallback : number;
}

function parseMaybeJson(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function extractTournamentBanner(req) {
  if (req.file) {
    return uploadBufferToCloudinary(req.file, "horse-racing/tournaments").then(
      function (uploaded) {
        return uploaded ? uploaded.secure_url || uploaded.url || "" : "";
      },
    );
  }
  return Promise.resolve(req.body.banner || req.body.bannerUrl || "");
}

function applyTournamentSettingsFields(tournament, body) {
  if (body.provinceId !== undefined) {
    tournament.provinceId = mongoose.Types.ObjectId.isValid(body.provinceId)
      ? body.provinceId
      : null;
  }
  if (body.registrationOpenAt !== undefined) {
    tournament.registrationOpenAt = toDate(body.registrationOpenAt);
  }
  if (body.checkInDeadlineAt !== undefined) {
    tournament.checkInDeadlineAt = toDate(body.checkInDeadlineAt);
  }
  if (body.minTeams !== undefined) {
    tournament.minTeams = toNumber(body.minTeams, tournament.minTeams);
  }
  if (body.maxTeams !== undefined) {
    tournament.maxTeams = toNumber(body.maxTeams, tournament.maxTeams);
  }
  if (body.minHorsesPerOwner !== undefined) {
    tournament.minHorsesPerOwner = toNumber(
      body.minHorsesPerOwner,
      tournament.minHorsesPerOwner,
    );
  }
  if (body.maxHorsesPerOwner !== undefined) {
    tournament.maxHorsesPerOwner = toNumber(
      body.maxHorsesPerOwner,
      tournament.maxHorsesPerOwner,
    );
  }
  if (body.jockeyChallengeEnabled !== undefined) {
    tournament.jockeyChallengeEnabled = Boolean(body.jockeyChallengeEnabled);
  }
  if (body.jockeyChallengeFirstPoints !== undefined) {
    tournament.jockeyChallengeFirstPoints = toNumber(
      body.jockeyChallengeFirstPoints,
      tournament.jockeyChallengeFirstPoints,
    );
  }
  if (body.jockeyChallengeSecondPoints !== undefined) {
    tournament.jockeyChallengeSecondPoints = toNumber(
      body.jockeyChallengeSecondPoints,
      tournament.jockeyChallengeSecondPoints,
    );
  }
  if (body.jockeyChallengeThirdPoints !== undefined) {
    tournament.jockeyChallengeThirdPoints = toNumber(
      body.jockeyChallengeThirdPoints,
      tournament.jockeyChallengeThirdPoints,
    );
  }
  if (Array.isArray(body.jockeyChallengePrizes)) {
    tournament.jockeyChallengePrizes = body.jockeyChallengePrizes.map(
      function (prize, index) {
        return {
          rank: toNumber(prize.rank, index + 1),
          amount: toNumber(prize.amount, 0),
          note: prize.note || "",
        };
      },
    );
  }
}

function findTournamentByIdOrSlug(identifier) {
  var conditions = [{ slug: identifier }];
  if (mongoose.Types.ObjectId.isValid(identifier)) {
    conditions.unshift({ _id: identifier });
  }
  return Tournament.findOne({ $or: conditions });
}

module.exports = {
  createSlug: createSlug,
  toDate: toDate,
  toDateInput: toDateInput,
  toTimeInput: toTimeInput,
  toNumber: toNumber,
  parseMaybeJson: parseMaybeJson,
  extractTournamentBanner: extractTournamentBanner,
  applyTournamentSettingsFields: applyTournamentSettingsFields,
  findTournamentByIdOrSlug: findTournamentByIdOrSlug,
};
