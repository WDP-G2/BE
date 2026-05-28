var mongoose = require("mongoose");

var NewsSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true },
    title: { type: String, required: true, trim: true },
    summary: { type: String, default: "" },
    content: { type: String, default: "" },
    thumbnail: { type: String, default: "" },
    category: { type: String, default: "Tin tức" },
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "published",
    },
    featured: { type: Boolean, default: false },
    authorName: { type: String, default: "Ban quản trị" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("News", NewsSchema);
