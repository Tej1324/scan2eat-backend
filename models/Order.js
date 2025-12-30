const mongoose = require("mongoose");

/* ================= ITEM ================= */
const ItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },

  qty: {
    type: Number,
    required: true,
    min: 1
  },

  price: {
    type: Number,
    required: true,
    min: 0
  },

  spec: {
    type: String,
    default: "",
    maxlength: 100,
    trim: true
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
      required: true,
      min: 0
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
