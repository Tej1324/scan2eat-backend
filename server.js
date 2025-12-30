require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const http = require("http");

const Order = require("./models/Order");

const app = express();
const server = http.createServer(app);

/* ================= CONFIG ================= */
const PORT = process.env.PORT || 8080;

/* ================= CORS ================= */
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5500",
  "https://scan2eat-frontend.vercel.app",
  "https://scan2eat-cashier.netlify.app",
  "https://scan2eat-kitchen.netlify.app"
];

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "x-access-token"]
  })
);

/* ================= MIDDLEWARE ================= */
app.use(express.json());
app.use(helmet());
app.disable("x-powered-by");

/* ================= RATE LIMIT ================= */
app.use(
  "/api",
  rateLimit({
    windowMs: 60 * 1000,
    max: 100
  })
);

/* ================= DATABASE ================= */
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => {
    console.error("❌ MongoDB error:", err.message);
    process.exit(1);
  });

/* ================= AUTH ================= */
function requireCashier(req, res, next) {
  if (req.headers["x-access-token"] !== process.env.CASHIER_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

/* ================= ROUTES ================= */
app.get("/health", (_, res) => {
  res.status(200).json({ status: "ok" });
});

app.post("/api/orders", async (req, res) => {
  const { tableId, items } = req.body;

  if (!Number.isInteger(tableId) || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: "Invalid order" });
  }

  const total = items.reduce((s, i) => s + i.price * i.qty, 0);

  const order = await Order.create({
    tableId,
    items,
    total,
    status: "pending"
  });

  res.status(201).json(order);
});

app.get("/api/orders", async (_, res) => {
  const orders = await Order.find().sort({ createdAt: 1 });
  res.json(orders);
});

app.patch("/api/orders/:id", requireCashier, async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ error: "Not found" });

  order.status = req.body.status;
  await order.save();
  res.json(order);
});

/* ================= START ================= */
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
