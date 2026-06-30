var mongoose = require("../db");
var Schema = mongoose.Schema;

var SystemSettingsSchema = new Schema(
  {
    key: { type: String, default: "singleton", unique: true },
    defaultRegistrationFee: { type: Number, default: 5000000 },
    lateCheckInFee: { type: Number, default: 500000 },
    defaultTournamentRules: {
      type: String,
      default:
        "1. Ngua phai co giay chung nhan suc khoe hop le.\n2. Jockey phai co chung chi FIA.\n3. Kiem tra doping bat buoc.",
    },
    registrationOpenEmailSubject: {
      type: String,
      default: "[HorseRacing] Mo dang ky giai dau {{tournament}}",
    },
    checkInReminderEmailSubject: {
      type: String,
      default: "[HorseRacing] Nhac check-in cuoc dua {{race}}",
    },
    raceResultEmailSubject: {
      type: String,
      default: "[HorseRacing] Ket qua cuoc dua {{race}}",
    },
    twoFactorPolicy: {
      type: String,
      enum: ["DISABLED", "ADMIN_ONLY", "ALL_USERS"],
      default: "DISABLED",
    },
    sessionDurationMinutes: { type: Number, default: 60 },
    systemName: { type: String, default: "Horse Racing Admin" },
    primaryColor: { type: String, default: "#D4A017" },
    raceDistancesMeters: { type: [Number], default: [1000, 1200, 1500] },
    updatedBy: { type: String, default: "SYSTEM" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("SystemSettings", SystemSettingsSchema);
