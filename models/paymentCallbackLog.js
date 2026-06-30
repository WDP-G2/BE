var mongoose = require("../db");
var Schema = mongoose.Schema;

var PaymentCallbackLogSchema = new Schema(
  {
    referenceCode: { type: String, default: "", index: true },
    providerTransactionId: { type: String, default: "" },
    status: { type: String, default: "" },
    callbackToken: { type: String, default: "" },
    metadata: { type: String, default: "" },
    validToken: { type: Boolean, default: false },
    processed: { type: Boolean, default: false },
    errorMessage: { type: String, default: "" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("PaymentCallbackLog", PaymentCallbackLogSchema);
