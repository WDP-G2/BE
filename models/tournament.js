var mongoose = require("../db");
var Schema = mongoose.Schema;

var ResultSchema = new Schema(
  {
    position: { type: Number, required: true },
    horseName: { type: String, required: true },
    jockeyId: { type: Schema.Types.ObjectId, ref: "User" },
    jockeyName: { type: String },
    time: { type: String },
    points: { type: Number, default: 0 },
    notes: { type: String },
  },
  { _id: true },
);

var RaceSchema = new Schema(
  {
    raceNumber: { type: Number, required: true },
    name: { type: String, required: true },
    distance: { type: String, required: true },
    scheduledAt: { type: Date },
    scheduledEndAt: { type: Date },
    venueId: { type: String, default: "" },
    venueName: { type: String, default: "" },
    venueAddress: { type: String, default: "" },
    status: {
      type: String,
      enum: [
        "Nháp",
        "Sắp chạy",
        "Sắp diễn ra",
        "Đang chạy",
        "Đang diễn ra",
        "Hoàn thành",
        "Đã hủy",
      ],
      default: "Nháp",
    },
    description: { type: String },
    track: { type: String, default: "" },
    surface: { type: String, default: "Cỏ" },
    category: { type: String, default: "Open" },
    minHorses: { type: Number, default: 0 },
    maxHorses: { type: Number, default: 0 },
    entryFee: { type: Number, default: 0 },
    deposit: { type: Number, default: 0 },
    regDeadline: { type: Date },
    checkIn: { type: String, default: "" },
    prizes: { type: Schema.Types.Mixed, default: [] },
    results: [ResultSchema],
    refereeId: { type: Schema.Types.ObjectId, ref: "User" },
    salaryConfigId: { type: Schema.Types.ObjectId, ref: "RefereeSalaryConfig" },
    refereePaymentStatus: {
      type: String,
      enum: ["NONE", "HELD", "PAID", "RELEASED"],
      default: "NONE",
    },
    refereePaymentAmount: { type: Number, default: 0 },
  },
  { _id: true },
);

var RegistrationSchema = new Schema(
  {
    tournamentId: { type: Schema.Types.ObjectId, ref: "Tournament" },
    fullName: { type: String, required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User" },
    ownerName: { type: String },
    horseId: { type: Schema.Types.ObjectId, ref: "Horse" },
    horseName: { type: String, required: true },
    horseAge: { type: Number },
    horseBreed: { type: String },
    jockeyId: { type: Schema.Types.ObjectId, ref: "User" },
    jockeyName: { type: String },
    raceId: { type: Schema.Types.ObjectId },
    status: {
      type: String,
      enum: ["Chờ duyệt", "Đã duyệt", "Từ chối", "Đang chạy", "Hoàn thành"],
      default: "Chờ duyệt",
    },
    gateNumber: { type: Number },
    checkInStatus: {
      type: String,
      enum: ["PENDING", "CHECKED_IN", "ABSENT"],
      default: "PENDING",
    },
    participantStatus: {
      type: String,
      enum: ["REGISTERED", "CHECKED_IN", "RACING", "FINISHED", "DISQUALIFIED", "ABSENT"],
      default: "REGISTERED",
    },
    notes: { type: String },
    registeredAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

var TournamentSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    description: { type: String, default: "" },
    location: { type: String, required: true },
    banner: { type: String, default: "" },
    type: {
      type: String,
      enum: ["regular", "championship"],
      default: "regular",
    },
    status: {
      type: String,
      enum: ["Nháp", "Đang mở đăng ký", "Đang diễn ra", "Đã kết thúc"],
      default: "Nháp",
    },
    startDate: { type: Date },
    endDate: { type: Date },
    rules: { type: String, default: "" },
    config: {
      entryFee: { type: Number, default: 0 },
      depositFee: { type: Number, default: 0 },
      refundDays: { type: Number, default: 3 },
      maxRaces: { type: Number, default: 0 },
      maxRegistrations: { type: Number, default: 0 },
      requireJockey: { type: Boolean, default: true },
      requireHorseOwner: { type: Boolean, default: true },
      requireVetCheck: { type: Boolean, default: true },
      requireDopingCheck: { type: Boolean, default: true },
      allowLateRegistration: { type: Boolean, default: false },
      deadlineAt: { type: Date },
    },
    races: [RaceSchema],
    registrations: [RegistrationSchema],
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Tournament", TournamentSchema);
