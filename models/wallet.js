var mongoose = require("../db");
var Schema = mongoose.Schema;

var WalletSchema = new Schema(
  {
    ownerType: {
      type: String,
      enum: ["USER", "ADMIN"],
      required: true,
      index: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: "User", unique: true, sparse: true },
    currency: { type: String, default: "VND" },
    availableBalance: { type: Number, default: 0 },
    holdBalance: { type: Number, default: 0 },
    status: { type: String, enum: ["ACTIVE", "FROZEN", "CLOSED"], default: "ACTIVE" },
    createdBy: { type: String, default: "SYSTEM" },
    updatedBy: { type: String, default: "SYSTEM" },
  },
  { timestamps: true },
);

WalletSchema.index({ ownerType: 1, userId: 1 });

module.exports = mongoose.model("Wallet", WalletSchema);
