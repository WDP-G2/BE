var mongoose = require("mongoose");
var User = require("../models/user");
var Tournament = require("../models/tournament");
var JockeyInvitation = require("../models/jockeyInvitation");

var ACTIVE_REGISTRATION_STATUSES = ["Đã duyệt", "Đang chạy"];
var COUNTED_REGISTRATION_STATUSES = ["Đã duyệt", "Đang chạy", "Hoàn thành"];
var ACTIVE_TOURNAMENT_STATUSES = ["Đang mở đăng ký", "Đang diễn ra"];

function yearsSince(dateValue) {
  if (!dateValue) return 0;
  var created = new Date(dateValue);
  if (Number.isNaN(created.getTime())) return 0;
  return Math.max(
    1,
    Math.floor((Date.now() - created.getTime()) / (365.25 * 24 * 60 * 60 * 1000)),
  );
}

function buildJockeyLicense(user, index) {
  var suffix = String(index + 1).padStart(3, "0");
  return "VN-JK-" + suffix;
}

function toDateInput(value) {
  if (!value) return "";
  var date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function mapInvitationSummary(invitation) {
  if (!invitation) return null;
  return {
    id: String(invitation._id),
    status: invitation.status || "Chờ xử lý",
    horseName: invitation.horseName || "",
    tournamentName: invitation.tournamentName || "",
    raceLabel: invitation.raceLabel || "",
    sentAt: toDateInput(invitation.createdAt),
    respondedAt: invitation.respondedAt
      ? toDateInput(invitation.respondedAt)
      : "",
  };
}

async function buildJockeyDirectory(ownerId) {
  var ownerObjectId = mongoose.Types.ObjectId.isValid(ownerId)
    ? new mongoose.Types.ObjectId(ownerId)
    : ownerId;

  var invitations = await JockeyInvitation.find({ ownerId: ownerObjectId })
    .sort({ createdAt: -1 })
    .exec();
  var latestInvitationByJockey = {};

  invitations.forEach(function (invitation) {
    var jockeyId = String(invitation.jockeyId || "");
    if (!jockeyId || latestInvitationByJockey[jockeyId]) return;
    latestInvitationByJockey[jockeyId] = invitation;
  });
  var jockeys = await User.find({ role: "JOCKEY" })
    .sort({ fullName: 1, name: 1, username: 1 })
    .exec();
  var tournaments = await Tournament.find({})
    .select("status registrations races")
    .exec();

  var statsByJockey = {};

  jockeys.forEach(function (jockey) {
    statsByJockey[String(jockey._id)] = {
      wins: 0,
      races: 0,
      isBusy: false,
      assigned: null,
      assignedForOwner: null,
    };
  });

  tournaments.forEach(function (tournament) {
    var isActiveTournament =
      ACTIVE_TOURNAMENT_STATUSES.indexOf(tournament.status) !== -1;

    (tournament.registrations || []).forEach(function (registration) {
      var jockeyId = String(registration.jockeyId || "");
      if (!jockeyId || !statsByJockey[jockeyId]) return;

      if (
        COUNTED_REGISTRATION_STATUSES.indexOf(registration.status) !== -1
      ) {
        statsByJockey[jockeyId].races += 1;
      }

      if (
        isActiveTournament &&
        ACTIVE_REGISTRATION_STATUSES.indexOf(registration.status) !== -1
      ) {
        statsByJockey[jockeyId].isBusy = true;
        statsByJockey[jockeyId].assigned = registration.horseName || null;

        if (String(registration.ownerId || "") === String(ownerId || "")) {
          statsByJockey[jockeyId].assignedForOwner =
            registration.horseName || null;
        }
      }
    });

    (tournament.races || []).forEach(function (race) {
      (race.results || []).forEach(function (result) {
        var jockeyId = String(result.jockeyId || "");
        if (!jockeyId || !statsByJockey[jockeyId]) return;
        if (Number(result.position) === 1) {
          statsByJockey[jockeyId].wins += 1;
        }
      });
    });
  });

  var mapped = jockeys.map(function (jockey, index) {
    var stats = statsByJockey[String(jockey._id)] || {
      wins: 0,
      races: 0,
      isBusy: false,
      assigned: null,
      assignedForOwner: null,
    };
    var races = Math.max(stats.races, stats.wins);
    var wins = stats.wins;
    var winRate = races > 0 ? Math.round((wins / races) * 1000) / 10 : 0;
    var availability = stats.isBusy ? "Bận" : "Sẵn sàng";
    var name = jockey.fullName || jockey.name || jockey.username || "Jockey";
    var latestInvitation = latestInvitationByJockey[String(jockey._id)] || null;
    var invitation = mapInvitationSummary(latestInvitation);
    var invitationStatus = invitation ? invitation.status : null;
    var canInvite =
      !invitationStatus || invitationStatus === "Đã từ chối";

    return {
      id: String(jockey._id),
      name: name,
      email: jockey.email,
      phone: jockey.phone || "",
      username: jockey.username || "",
      age: null,
      experience: yearsSince(jockey.createdAt),
      wins: wins,
      races: races,
      winRate: winRate,
      license: buildJockeyLicense(jockey, index),
      status: availability,
      statusTone: availability === "Bận" ? "red" : "green",
      availability: availability,
      assignedHorse: stats.assignedForOwner || null,
      assigned: stats.assignedForOwner || null,
      assignedOther: stats.assignedForOwner
        ? null
        : stats.assigned || null,
      isBusy: stats.isBusy,
      invitation: invitation,
      invitationStatus: invitationStatus,
      canInvite: canInvite,
    };
  });

  mapped.sort(function (first, second) {
    if (second.wins !== first.wins) return second.wins - first.wins;
    if (second.winRate !== first.winRate) return second.winRate - first.winRate;
    return first.name.localeCompare(second.name, "vi");
  });

  return mapped.map(function (item, index) {
    return Object.assign({}, item, { ranking: index + 1 });
  });
}

module.exports = {
  buildJockeyDirectory: buildJockeyDirectory,
};
