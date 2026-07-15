var invitationService = require("../services/invitationService");
var { mapInvitation } = require("../utils/ownerInvitationMapper");

function respondWithError(res, err, next) {
  if (err && err.status) {
    return res.status(err.status).json({ error: err.message });
  }
  next(err);
}

async function create(req, res, next) {
  try {
    var payload = Object.assign({}, req.body, { _idempotencyKey: req.get("Idempotency-Key") });
    var result = await invitationService.createInvitation(req.user, payload);
    var mapped = mapInvitation(result.invitation);
    mapped.horseBread = result.horseBreedLabel;
    res.status(201).json(mapped);
  } catch (err) {
    respondWithError(res, err, next);
  }
}

async function listMine(req, res, next) {
  try {
    var invitations = await invitationService.listForJockey(req.user, req.query.jockeyId);
    res.json(invitations.map(mapInvitation));
  } catch (err) {
    next(err);
  }
}

async function listSent(req, res, next) {
  try {
    var invitations = await invitationService.listForOwner(req.user, req.query.ownerId);
    res.json(invitations.map(mapInvitation));
  } catch (err) {
    next(err);
  }
}

async function respond(req, res, next) {
  try {
    var action = String(req.body.action || "").toLowerCase();
    var invitation = await invitationService.respondToInvitation(req.user, req.params.id, action);
    res.json(mapInvitation(invitation));
  } catch (err) {
    respondWithError(res, err, next);
  }
}

module.exports = {
  create: create,
  listMine: listMine,
  listSent: listSent,
  respond: respond,
};
