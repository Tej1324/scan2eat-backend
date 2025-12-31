const mongoose = require("mongoose");

const menuItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true },
    description: { type: String, maxlength: 120 },
    imageUrl: { type: String },
    available: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("MenuItem", menuItemSchema);
