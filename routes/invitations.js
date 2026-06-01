var express = require("express");
var router = express.Router();
var User = require("../models/user");
var Horse = require("../models/horse");
var Tournament = require("../models/tournament");
var JockeyInvitation = require("../models/jockeyInvitation");
var { authenticate, requireRole } = require("../middleware/auth");

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

function findRaceInTournament(tournament, raceId) {
  if (!raceId) return null;
  return (tournament.races || []).find(function (race) {
    return String(race._id) === String(raceId);
  });
}

router.post(
  "/",
  authenticate,
  requireRole("OWNER", "ADMIN"),
  async function (req, res, next) {
    try {
      var jockeyId = req.body.jockeyId || "";
      var horseId = req.body.horseId || "";
      var tournamentId = req.body.tournamentId || "";
      var raceId = req.body.raceId || "";
      var reward = Number(req.body.reward || 0);

      if (!jockeyId || !horseId || !tournamentId) {
        return res.status(400).json({
          error: "jockeyId, horseId and tournamentId are required",
        });
      }

      var [jockey, horse, tournament] = await Promise.all([
        User.findById(jockeyId).exec(),
        Horse.findById(horseId).exec(),
        Tournament.findById(tournamentId).exec(),
      ]);

      if (!jockey || jockey.role !== "JOCKEY") {
        return res.status(404).json({ error: "Jockey not found" });
      }

      if (!horse) {
        return res.status(404).json({ error: "Horse not found" });
      }

      if (
        req.user.role !== "ADMIN" &&
        String(horse.createdBy || "") !== String(req.user.id)
      ) {
        return res.status(403).json({ error: "Forbidden" });
      }

      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }

      var race = findRaceInTournament(tournament, raceId);
      if (raceId && !race) {
        return res.status(404).json({ error: "Race not found" });
      }

      var existingRegistration = (tournament.registrations || []).find(
        function (registration) {
          var sameJockey =
            String(registration.jockeyId || "") === String(jockey._id);
          var sameHorse =
            String(registration.horseId || "") === String(horse._id);
          var sameRace = raceId
            ? String(registration.raceId || "") === String(race?._id || "")
            : true;
          return sameJockey && sameHorse && sameRace;
        },
      );

      if (existingRegistration) {
        return res.status(409).json({
          error: "Jockey và ngựa đã được đăng ký cho race này",
        });
      }

      var duplicateFilter = {
        ownerId: req.user.id,
        jockeyId: jockey._id,
        horseId: horse._id,
        tournamentId: tournament._id,
        status: "Chờ xử lý",
      };
      if (raceId) duplicateFilter.raceId = race._id;

      var existing = await JockeyInvitation.findOne(duplicateFilter).exec();
      if (existing) {
        return res.status(409).json({
          error: "Lời mời đang chờ xử lý đã tồn tại cho jockey này",
        });
      }

      var horseBreedLabel = buildHorseBreedLabel(horse);
      var raceLabel = race
        ? "Race R" + (race.raceNumber || "") + " · " + (race.name || "")
        : "";
      var scheduledAt =
        race && race.scheduledAt ? new Date(race.scheduledAt) : null;

      var invitation = await JockeyInvitation.create({
        ownerId: req.user.id,
        ownerName: req.user.fullName || req.user.username || "",
        jockeyId: jockey._id,
        jockeyName: jockey.fullName || jockey.name || jockey.username || "",
        horseId: horse._id,
        horseName: horse.name,
        horseBreed: horseBreedLabel,
        horseAge: horseAgeFromBirthDate(horse.birthDate),
        tournamentId: tournament._id,
        tournamentName: tournament.name,
        raceId: race ? race._id : undefined,
        raceLabel: raceLabel,
        raceDate: scheduledAt
          ? toDateInput(scheduledAt)
          : toDateInput(tournament.startDate),
        raceTime: scheduledAt ? toTimeInput(scheduledAt) : "",
        location: tournament.location || race?.track || "",
        reward:
          reward > 0
            ? reward
            : race?.entryFee || tournament.config?.entryFee || 0,
        status: "Chờ xử lý",
      });

      var mapped = mapInvitation(invitation);
      mapped.horseBread = horseBreedLabel;
      res.status(201).json(mapped);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/me",
  authenticate,
  requireRole("JOCKEY", "ADMIN"),
  async function (req, res, next) {
    try {
      var filter =
        req.user.role === "ADMIN" && req.query.jockeyId
          ? { jockeyId: req.query.jockeyId }
          : { jockeyId: req.user.id };

      var invitations = await JockeyInvitation.find(filter)
        .sort({ createdAt: -1 })
        .exec();

      res.json(invitations.map(mapInvitation));
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/sent",
  authenticate,
  requireRole("OWNER", "ADMIN"),
  async function (req, res, next) {
    try {
      var filter =
        req.user.role === "ADMIN" && req.query.ownerId
          ? { ownerId: req.query.ownerId }
          : { ownerId: req.user.id };

      var invitations = await JockeyInvitation.find(filter)
        .sort({ createdAt: -1 })
        .exec();

      res.json(invitations.map(mapInvitation));
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  "/:id/respond",
  authenticate,
  requireRole("JOCKEY", "ADMIN"),
  async function (req, res, next) {
    try {
      var action = String(req.body.action || "").toLowerCase();
      var invitation = await JockeyInvitation.findById(req.params.id).exec();

      if (!invitation) {
        return res.status(404).json({ error: "Invitation not found" });
      }

      if (
        req.user.role !== "ADMIN" &&
        String(invitation.jockeyId) !== String(req.user.id)
      ) {
        return res.status(403).json({ error: "Forbidden" });
      }

      if (invitation.status !== "Chờ xử lý") {
        return res.status(400).json({ error: "Invitation already responded" });
      }

      if (action === "accept") {
        invitation.status = "Đã chấp nhận";
      } else if (action === "reject") {
        invitation.status = "Đã từ chối";
      } else {
        return res
          .status(400)
          .json({ error: "action must be accept or reject" });
      }

      invitation.respondedAt = new Date();
      await invitation.save();

      res.json(mapInvitation(invitation));
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
