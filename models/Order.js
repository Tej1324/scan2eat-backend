const mongoose = require("mongoose");

/* ================= ITEM ================= */
const ItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  qty: {
    type: Number,
    required: true
  },
  price: {
    type: Number,
    required: true
  }
});

/* ================= ORDER ================= */
const OrderSchema = new mongoose.Schema(
  {
    tableId: {
      type: Number,
      required: true
    },

    items: {
      type: [ItemSchema],
      required: true
    },

    total: {
      type: Number,
      required: true
    },

    status: {
      type: String,
      enum: ["pending", "cooking", "ready", "completed"],
      default: "pending"
    },

    paid: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true // adds createdAt & updatedAt
  }
);

module.exports = mongoose.model("Order", OrderSchema);
