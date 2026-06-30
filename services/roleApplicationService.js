var RoleApplication = require("../models/roleApplication");
var KycVerification = require("../models/kycVerification");
var User = require("../models/user");
var JockeyProfile = require("../models/jockeyProfile");
var authService = require("./authService");
var adminService = require("./adminService");

function map(item) {
  if (!item) return null;
  var profile = item.profile || {};
  return {
    id: String(item._id),
    profileId: String(item._id),
    userId: String(item.userId),
    username: item.user && (item.user.username || item.user.email) || profile.username || "",
    fullName: item.user && (item.user.fullName || item.user.name) || profile.fullName || "",
    role: item.role,
    status: item.status,
    profile: profile,
    kycVerificationId: item.kycVerificationId ? String(item.kycVerificationId) : null,
    reviewReason: item.reviewReason || "",
    reviewedBy: item.reviewedBy ? String(item.reviewedBy) : null,
    reviewedAt: item.reviewedAt || null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    stableName: profile.stableName || "",
    address: profile.address || "",
    verificationDocumentUrl: profile.verificationDocumentUrl || "",
    displayName: profile.displayName || "",
    phone: profile.phone || "",
    location: profile.location || "",
    favoriteHorseBreed: profile.favoriteHorseBreed || "",
    licenseNumber: profile.licenseNumber || "",
    experienceYears: profile.experienceYears || 0,
    specialty: profile.specialty || "",
    certificationDocumentUrl: profile.certificationDocumentUrl || "",
    heightCm: profile.heightCm || null,
    weightKg: profile.weightKg || null,
    bio: profile.bio || "",
    awards: profile.awards || "",
    achievements: profile.achievements || "",
    specialties: profile.specialties || "",
    avatarUrl: profile.avatarUrl || "",
    licenseDocumentUrl: profile.licenseDocumentUrl || "",
    kycStatus: item.kycStatus || "",
    idNumberMasked: item.idNumberMasked || "",
    kycFullName: item.kycFullName || "",
    dateOfBirth: item.dateOfBirth || "",
    gender: item.gender || "",
    kycAddress: item.kycAddress || "",
    issueDate: item.issueDate || "",
    faceScore: item.faceScore == null ? null : item.faceScore,
    cccdFrontImageUrl: item.cccdFrontImageUrl || "",
    cccdBackImageUrl: item.cccdBackImageUrl || "",
    selfieImageUrl: item.selfieImageUrl || "",
    kycRejectReason: item.kycRejectReason || "",
  };
}

async function mapWithUser(item) {
  if (!item) return null;
  item.user = await User.findById(item.userId).lean().exec();
  if (item.kycVerificationId) {
    var kyc = await KycVerification.findById(item.kycVerificationId).lean().exec();
    if (kyc) {
      item.kycStatus = kyc.status;
      item.idNumberMasked = maskId(kyc.ocrResult && kyc.ocrResult.idNumber);
      item.kycFullName = kyc.ocrResult && kyc.ocrResult.fullName || "";
      item.dateOfBirth = kyc.ocrResult && kyc.ocrResult.dateOfBirth || "";
      item.gender = kyc.ocrResult && kyc.ocrResult.gender || "";
      item.kycAddress = kyc.ocrResult && kyc.ocrResult.address || "";
      item.issueDate = kyc.ocrResult && kyc.ocrResult.issueDate || "";
      item.faceScore = kyc.faceMatchResult && kyc.faceMatchResult.score;
      item.cccdFrontImageUrl = kyc.frontImageUrl || "";
      item.cccdBackImageUrl = kyc.backImageUrl || "";
      item.selfieImageUrl = kyc.selfieImageUrl || "";
      item.kycRejectReason = kyc.faceMatchResult && kyc.faceMatchResult.reason || "";
    }
  }
  return map(item);
}

function maskId(value) {
  value = String(value || "");
  if (value.length <= 4) return value;
  return value.slice(0, 2) + "******" + value.slice(-2);
}

function bad(message, status) {
  var err = new Error(message);
  err.status = status || 400;
  return err;
}

async function currentUser(req) {
  var user = await authService.currentUser(req);
  if (!user || !user._id) {
    var err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }
  return user;
}

async function submit(req, role, payload) {
  var user = await currentUser(req);
  role = String(role || "").toUpperCase();
  if (["OWNER", "JOCKEY", "SPECTATOR", "REFEREE"].indexOf(role) < 0) {
    throw bad("Unsupported role application");
  }
  if (String(user.role || "USER").toUpperCase() !== "USER") {
    throw bad("Role already approved");
  }
  if (user.roleApprovalStatus === "PENDING") {
    throw bad("A role application is already pending");
  }
  if (role === "JOCKEY") {
    await syncJockeyProfile(user, payload || {}, "DRAFT", null);
  }
  var item = await RoleApplication.findOneAndUpdate(
    { userId: user._id, role: role },
    {
      userId: user._id,
      role: role,
      status: "DRAFT",
      profile: payload || {},
      updatedBy: user.username || user.email || "SYSTEM",
      reviewReason: "",
      reviewedBy: null,
      reviewedAt: null,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).exec();
  return mapWithUser(item);
}

async function list(filter) {
  var query = Object.assign({}, filter || {});
  if (!query.status) query.status = { $ne: "DRAFT" };
  if (query.status === "DRAFT" || query.status === "NONE") return [];
  var items = await RoleApplication.find(query).sort({ createdAt: -1 }).exec();
  var result = [];
  for (var i = 0; i < items.length; i += 1) result.push(await mapWithUser(items[i]));
  return result;
}

async function approve(req, id) {
  var admin = await currentUser(req);
  var item = await RoleApplication.findById(id).exec();
  if (!item) return null;
  if (item.status !== "PENDING") throw bad("Only pending role applications can be approved");
  var kyc = item.kycVerificationId ? await KycVerification.findById(item.kycVerificationId).exec() : null;
  if (!kyc || kyc.status !== "PASSED") throw bad("Không thể duyệt role vì user chưa KYC thành công");
  item.status = "APPROVED";
  item.reviewedBy = admin._id;
  item.reviewedAt = new Date();
  item.reviewReason = "";
  await item.save();
  await User.findByIdAndUpdate(item.userId, {
    role: item.role,
    pendingRole: item.role,
    roleApprovalStatus: "APPROVED",
    roleReviewReason: "",
    roleReviewedBy: admin._id,
    roleReviewedAt: new Date(),
    updatedAt: new Date(),
  }).exec();
  if (item.role === "JOCKEY") {
    await syncJockeyProfile(await User.findById(item.userId).exec(), item.profile || {}, "APPROVED", {
      reviewedBy: admin._id,
      reviewedAt: new Date(),
      reviewReason: "",
      kycVerificationId: item.kycVerificationId,
    });
  }
  await adminService.recordAudit(admin, "ROLE_APPLICATION_APPROVED", "ROLE_APPLICATION", item._id, "Role application approved", null, { role: item.role, userId: String(item.userId) });
  return mapWithUser(item);
}

async function reject(req, id, payload) {
  var admin = await currentUser(req);
  var item = await RoleApplication.findById(id).exec();
  if (!item) return null;
  if (item.status !== "PENDING") throw bad("Only pending role applications can be rejected");
  item.status = "REJECTED";
  item.reviewedBy = admin._id;
  item.reviewedAt = new Date();
  item.reviewReason = payload.reason || payload.reviewReason || payload.note || "";
  await item.save();
  await User.findByIdAndUpdate(item.userId, {
    role: "USER",
    pendingRole: item.role,
    roleApprovalStatus: "REJECTED",
    roleReviewReason: item.reviewReason,
    roleReviewedBy: admin._id,
    roleReviewedAt: new Date(),
    updatedAt: new Date(),
  }).exec();
  if (item.role === "JOCKEY") {
    await syncJockeyProfile(await User.findById(item.userId).exec(), item.profile || {}, "REJECTED", {
      reviewedBy: admin._id,
      reviewedAt: new Date(),
      reviewReason: item.reviewReason,
      kycVerificationId: item.kycVerificationId,
    });
  }
  await adminService.recordAudit(admin, "ROLE_APPLICATION_REJECTED", "ROLE_APPLICATION", item._id, "Role application rejected", null, { role: item.role, userId: String(item.userId), reason: item.reviewReason });
  return mapWithUser(item);
}

async function kycOcr(req, payload) {
  var user = await currentUser(req);
  var requestedRole = String(payload.requestedRole || payload.role || user.pendingRole || "").toUpperCase();
  if (["OWNER", "JOCKEY", "SPECTATOR", "REFEREE"].indexOf(requestedRole) < 0) {
    throw bad("Requested role is required");
  }
  var item = await KycVerification.create({
    userId: user._id,
    requestedRole: requestedRole,
    status: "PENDING",
    ocrResult: {
      idNumber: payload.idNumber || "",
      fullName: payload.fullName || user.fullName || user.name || "",
      dateOfBirth: payload.dateOfBirth || "",
      gender: payload.gender || "",
      address: payload.address || "",
      issueDate: payload.issueDate || "",
      raw: payload || {},
    },
    frontImageUrl: payload.cccdFrontImageUrl || payload.frontImageUrl || "",
    backImageUrl: payload.cccdBackImageUrl || payload.backImageUrl || "",
  });
  return {
    kycVerificationId: String(item._id),
    requestedRole: requestedRole,
    kycStatus: item.status,
    idNumberMasked: maskId(item.ocrResult.idNumber),
    fullName: item.ocrResult.fullName,
    dateOfBirth: item.ocrResult.dateOfBirth,
    gender: item.ocrResult.gender,
    address: item.ocrResult.address,
    issueDate: item.ocrResult.issueDate,
  };
}

async function faceMatch(req, id, payload) {
  var user = await currentUser(req);
  var item = await KycVerification.findById(id).exec();
  if (!item) {
    var err = new Error("KYC verification not found");
    err.status = 404;
    throw err;
  }
  if (String(item.userId) !== String(user._id)) throw bad("Cannot verify another user's KYC", 403);
  var score = Number(payload.score || 100);
  item.faceMatchResult = { matched: score >= 80, score: score };
  item.status = score >= 80 ? "PASSED" : "FAILED";
  item.selfieImageUrl = payload.selfieImageUrl || item.selfieImageUrl || "";
  await item.save();
  var application = await RoleApplication.findOne({ userId: user._id, role: item.requestedRole }).exec();
  if (!application) throw bad("Role application draft not found", 404);
  if (score >= 80) {
    application.status = "PENDING";
    application.kycVerificationId = item._id;
    application.reviewReason = "";
    await application.save();
    await User.findByIdAndUpdate(user._id, {
      pendingRole: item.requestedRole,
      roleApprovalStatus: "PENDING",
      roleReviewReason: "",
      roleReviewedBy: null,
      roleReviewedAt: null,
      updatedAt: new Date(),
    }).exec();
    if (item.requestedRole === "JOCKEY") {
      await syncJockeyProfile(user, application.profile || {}, "PENDING", { kycVerificationId: item._id });
    }
  }
  return {
    kycVerificationId: String(item._id),
    profileId: application ? String(application._id) : null,
    requestedRole: item.requestedRole,
    kycStatus: item.status,
    applicationStatus: application ? application.status : null,
    matched: score >= 80,
    faceScore: score,
  };
}

async function getMyApplication(req) {
  var user = await currentUser(req);
  var role = user.pendingRole || user.role;
  var item = null;
  if (role && ["OWNER", "JOCKEY", "SPECTATOR", "REFEREE"].indexOf(String(role).toUpperCase()) >= 0) {
    item = await RoleApplication.findOne({ userId: user._id, role: String(role).toUpperCase() }).sort({ updatedAt: -1 }).exec();
  }
  if (!item) item = await RoleApplication.findOne({ userId: user._id }).sort({ updatedAt: -1 }).exec();
  if (item) return mapWithUser(item);
  return {
    profileId: null,
    userId: String(user._id),
    username: user.username || user.email || "",
    fullName: user.fullName || user.name || "",
    role: user.role || "USER",
    status: user.roleApprovalStatus || "NONE",
    reviewReason: user.roleReviewReason || "",
  };
}

async function syncJockeyProfile(user, payload, status, extra) {
  if (!user || !user._id) return null;
  payload = payload || {};
  extra = extra || {};
  var licenseNumber = payload.licenseNumber || "AUTO-" + String(user._id);
  var duplicate = await JockeyProfile.findOne({ licenseNumber: licenseNumber, userId: { $ne: user._id } }).exec();
  if (duplicate) throw bad("License number already exists", 409);
  var update = {
    userId: user._id,
    licenseNumber: licenseNumber,
    experienceYears: payload.experienceYears || 0,
    heightCm: payload.heightCm,
    weightKg: payload.weightKg,
    bio: payload.bio || "",
    awards: payload.awards || "",
    achievements: payload.achievements || "",
    specialties: payload.specialties || "",
    avatarUrl: payload.avatarUrl || "",
    licenseDocumentUrl: payload.licenseDocumentUrl || "",
    status: status,
    reviewReason: extra.reviewReason || "",
    reviewedBy: extra.reviewedBy || null,
    reviewedAt: extra.reviewedAt || null,
    kycVerificationId: extra.kycVerificationId || undefined,
    updatedBy: user.username || user.email || "SYSTEM",
  };
  return JockeyProfile.findOneAndUpdate(
    { userId: user._id },
    update,
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).exec();
}

module.exports = {
  approve: approve,
  faceMatch: faceMatch,
  getMyApplication: getMyApplication,
  kycOcr: kycOcr,
  list: list,
  reject: reject,
  submit: submit,
};
