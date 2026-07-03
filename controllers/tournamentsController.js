var mongoose = require("mongoose");
var User = require("../models/user");
var Horse = require("../models/horse");
var Tournament = require("../models/tournament");
var Province = require("../models/province");
var { fail } = require("../utils/httpErrors");
var { isCloudinaryError } = require("../utils/cloudinaryUpload");
var { mapVenue } = require("../utils/systemSettingsMapper");
var tm = require("../utils/tournamentMapper");
var tournamentService = require("../services/tournamentService");
var tournamentRaceService = require("../services/tournamentRaceService");
var registrationService = require("../services/registrationService");

async function list(req, res, next) {
  try {
    var query = {};
    var status = (req.query.status || "").trim();
    var type = (req.query.type || "").trim();
    var search = (req.query.search || "").trim();

    if (status) query.status = tm.toTournamentStatusLabel(status, status);
    if (type) query.type = type;
    if (search) {
      query.$or = [
        { name: new RegExp(search, "i") },
        { description: new RegExp(search, "i") },
        { location: new RegExp(search, "i") },
      ];
    }

    var tournaments = await Tournament.find(query)
      .sort({ createdAt: -1 })
      .exec();
    res.json(tournaments.map(tm.mapTournament));
  } catch (err) {
    next(err);
  }
}

async function listOwnerOpen(req, res, next) {
  try {
    var tournaments = await Tournament.find({ status: "Đang mở đăng ký" })
      .sort({ createdAt: -1 })
      .exec();

    res.json(
      tournaments.map(function (tournament) {
        var openRaces = (tournament.races || [])
          .filter(function (race) {
            return registrationService.isRaceOpenForRegistration(tournament, race);
          })
          .map(tm.mapRace);

        return Object.assign({}, tm.mapTournament(tournament), {
          races: openRaces,
          openRaceCount: openRaces.length,
        });
      }),
    );
  } catch (err) {
    next(err);
  }
}

async function listOwnerRegistrations(req, res, next) {
  try {
    var ownerObjectId = mongoose.Types.ObjectId.isValid(req.user.id)
      ? new mongoose.Types.ObjectId(req.user.id)
      : req.user.id;

    var tournaments = await Tournament.find({
      "registrations.ownerId": ownerObjectId,
    })
      .sort({ updatedAt: -1 })
      .exec();

    var registrations = [];
    tournaments.forEach(function (tournament) {
      (tournament.registrations || []).forEach(function (registration) {
        if (
          String(registration.ownerId || "") === String(req.user.id) ||
          String(registration.ownerId || "") === String(ownerObjectId)
        ) {
          var race = tournament.races.id(registration.raceId);
          registrations.push(
            Object.assign({}, tm.mapRegistration(registration), {
              tournamentId: String(tournament._id),
              tournamentName: tournament.name,
              tournamentStatus: tournament.status,
              raceName: race ? race.name : "",
              raceStatus: race ? race.status : "",
            }),
          );
        }
      });
    });

    res.json(registrations);
  } catch (err) {
    next(err);
  }
}

async function listJockeyRegistrations(req, res, next) {
  try {
    var jockeyObjectId = mongoose.Types.ObjectId.isValid(req.user.id)
      ? new mongoose.Types.ObjectId(req.user.id)
      : req.user.id;

    var tournaments = await Tournament.find({
      "registrations.jockeyId": jockeyObjectId,
    })
      .sort({ updatedAt: -1 })
      .exec();

    var horseIds = new Set();
    tournaments.forEach(function (tournament) {
      (tournament.registrations || []).forEach(function (registration) {
        if (
          String(registration.jockeyId || "") === String(req.user.id) ||
          String(registration.jockeyId || "") === String(jockeyObjectId)
        ) {
          if (registration.horseId) {
            horseIds.add(String(registration.horseId));
          }
        }
      });
    });

    var horseObjectIds = Array.from(horseIds)
      .filter(function (id) {
        return mongoose.Types.ObjectId.isValid(id);
      })
      .map(function (id) {
        return new mongoose.Types.ObjectId(id);
      });

    var horses = horseObjectIds.length
      ? await Horse.find({ _id: { $in: horseObjectIds } }).exec()
      : [];

    var horsesById = {};
    horses.forEach(function (horse) {
      horsesById[String(horse._id)] = horse;
    });

    var registrations = [];
    tournaments.forEach(function (tournament) {
      (tournament.registrations || []).forEach(function (registration) {
        if (
          String(registration.jockeyId || "") === String(req.user.id) ||
          String(registration.jockeyId || "") === String(jockeyObjectId)
        ) {
          var race = tournament.races.id(registration.raceId);
          var scheduledAt =
            race && race.scheduledAt ? new Date(race.scheduledAt) : null;
          var horseDoc =
            horsesById[String(registration.horseId || "")] || null;
          registrations.push(
            Object.assign({}, tm.mapRegistration(registration), {
              tournamentId: String(tournament._id),
              tournamentName: tournament.name,
              tournamentStatus: tournament.status,
              raceName: race ? race.name : "",
              raceNumber: race ? race.raceNumber || "" : "",
              raceStatus: race ? race.status : "",
              raceDate: scheduledAt
                ? tournamentService.toDateInput(scheduledAt)
                : tournamentService.toDateInput(tournament.startDate),
              raceTime: scheduledAt ? tournamentService.toTimeInput(scheduledAt) : "",
              location: (race && race.track) || tournament.location || "",
              horseHealth: horseDoc ? horseDoc.healthStatus : "",
              horseBirthDate: horseDoc ? tournamentService.toDateInput(horseDoc.birthDate) : "",
              horseWins: horseDoc ? horseDoc.wins : 0,
              horseRaces: horseDoc ? horseDoc.races : 0,
              horseNotes: horseDoc ? horseDoc.notes : "",
              horseGender: horseDoc ? horseDoc.gender : "",
              horseImageUrl: horseDoc ? horseDoc.imageUrl : "",
            }),
          );
        }
      });
    });

    res.json(registrations);
  } catch (err) {
    next(err);
  }
}

async function updateStatus(req, res, next) {
  try {
    var tournament = await tournamentService.findTournamentByIdOrSlug(
      req.params.identifier,
    ).exec();

    if (!tournament) {
      return fail(res, 404, "Không tìm thấy giải đấu");
    }

    var statusValue = req.query.status || req.body.status;
    if (!statusValue) {
      return fail(res, 400, "Vui lòng chọn trạng thái giải đấu");
    }

    var currentStatusCode = tm.toTournamentStatusCode(tournament.status);
    var nextStatusCode = tm.toTournamentStatusCode(statusValue);
    var allowedNext =
      tm.TOURNAMENT_STATUS_TRANSITIONS[currentStatusCode] || [currentStatusCode];

    if (allowedNext.indexOf(nextStatusCode) === -1) {
      return fail(
        res,
        400,
        "Không thể chuyển sang trạng thái này từ trạng thái hiện tại",
      );
    }

    if (currentStatusCode === "ONGOING" && nextStatusCode === "COMPLETED") {
      var pendingRaces = (tournament.races || []).filter(function (race) {
        return tm.toRaceStatusCode(race.status) !== "RESULT_CONFIRMED";
      });
      if (pendingRaces.length > 0) {
        return fail(
          res,
          400,
          "Còn " +
            pendingRaces.length +
            " cuộc đua chưa ghi nhận kết quả. Trọng tài cần hoàn tất trước khi kết thúc giải.",
        );
      }
    }

    tournament.status = tm.toTournamentStatusLabel(
      statusValue,
      tournament.status,
    );

    if (nextStatusCode === "ONGOING") {
      (tournament.races || []).forEach(function (race) {
        var raceCode = tm.toRaceStatusCode(race.status);
        if (raceCode === "DRAFT" || raceCode === "SCHEDULED") {
          race.status = tm.RACE_STATUS_LABELS.ONGOING;
        }
      });
    }

    await tournament.save();
    res.json(tm.mapTournament(tournament));
  } catch (err) {
    next(err);
  }
}

async function schedule(req, res, next) {
  try {
    var tournament = await tournamentService.findTournamentByIdOrSlug(
      req.params.identifier,
    ).exec();

    if (!tournament) {
      return fail(res, 404, "Không tìm thấy giải đấu");
    }

    tournament.status = tm.TOURNAMENT_STATUS_LABELS.SCHEDULED;
    (tournament.races || []).forEach(function (race) {
      var raceCode = tm.toRaceStatusCode(race.status);
      if (raceCode === "DRAFT" || raceCode === "SCHEDULED") {
        race.status = tm.RACE_STATUS_LABELS.SCHEDULED;
      }
    });

    await tournament.save();
    res.json(tm.mapTournament(tournament));
  } catch (err) {
    next(err);
  }
}

async function getByIdentifier(req, res, next) {
  try {
    var tournament = await tournamentService.findTournamentByIdOrSlug(
      req.params.identifier,
    ).exec();

    if (!tournament) {
      return fail(res, 404, "Không tìm thấy giải đấu");
    }

    res.json(tm.mapTournament(tournament));
  } catch (err) {
    next(err);
  }
}

async function getVenues(req, res, next) {
  try {
    var tournament = await tournamentService.findTournamentByIdOrSlug(
      req.params.identifier,
    ).exec();

    if (!tournament) {
      return fail(res, 404, "Không tìm thấy giải đấu");
    }

    var province = null;
    if (tournament.provinceId) {
      province = await Province.findById(tournament.provinceId).exec();
    }

    if (!province) {
      var location = String(tournament.location || "").trim().toLowerCase();
      if (location) {
        var candidates = await Province.find({ active: true }).exec();
        province = candidates.find(function (item) {
          var name = String(item.name || "").trim().toLowerCase();
          var code = String(item.code || "").trim().toLowerCase();
          return (
            name === location ||
            code === location ||
            name.indexOf(location) !== -1 ||
            location.indexOf(name) !== -1
          );
        }) || null;
      }
    }

    if (!province) {
      return res.json([]);
    }

    res.json(
      (province.venues || [])
        .filter(function (venue) {
          return venue.active !== false;
        })
        .map(function (venue) {
          return mapVenue(venue, province);
        }),
    );
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    var name = (req.body.name || "").trim();
    var location = (req.body.location || "").trim();
    var slug = (
      req.body.slug ||
      tournamentService.createSlug(name) ||
      tournamentService.createSlug(location) ||
      "giai-dau"
    ).trim();

    if (!name || !location) {
      return fail(res, 400, "Vui lòng nhập tên và địa điểm giải đấu");
    }

    var exists = await Tournament.findOne({ slug: slug }).exec();
    if (exists) {
      return fail(res, 409, "Mã giải đấu đã tồn tại");
    }

    var banner = await tournamentService.extractTournamentBanner(req);
    var config = tournamentService.parseMaybeJson(req.body.config, {});
    if (req.body.entryFee !== undefined) {
      config.entryFee = tournamentService.toNumber(req.body.entryFee, config.entryFee || 0);
    }
    if (req.body.depositFee !== undefined) {
      config.depositFee = tournamentService.toNumber(req.body.depositFee, config.depositFee || 0);
    }
    if (req.body.registrationCloseAt !== undefined) {
      config.deadlineAt = tournamentService.toDate(req.body.registrationCloseAt);
    }

    var tournament = new Tournament({
      name: name,
      slug: slug,
      description: req.body.description || "",
      location: location,
      banner: banner,
      type: req.body.type || "regular",
      status: tm.toTournamentStatusLabel(req.body.status, "Nháp"),
      startDate: tournamentService.toDate(req.body.startAt || req.body.startDate),
      endDate: tournamentService.toDate(req.body.endAt || req.body.endDate),
      rules: req.body.rules || "",
      config: config,
      createdBy: req.user.id,
    });
    tournamentService.applyTournamentSettingsFields(tournament, req.body);
    await tournament.save();

    res.status(201).json(tm.mapTournament(tournament));
  } catch (err) {
    console.error(
      "Tournament create error:",
      err && err.stack ? err.stack : err,
    );
    if (isCloudinaryError(err)) {
      var createErrorMessage = String(err && err.message ? err.message : err);
      return res.status(400).json({ error: createErrorMessage });
    }
    next(err);
  }
}

async function update(req, res, next) {
  try {
    var tournament = await tournamentService.findTournamentByIdOrSlug(
      req.params.identifier,
    ).exec();

    if (!tournament) {
      return fail(res, 404, "Không tìm thấy giải đấu");
    }

    var nextName = req.body.name;
    var nextSlug = req.body.slug;

    if (nextName !== undefined)
      tournament.name = String(nextName).trim() || tournament.name;
    if (nextSlug !== undefined)
      tournament.slug = tournamentService.createSlug(nextSlug) || tournament.slug;
    if (req.body.description !== undefined)
      tournament.description = req.body.description;
    if (req.body.location !== undefined)
      tournament.location = req.body.location;
    if (req.file || req.body.banner !== undefined) {
      tournament.banner = await tournamentService.extractTournamentBanner(req);
    }
    if (req.body.type !== undefined) tournament.type = req.body.type;
    if (req.body.status !== undefined)
      tournament.status = tm.toTournamentStatusLabel(
        req.body.status,
        tournament.status,
      );
    if (req.body.startDate !== undefined)
      tournament.startDate = tournamentService.toDate(req.body.startDate);
    if (req.body.endDate !== undefined)
      tournament.endDate = tournamentService.toDate(req.body.endDate);
    if (req.body.rules !== undefined) tournament.rules = req.body.rules;

    if (req.body.config) {
      var nextConfig = tournamentService.parseMaybeJson(req.body.config, req.body.config);
      tournament.config = Object.assign(
        {},
        tournament.config.toObject
          ? tournament.config.toObject()
          : tournament.config,
        nextConfig,
      );
    }

    await tournament.save();
    res.json(tm.mapTournament(tournament));
  } catch (err) {
    console.error(
      "Tournament update error:",
      err && err.stack ? err.stack : err,
    );
    if (isCloudinaryError(err)) {
      var updateErrorMessage = String(err && err.message ? err.message : err);
      return res.status(400).json({ error: updateErrorMessage });
    }
    next(err);
  }
}

async function replace(req, res, next) {
  try {
    var tournament = await tournamentService.findTournamentByIdOrSlug(
      req.params.identifier,
    ).exec();

    if (!tournament) {
      return fail(res, 404, "Không tìm thấy giải đấu");
    }

    if (req.body.name !== undefined) {
      tournament.name = String(req.body.name).trim() || tournament.name;
    }
    if (req.body.description !== undefined)
      tournament.description = req.body.description;
    if (req.body.location !== undefined) tournament.location = req.body.location;
    if (req.body.banner !== undefined || req.body.bannerUrl !== undefined) {
      tournament.banner = req.body.banner || req.body.bannerUrl || "";
    }
    if (req.body.type !== undefined) tournament.type = req.body.type;
    if (req.body.status !== undefined) {
      tournament.status = tm.toTournamentStatusLabel(
        req.body.status,
        tournament.status,
      );
    }
    if (req.body.startDate !== undefined || req.body.startAt !== undefined) {
      tournament.startDate = tournamentService.toDate(req.body.startAt || req.body.startDate);
    }
    if (req.body.endDate !== undefined || req.body.endAt !== undefined) {
      tournament.endDate = tournamentService.toDate(req.body.endAt || req.body.endDate);
    }
    if (req.body.rules !== undefined) tournament.rules = req.body.rules;

    var currentConfig = tournament.config && tournament.config.toObject
      ? tournament.config.toObject()
      : tournament.config || {};
    var nextConfig = Object.assign({}, currentConfig);

    if (req.body.registrationCloseAt !== undefined) {
      nextConfig.deadlineAt = tournamentService.toDate(req.body.registrationCloseAt);
    }
    if (req.body.entryFee !== undefined) {
      nextConfig.entryFee = tournamentService.toNumber(req.body.entryFee, nextConfig.entryFee || 0);
    }
    if (req.body.depositFee !== undefined) {
      nextConfig.depositFee = tournamentService.toNumber(
        req.body.depositFee,
        nextConfig.depositFee || 0,
      );
    }
    if (req.body.config) {
      nextConfig = Object.assign(
        nextConfig,
        tournamentService.parseMaybeJson(req.body.config, req.body.config),
      );
    }
    tournament.config = nextConfig;
    tournamentService.applyTournamentSettingsFields(tournament, req.body);

    await tournament.save();
    res.json(tm.mapTournament(tournament));
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    var tournament = await tournamentService.findTournamentByIdOrSlug(
      req.params.identifier,
    ).exec();

    if (!tournament) {
      return fail(res, 404, "Không tìm thấy giải đấu");
    }

    if ((tournament.registrations || []).length > 0) {
      return fail(
        res,
        409,
        "Không thể xóa giải đấu đã có đội đăng ký",
      );
    }

    await tournament.deleteOne();
    res.json({ success: true, message: "Xóa giải đấu thành công", data: null });
  } catch (err) {
    next(err);
  }
}

async function patchConfig(req, res, next) {
  try {
    var tournament = await tournamentService.findTournamentByIdOrSlug(
      req.params.identifier,
    ).exec();

    if (!tournament) {
      return fail(res, 404, "Không tìm thấy giải đấu");
    }

    tournament.type = req.body.type || tournament.type;
    tournament.status =
      req.body.status !== undefined
        ? tm.toTournamentStatusLabel(req.body.status, tournament.status)
        : tournament.status;
    tournament.rules =
      req.body.rules !== undefined ? req.body.rules : tournament.rules;
    tournament.config = Object.assign(
      {},
      tournament.config.toObject
        ? tournament.config.toObject()
        : tournament.config,
      req.body.config || {},
    );

    await tournament.save();
    res.json(tm.mapTournament(tournament));
  } catch (err) {
    next(err);
  }
}

async function listRaces(req, res, next) {
  try {
    var tournament = await tournamentService.findTournamentByIdOrSlug(
      req.params.identifier,
    ).exec();

    if (!tournament) {
      return fail(res, 404, "Không tìm thấy giải đấu");
    }

    res.json((tournament.races || []).map(tm.mapRace));
  } catch (err) {
    next(err);
  }
}

async function getOwnerRaceOptions(req, res, next) {
  try {
    var tournament = await tournamentService.findTournamentByIdOrSlug(
      req.params.identifier,
    ).exec();

    if (!tournament) {
      return fail(res, 404, "Không tìm thấy giải đấu");
    }

    var race = tournament.races.id(req.params.raceId);
    if (!race) {
      return fail(res, 404, "Không tìm thấy cuộc đua");
    }

    if (!registrationService.isRaceOpenForRegistration(tournament, race)) {
      return fail(res, 409, "Cuộc đua chưa mở đăng ký");
    }

    var options = await registrationService.buildOwnerRaceOptions(tournament, race, req.user.id);
    res.json(options);
  } catch (err) {
    next(err);
  }
}

async function createRace(req, res, next) {
  try {
    var tournament = await tournamentService.findTournamentByIdOrSlug(
      req.params.identifier,
    ).exec();

    if (!tournament) {
      return fail(res, 404, "Không tìm thấy giải đấu");
    }

    var raceNumber = Number(
      req.body.raceNumber || tournament.races.length + 1,
    );

    var newRacePayload = await tournamentRaceService.buildRacePayload(
      req.body,
      raceNumber,
      tournamentRaceService.getRaceDefaults(tournament),
    );
    tournament.races.push(Object.assign(newRacePayload, { results: [] }));

    await tournament.save();
    res.status(201).json(tm.mapTournament(tournament));
  } catch (err) {
    next(err);
  }
}

async function replaceRaces(req, res, next) {
  try {
    var tournament = await tournamentService.findTournamentByIdOrSlug(
      req.params.identifier,
    ).exec();

    if (!tournament) {
      return fail(res, 404, "Không tìm thấy giải đấu");
    }

    var races = Array.isArray(req.body) ? req.body : req.body.races;
    if (!Array.isArray(races)) {
      return fail(res, 400, "Danh sách cuộc đua không hợp lệ");
    }

    var defaults = tournamentRaceService.getRaceDefaults(tournament);
    var nextRaces = await Promise.all(
      races.map(async function (race, index) {
        var payload = await tournamentRaceService.buildRacePayload(race, index + 1, defaults);
        return Object.assign(payload, { results: [] });
      }),
    );
    tournament.races = nextRaces;

    await tournament.save();
    res.json(tm.mapTournament(tournament));
  } catch (err) {
    next(err);
  }
}

async function getRace(req, res, next) {
  try {
    var tournament = await tournamentService.findTournamentByIdOrSlug(
      req.params.identifier,
    ).exec();

    if (!tournament) {
      return fail(res, 404, "Không tìm thấy giải đấu");
    }

    var race = tournament.races.id(req.params.raceId);
    if (!race) {
      return fail(res, 404, "Không tìm thấy cuộc đua");
    }

    res.json(tm.mapRace(race));
  } catch (err) {
    next(err);
  }
}

async function updateRace(req, res, next) {
  try {
    var tournament = await tournamentService.findTournamentByIdOrSlug(
      req.params.identifier,
    ).exec();

    if (!tournament) {
      return fail(res, 404, "Không tìm thấy giải đấu");
    }

    var race = tournament.races.id(req.params.raceId);
    if (!race) {
      return fail(res, 404, "Không tìm thấy cuộc đua");
    }

    await tournamentRaceService.applyRaceFieldsUpdate(race, req.body);

    await tournament.save();
    res.json(tm.mapTournament(tournament));
  } catch (err) {
    next(err);
  }
}

async function deleteRace(req, res, next) {
  try {
    var tournament = await tournamentService.findTournamentByIdOrSlug(
      req.params.identifier,
    ).exec();

    if (!tournament) {
      return fail(res, 404, "Không tìm thấy giải đấu");
    }

    var race = tournament.races.id(req.params.raceId);
    if (!race) {
      return fail(res, 404, "Không tìm thấy cuộc đua");
    }

    race.deleteOne();
    await tournament.save();
    res.json(tm.mapTournament(tournament));
  } catch (err) {
    next(err);
  }
}

async function listRegistrations(req, res, next) {
  try {
    var tournament = await tournamentService.findTournamentByIdOrSlug(
      req.params.identifier,
    ).exec();

    if (!tournament) {
      return fail(res, 404, "Không tìm thấy giải đấu");
    }

    res.json(tournament.registrations.map(tm.mapRegistration));
  } catch (err) {
    next(err);
  }
}

async function createOwnerRegistration(req, res, next) {
  try {
    var tournament = await tournamentService.findTournamentByIdOrSlug(
      req.params.identifier,
    ).exec();

    if (!tournament) {
      return fail(res, 404, "Không tìm thấy giải đấu");
    }

    if (!registrationService.isTournamentOpenForRegistration(tournament)) {
      return fail(res, 409, "Giải đấu chưa mở đăng ký");
    }

    var raceId = req.body.raceId || "";
    var race = raceId ? tournament.races.id(raceId) : null;
    if (!race) {
      return fail(res, 400, "Vui lòng chọn cuộc đua");
    }

    if (!registrationService.isRaceOpenForRegistration(tournament, race)) {
      return fail(res, 409, "Cuộc đua chưa mở đăng ký");
    }

    var horseId = req.body.horseId || "";
    var jockeyId = req.body.jockeyId || "";
    var fullName = (
      req.body.fullName ||
      req.user.fullName ||
      req.user.username ||
      ""
    ).trim();
    var horse = horseId ? await Horse.findById(horseId).exec() : null;
    var jockey = jockeyId ? await User.findById(jockeyId).exec() : null;

    if (!fullName) {
      return fail(res, 400, "Vui lòng nhập tên người đăng ký");
    }

    if (!horse || String(horse.createdBy || "") !== String(req.user.id)) {
      return fail(res, 404, "Không tìm thấy ngựa");
    }

    if (horse.racingStatus === "cannot-race") {
      return fail(res, 400, "Ngựa không đủ điều kiện thi đấu");
    }

    var ageRestriction = registrationService.getHorseAgeRestriction(
      horse,
      registrationService.getRaceStartDate(tournament, race),
    );
    if (ageRestriction) {
      return res.status(400).json({ error: ageRestriction });
    }

    if (!jockey || jockey.role !== "JOCKEY") {
      return fail(res, 404, "Không tìm thấy jockey");
    }

    var options = await registrationService.buildOwnerRaceOptions(tournament, race, req.user.id);
    var jockeyAllowed = (options.jockeys || []).some(function (item) {
      return String(item.id || "") === String(jockey._id);
    });
    if (!jockeyAllowed) {
      return res.status(403).json({
        error:
          "Jockey chưa nhận lời mời cho giải này hoặc chưa thi đấu cho bạn",
      });
    }
    var selectedHorseOption = options.horses.find(function (item) {
      return String(item.id || "") === String(horse._id || "");
    });
    if (!selectedHorseOption || selectedHorseOption.available === false) {
      return res.status(409).json({
        error:
          (selectedHorseOption && selectedHorseOption.unavailableReason) ||
          "Ngựa không khả dụng cho race này",
      });
    }

    var selectedJockeyOption = options.jockeys.find(function (item) {
      return String(item.id || "") === String(jockey._id || "");
    });
    if (!selectedJockeyOption || selectedJockeyOption.available === false) {
      return res.status(409).json({
        error:
          (selectedJockeyOption && selectedJockeyOption.unavailableReason) ||
          "Jockey không khả dụng cho race này",
      });
    }

    var horseName = (req.body.horseName || horse.name || "").trim();
    var jockeyName = (
      req.body.jockeyName ||
      jockey.fullName ||
      jockey.name ||
      ""
    ).trim();

    tournament.registrations.push({
      tournamentId: tournament._id,
      fullName: fullName,
      ownerId: req.user.id,
      ownerName: req.user.fullName || req.user.username || fullName,
      horseId: horse._id,
      horseName: horseName,
      horseAge: req.body.horseAge ? Number(req.body.horseAge) : undefined,
      horseBreed: req.body.horseBreed || horse.breed || "",
      jockeyId: jockey._id,
      jockeyName: jockeyName,
      raceId: race._id,
      status: req.body.status || "Chờ duyệt",
      notes: req.body.notes || "",
    });

    await tournament.save();
    res.status(201).json(tm.mapTournament(tournament));
  } catch (err) {
    next(err);
  }
}

async function updateRegistration(req, res, next) {
  try {
    var tournament = await tournamentService.findTournamentByIdOrSlug(
      req.params.identifier,
    ).exec();

    if (!tournament) {
      return fail(res, 404, "Không tìm thấy giải đấu");
    }

    var registration = tournament.registrations.id(req.params.registrationId);
    if (!registration) {
      return fail(res, 404, "Không tìm thấy đăng ký");
    }

    var status = String(req.body.status || "").trim();
    var allowedStatuses = [
      "Chờ duyệt",
      "Đã duyệt",
      "Từ chối",
      "Đang chạy",
      "Hoàn thành",
    ];

    if (allowedStatuses.indexOf(status) === -1) {
      return fail(res, 400, "Trạng thái đăng ký không hợp lệ");
    }

    registration.status = status;
    await tournament.save();
    res.json(tm.mapTournament(tournament));
  } catch (err) {
    next(err);
  }
}

async function recordRaceResults(req, res, next) {
  try {
    var tournament = await tournamentService.findTournamentByIdOrSlug(
      req.params.identifier,
    ).exec();

    if (!tournament) {
      return fail(res, 404, "Không tìm thấy giải đấu");
    }

    var race = tournament.races.id(req.params.raceId);
    if (!race) {
      return fail(res, 404, "Không tìm thấy cuộc đua");
    }

    var results = Array.isArray(req.body.results) ? req.body.results : [];
    race.results = results.map(function (item, index) {
      return {
        position: Number(item.position || index + 1),
        horseName: item.horseName || "",
        jockeyId: item.jockeyId || undefined,
        jockeyName: item.jockeyName || "",
        time: item.time || "",
        points: item.points !== undefined ? Number(item.points) : 0,
        notes: item.notes || "",
      };
    });
    race.status = tm.toRaceStatusLabel(req.body.status, "Hoàn thành");
    tournament.status =
      req.body.tournamentStatus !== undefined
        ? tm.toTournamentStatusLabel(req.body.tournamentStatus, tournament.status)
        : tournament.status;

    await tournament.save();
    res.json(tm.mapTournament(tournament));
  } catch (err) {
    next(err);
  }
}

async function getResults(req, res, next) {
  try {
    var tournament = await tournamentService.findTournamentByIdOrSlug(
      req.params.identifier,
    ).exec();

    if (!tournament) {
      return fail(res, 404, "Không tìm thấy giải đấu");
    }

    res.json(
      tournament.races.map(function (race) {
        return {
          race: tm.mapRace(race),
          results: (race.results || []).map(tm.mapResult),
        };
      }),
    );
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list: list,
  listOwnerOpen: listOwnerOpen,
  listOwnerRegistrations: listOwnerRegistrations,
  listJockeyRegistrations: listJockeyRegistrations,
  updateStatus: updateStatus,
  schedule: schedule,
  getByIdentifier: getByIdentifier,
  getVenues: getVenues,
  create: create,
  update: update,
  replace: replace,
  remove: remove,
  patchConfig: patchConfig,
  listRaces: listRaces,
  getOwnerRaceOptions: getOwnerRaceOptions,
  createRace: createRace,
  replaceRaces: replaceRaces,
  getRace: getRace,
  updateRace: updateRace,
  deleteRace: deleteRace,
  listRegistrations: listRegistrations,
  createOwnerRegistration: createOwnerRegistration,
  updateRegistration: updateRegistration,
  recordRaceResults: recordRaceResults,
  getResults: getResults,
};
