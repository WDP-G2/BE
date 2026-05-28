var express = require("express");
var router = express.Router();
var mongoose = require("mongoose");
var User = require("../models/user");
var Horse = require("../models/horse");
var Tournament = require("../models/tournament");
var { authenticate, requireRole } = require("../middleware/auth");

function createSlug(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function toDate(value) {
  if (!value) return undefined;
  var date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toNumber(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  var number = Number(value);
  return Number.isNaN(number) ? fallback : number;
}

function mapPrizes(prizes) {
  prizes = prizes || {};
  return {
    first: prizes.first || 0,
    second: prizes.second || 0,
    third: prizes.third || 0,
  };
}

function mapResult(result) {
  return {
    id: String(result._id),
    position: result.position,
    horseName: result.horseName,
    jockeyId: result.jockeyId ? String(result.jockeyId) : "",
    jockeyName: result.jockeyName || "",
    time: result.time || "",
    points: result.points || 0,
    notes: result.notes || "",
  };
}

function mapRace(race) {
  return {
    id: String(race._id),
    raceNumber: race.raceNumber,
    name: race.name,
    distance: race.distance,
    scheduledAt: race.scheduledAt || null,
    status: race.status,
    description: race.description || "",
    track: race.track || "",
    surface: race.surface || "Cỏ",
    category: race.category || "Open",
    minHorses: race.minHorses || 0,
    maxHorses: race.maxHorses || 0,
    entryFee: race.entryFee || 0,
    deposit: race.deposit || 0,
    regDeadline: race.regDeadline || null,
    checkIn: race.checkIn || "",
    prizes: mapPrizes(race.prizes),
    results: (race.results || []).map(mapResult),
  };
}

function mapRegistration(registration) {
  return {
    id: String(registration._id),
    tournamentId: registration.tournamentId
      ? String(registration.tournamentId)
      : "",
    fullName: registration.fullName,
    ownerId: registration.ownerId ? String(registration.ownerId) : "",
    ownerName: registration.ownerName || "",
    horseId: registration.horseId ? String(registration.horseId) : "",
    horseName: registration.horseName,
    horseAge: registration.horseAge || null,
    horseBreed: registration.horseBreed || "",
    jockeyId: registration.jockeyId ? String(registration.jockeyId) : "",
    jockeyName: registration.jockeyName || "",
    raceId: registration.raceId ? String(registration.raceId) : "",
    status: registration.status,
    notes: registration.notes || "",
    registeredAt: registration.registeredAt,
  };
}

function mapPublicUser(user) {
  if (!user) return null;
  return {
    id: String(user._id),
    username: user.username || user.email?.split("@")[0] || "",
    fullName: user.fullName || user.name || "",
    name: user.name || user.fullName || "",
    email: user.email || "",
    phone: user.phone || "",
    role: user.role || "USER",
  };
}

function mapHorseOption(horse) {
  return {
    id: String(horse._id),
    slug: horse.slug,
    name: horse.name,
    breed: horse.breed || "",
    gender: horse.gender || "",
    birthDate: horse.birthDate || null,
    ownerName: horse.ownerName || "",
    imageUrl: horse.imageUrl || "",
    licenseImageUrl: horse.licenseImageUrl || "",
    healthStatus: horse.healthStatus || "Chưa cập nhật",
    racingStatus: horse.racingStatus || "can-race",
    canRace: horse.racingStatus !== "cannot-race",
    notes: horse.notes || "",
  };
}

function isTournamentOpenForRegistration(tournament) {
  return tournament && tournament.status === "Đang mở đăng ký";
}

function isRaceOpenForRegistration(tournament, race) {
  if (!tournament || !race) return false;
  if (!isTournamentOpenForRegistration(tournament)) return false;
  if (race.status === "Nháp") return false;

  var deadline = race.regDeadline || tournament.config?.deadlineAt || null;
  if (deadline) {
    var deadlineDate = new Date(deadline);
    if (
      !Number.isNaN(deadlineDate.getTime()) &&
      deadlineDate.getTime() < Date.now()
    ) {
      return false;
    }
  }

  return true;
}

function findRaceIdsRegistrations(tournament, raceId) {
  return (tournament.registrations || []).filter(function (item) {
    return String(item.raceId || "") === String(raceId || "");
  });
}

async function buildOwnerRaceOptions(tournament, race, ownerId) {
  var [horses, jockeys] = await Promise.all([
    Horse.find({ createdBy: ownerId }).sort({ createdAt: -1 }).exec(),
    User.find({ role: "JOCKEY" }).sort({ fullName: 1, name: 1 }).exec(),
  ]);

  var raceRegistrations = findRaceIdsRegistrations(tournament, race._id);
  var usedHorseIds = new Set(
    raceRegistrations
      .map(function (item) {
        return String(item.horseId || "");
      })
      .filter(Boolean),
  );
  var usedJockeyIds = new Set(
    raceRegistrations
      .map(function (item) {
        return String(item.jockeyId || "");
      })
      .filter(Boolean),
  );

  return {
    tournament: mapTournament(tournament),
    race: mapRace(race),
    horses: horses.map(function (horse) {
      var option = mapHorseOption(horse);
      var unavailableReason = "";

      if (horse.racingStatus === "cannot-race") {
        unavailableReason = "Ngựa đang ở trạng thái không thể đua";
      } else if (usedHorseIds.has(String(horse._id))) {
        unavailableReason = "Ngựa đã được chọn cho race này";
      }

      return Object.assign({}, option, {
        available: unavailableReason === "",
        unavailableReason: unavailableReason,
      });
    }),
    jockeys: jockeys
      .filter(function (jockey) {
        return !usedJockeyIds.has(String(jockey._id));
      })
      .map(mapPublicUser),
    registrations: raceRegistrations.map(mapRegistration),
  };
}

function mapTournament(tournament) {
  return {
    id: String(tournament._id),
    slug: tournament.slug,
    name: tournament.name,
    description: tournament.description || "",
    location: tournament.location,
    banner: tournament.banner || "",
    type: tournament.type,
    status: tournament.status,
    startDate: tournament.startDate || null,
    endDate: tournament.endDate || null,
    rules: tournament.rules || "",
    config: tournament.config || {},
    races: (tournament.races || []).map(mapRace),
    registrations: (tournament.registrations || []).map(mapRegistration),
    raceCount: (tournament.races || []).length,
    registrationCount: (tournament.registrations || []).length,
    createdAt: tournament.createdAt,
    updatedAt: tournament.updatedAt,
  };
}

function findTournamentByIdOrSlug(identifier) {
  var conditions = [{ slug: identifier }];
  if (mongoose.Types.ObjectId.isValid(identifier)) {
    conditions.unshift({ _id: identifier });
  }
  return Tournament.findOne({ $or: conditions });
}

function getRaceDefaults(tournament) {
  var config = tournament.config || {};
  return {
    scheduledAt: tournament.startDate,
    track: tournament.location || "",
    maxHorses: config.maxRegistrations || 0,
    entryFee: config.entryFee || 0,
    deposit: config.depositFee || 0,
    regDeadline: config.deadlineAt || tournament.startDate,
    checkIn: "08:00",
  };
}

function buildRacePayload(body, fallbackRaceNumber, defaults) {
  var prizes = body.prizes || {};
  defaults = defaults || {};
  return {
    raceNumber: toNumber(body.raceNumber, fallbackRaceNumber),
    name: body.name || `Cuộc đua ${fallbackRaceNumber}`,
    distance: toNumber(body.distance, 0),
    scheduledAt: toDate(body.scheduledAt) || defaults.scheduledAt,
    status: body.status || "Nháp",
    description: body.description || "",
    track: body.track || defaults.track || "",
    surface: body.surface || "Cỏ",
    category: body.category || "Open",
    minHorses: toNumber(body.minHorses, 0),
    maxHorses: toNumber(body.maxHorses, defaults.maxHorses || 0),
    entryFee: toNumber(body.entryFee, defaults.entryFee || 0),
    deposit: toNumber(body.deposit, defaults.deposit || 0),
    regDeadline: toDate(body.regDeadline) || defaults.regDeadline,
    checkIn: body.checkIn || defaults.checkIn || "",
    prizes: {
      first: toNumber(prizes.first, 0),
      second: toNumber(prizes.second, 0),
      third: toNumber(prizes.third, 0),
    },
  };
}

router.get("/", async function (req, res, next) {
  try {
    var query = {};
    var status = (req.query.status || "").trim();
    var type = (req.query.type || "").trim();
    var search = (req.query.search || "").trim();

    if (status) query.status = status;
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
    res.json(tournaments.map(mapTournament));
  } catch (err) {
    next(err);
  }
});

router.get("/owner/open", async function (req, res, next) {
  try {
    var tournaments = await Tournament.find({ status: "Đang mở đăng ký" })
      .sort({ createdAt: -1 })
      .exec();

    res.json(
      tournaments.map(function (tournament) {
        var openRaces = (tournament.races || [])
          .filter(function (race) {
            return isRaceOpenForRegistration(tournament, race);
          })
          .map(mapRace);

        return Object.assign({}, mapTournament(tournament), {
          races: openRaces,
          openRaceCount: openRaces.length,
        });
      }),
    );
  } catch (err) {
    next(err);
  }
});

router.get(
  "/owner/registrations",
  authenticate,
  requireRole("OWNER", "ADMIN"),
  async function (req, res, next) {
    try {
      var tournaments = await Tournament.find({
        "registrations.ownerId": req.user.id,
      })
        .sort({ updatedAt: -1 })
        .exec();

      var registrations = [];
      tournaments.forEach(function (tournament) {
        (tournament.registrations || []).forEach(function (registration) {
          if (String(registration.ownerId || "") === String(req.user.id)) {
            var race = tournament.races.id(registration.raceId);
            registrations.push(
              Object.assign({}, mapRegistration(registration), {
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
  },
);

router.get("/:identifier", async function (req, res, next) {
  try {
    var tournament = await findTournamentByIdOrSlug(
      req.params.identifier,
    ).exec();

    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    res.json(mapTournament(tournament));
  } catch (err) {
    next(err);
  }
});

router.post(
  "/",
  authenticate,
  requireRole("ADMIN"),
  async function (req, res, next) {
    try {
      var name = (req.body.name || "").trim();
      var location = (req.body.location || "").trim();
      var slug = (
        req.body.slug ||
        createSlug(name) ||
        createSlug(location) ||
        "giai-dau"
      ).trim();

      if (!name || !location) {
        return res
          .status(400)
          .json({ error: "Name and location are required" });
      }

      var exists = await Tournament.findOne({ slug: slug }).exec();
      if (exists) {
        return res
          .status(409)
          .json({ error: "Tournament slug already exists" });
      }

      var tournament = await Tournament.create({
        name: name,
        slug: slug,
        description: req.body.description || "",
        location: location,
        banner: req.body.banner || "",
        type: req.body.type || "regular",
        status: req.body.status || "Nháp",
        startDate: toDate(req.body.startDate),
        endDate: toDate(req.body.endDate),
        rules: req.body.rules || "",
        config: req.body.config || {},
        createdBy: req.user.id,
      });

      res.status(201).json(mapTournament(tournament));
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  "/:identifier",
  authenticate,
  requireRole("ADMIN"),
  async function (req, res, next) {
    try {
      var tournament = await findTournamentByIdOrSlug(
        req.params.identifier,
      ).exec();

      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }

      var nextName = req.body.name;
      var nextSlug = req.body.slug;

      if (nextName !== undefined)
        tournament.name = String(nextName).trim() || tournament.name;
      if (nextSlug !== undefined)
        tournament.slug = createSlug(nextSlug) || tournament.slug;
      if (req.body.description !== undefined)
        tournament.description = req.body.description;
      if (req.body.location !== undefined)
        tournament.location = req.body.location;
      if (req.body.banner !== undefined) tournament.banner = req.body.banner;
      if (req.body.type !== undefined) tournament.type = req.body.type;
      if (req.body.status !== undefined) tournament.status = req.body.status;
      if (req.body.startDate !== undefined)
        tournament.startDate = toDate(req.body.startDate);
      if (req.body.endDate !== undefined)
        tournament.endDate = toDate(req.body.endDate);
      if (req.body.rules !== undefined) tournament.rules = req.body.rules;

      if (req.body.config) {
        tournament.config = Object.assign(
          {},
          tournament.config.toObject
            ? tournament.config.toObject()
            : tournament.config,
          req.body.config,
        );
      }

      await tournament.save();
      res.json(mapTournament(tournament));
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  "/:identifier/config",
  authenticate,
  requireRole("ADMIN"),
  async function (req, res, next) {
    try {
      var tournament = await findTournamentByIdOrSlug(
        req.params.identifier,
      ).exec();

      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }

      tournament.type = req.body.type || tournament.type;
      tournament.status = req.body.status || tournament.status;
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
      res.json(mapTournament(tournament));
    } catch (err) {
      next(err);
    }
  },
);

router.get("/:identifier/races", async function (req, res, next) {
  try {
    var tournament = await findTournamentByIdOrSlug(
      req.params.identifier,
    ).exec();

    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    res.json((tournament.races || []).map(mapRace));
  } catch (err) {
    next(err);
  }
});

router.get(
  "/:identifier/races/:raceId/owner-options",
  authenticate,
  requireRole("OWNER", "ADMIN"),
  async function (req, res, next) {
    try {
      var tournament = await findTournamentByIdOrSlug(
        req.params.identifier,
      ).exec();

      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }

      var race = tournament.races.id(req.params.raceId);
      if (!race) {
        return res.status(404).json({ error: "Race not found" });
      }

      if (!isRaceOpenForRegistration(tournament, race)) {
        return res
          .status(409)
          .json({ error: "Race is not open for registration" });
      }

      var options = await buildOwnerRaceOptions(tournament, race, req.user.id);
      res.json(options);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/:identifier/races",
  authenticate,
  requireRole("ADMIN", "REFEREE"),
  async function (req, res, next) {
    try {
      var tournament = await findTournamentByIdOrSlug(
        req.params.identifier,
      ).exec();

      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }

      var raceNumber = Number(
        req.body.raceNumber || tournament.races.length + 1,
      );

      tournament.races.push(
        Object.assign(
          buildRacePayload(req.body, raceNumber, getRaceDefaults(tournament)),
          { results: [] },
        ),
      );

      await tournament.save();
      res.status(201).json(mapTournament(tournament));
    } catch (err) {
      next(err);
    }
  },
);

router.get("/:identifier/races/:raceId", async function (req, res, next) {
  try {
    var tournament = await findTournamentByIdOrSlug(
      req.params.identifier,
    ).exec();

    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    var race = tournament.races.id(req.params.raceId);
    if (!race) {
      return res.status(404).json({ error: "Race not found" });
    }

    res.json(mapRace(race));
  } catch (err) {
    next(err);
  }
});

router.patch(
  "/:identifier/races/:raceId",
  authenticate,
  requireRole("ADMIN", "REFEREE"),
  async function (req, res, next) {
    try {
      var tournament = await findTournamentByIdOrSlug(
        req.params.identifier,
      ).exec();

      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }

      var race = tournament.races.id(req.params.raceId);
      if (!race) {
        return res.status(404).json({ error: "Race not found" });
      }

      if (req.body.name !== undefined) race.name = req.body.name;
      if (req.body.raceNumber !== undefined)
        race.raceNumber = toNumber(req.body.raceNumber, race.raceNumber);
      if (req.body.distance !== undefined)
        race.distance = toNumber(req.body.distance, race.distance);
      if (req.body.scheduledAt !== undefined)
        race.scheduledAt = toDate(req.body.scheduledAt);
      if (req.body.status !== undefined) race.status = req.body.status;
      if (req.body.description !== undefined)
        race.description = req.body.description;
      if (req.body.track !== undefined) race.track = req.body.track;
      if (req.body.surface !== undefined) race.surface = req.body.surface;
      if (req.body.category !== undefined) race.category = req.body.category;
      if (req.body.minHorses !== undefined)
        race.minHorses = toNumber(req.body.minHorses, race.minHorses);
      if (req.body.maxHorses !== undefined)
        race.maxHorses = toNumber(req.body.maxHorses, race.maxHorses);
      if (req.body.entryFee !== undefined)
        race.entryFee = toNumber(req.body.entryFee, race.entryFee);
      if (req.body.deposit !== undefined)
        race.deposit = toNumber(req.body.deposit, race.deposit);
      if (req.body.regDeadline !== undefined)
        race.regDeadline = toDate(req.body.regDeadline);
      if (req.body.checkIn !== undefined) race.checkIn = req.body.checkIn;
      if (req.body.prizes) {
        var currentPrizes = mapPrizes(race.prizes);
        race.prizes = Object.assign(currentPrizes, {
          first: toNumber(req.body.prizes.first, currentPrizes.first),
          second: toNumber(req.body.prizes.second, currentPrizes.second),
          third: toNumber(req.body.prizes.third, currentPrizes.third),
        });
      }

      await tournament.save();
      res.json(mapTournament(tournament));
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  "/:identifier/races/:raceId",
  authenticate,
  requireRole("ADMIN", "REFEREE"),
  async function (req, res, next) {
    try {
      var tournament = await findTournamentByIdOrSlug(
        req.params.identifier,
      ).exec();

      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }

      var race = tournament.races.id(req.params.raceId);
      if (!race) {
        return res.status(404).json({ error: "Race not found" });
      }

      race.deleteOne();
      await tournament.save();
      res.json(mapTournament(tournament));
    } catch (err) {
      next(err);
    }
  },
);

router.get("/:identifier/registrations", async function (req, res, next) {
  try {
    var tournament = await findTournamentByIdOrSlug(
      req.params.identifier,
    ).exec();

    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    res.json(tournament.registrations.map(mapRegistration));
  } catch (err) {
    next(err);
  }
});

router.post(
  "/:identifier/owner/registrations",
  authenticate,
  requireRole("OWNER", "ADMIN"),
  async function (req, res, next) {
    try {
      var tournament = await findTournamentByIdOrSlug(
        req.params.identifier,
      ).exec();

      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }

      if (!isTournamentOpenForRegistration(tournament)) {
        return res
          .status(409)
          .json({ error: "Tournament is not open for registration" });
      }

      var raceId = req.body.raceId || "";
      var race = raceId ? tournament.races.id(raceId) : null;
      if (!race) {
        return res.status(400).json({ error: "Race is required" });
      }

      if (!isRaceOpenForRegistration(tournament, race)) {
        return res
          .status(409)
          .json({ error: "Race is not open for registration" });
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
        return res.status(400).json({ error: "Registrant name is required" });
      }

      if (!horse || String(horse.createdBy || "") !== String(req.user.id)) {
        return res.status(404).json({ error: "Horse not found" });
      }

      if (horse.racingStatus === "cannot-race") {
        return res.status(400).json({ error: "Horse cannot race" });
      }

      if (!jockey || jockey.role !== "JOCKEY") {
        return res.status(404).json({ error: "Jockey not found" });
      }

      var horseAlreadyUsed = (tournament.registrations || []).some(
        function (item) {
          return (
            String(item.raceId || "") === String(race._id) &&
            String(item.horseId || "") === String(horse._id)
          );
        },
      );

      if (horseAlreadyUsed) {
        return res
          .status(409)
          .json({ error: "Horse is already registered for this race" });
      }

      var jockeyAlreadyUsed = (tournament.registrations || []).some(
        function (item) {
          return (
            String(item.raceId || "") === String(race._id) &&
            String(item.jockeyId || "") === String(jockey._id)
          );
        },
      );

      if (jockeyAlreadyUsed) {
        return res
          .status(409)
          .json({ error: "Jockey is already registered for this race" });
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
      res.status(201).json(mapTournament(tournament));
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/:identifier/races/:raceId/results",
  authenticate,
  requireRole("ADMIN", "REFEREE"),
  async function (req, res, next) {
    try {
      var tournament = await findTournamentByIdOrSlug(
        req.params.identifier,
      ).exec();

      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }

      var race = tournament.races.id(req.params.raceId);
      if (!race) {
        return res.status(404).json({ error: "Race not found" });
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
      race.status = req.body.status || "Hoàn thành";
      tournament.status = req.body.tournamentStatus || tournament.status;

      await tournament.save();
      res.json(mapTournament(tournament));
    } catch (err) {
      next(err);
    }
  },
);

router.get("/:identifier/results", async function (req, res, next) {
  try {
    var tournament = await findTournamentByIdOrSlug(
      req.params.identifier,
    ).exec();

    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    res.json(
      tournament.races.map(function (race) {
        return {
          race: mapRace(race),
          results: (race.results || []).map(mapResult),
        };
      }),
    );
  } catch (err) {
    next(err);
  }
});

module.exports = router;
