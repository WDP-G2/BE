var express = require("express");
var router = express.Router();
var mongoose = require("mongoose");
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
    fullName: registration.fullName,
    ownerId: registration.ownerId ? String(registration.ownerId) : "",
    ownerName: registration.ownerName || "",
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
  "/:identifier/registrations",
  authenticate,
  async function (req, res, next) {
    try {
      var tournament = await findTournamentByIdOrSlug(
        req.params.identifier,
      ).exec();

      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }

      var fullName = (
        req.body.fullName ||
        req.user.fullName ||
        req.user.username ||
        ""
      ).trim();
      var horseName = (req.body.horseName || "").trim();
      var jockeyName = (req.body.jockeyName || "").trim();

      if (!fullName || !horseName) {
        return res
          .status(400)
          .json({ error: "Registrant name and horse name are required" });
      }

      tournament.registrations.push({
        fullName: fullName,
        ownerId: req.user.id,
        ownerName: req.user.fullName || req.user.username || fullName,
        horseName: horseName,
        horseAge: req.body.horseAge ? Number(req.body.horseAge) : undefined,
        horseBreed: req.body.horseBreed || "",
        jockeyId: req.body.jockeyId || undefined,
        jockeyName: jockeyName,
        raceId: req.body.raceId || undefined,
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
