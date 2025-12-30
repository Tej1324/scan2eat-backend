require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const http = require("http");
const { Server } = require("socket.io");

const Order = require("./models/Order");

const app = express();
const server = http.createServer(app);

/* ================= CONFIG ================= */
const PORT = process.env.PORT || 4000;

/* ================= CORS (MUST BE FIRST) ================= */
const corsOptions = {
  origin: [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5500",
    "https://scan2eat-frontend.vercel.app",
    "https://scan2eat-cashier.netlify.app",
    "https://scan2eat-kitchen.netlify.app"
  ],
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "x-access-token"],
  credentials: false
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

/* ================= MIDDLEWARE ================= */
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));
app.use(helmet());
app.disable("x-powered-by");

/* ================= RATE LIMIT ================= */
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100
});
app.use("/api", apiLimiter);

/* ================= SOCKET.IO ================= */
const io = new Server(server, {
  cors: {
    origin: corsOptions.origin,
    methods: ["GET", "POST"]
  }
});

io.on("connection", socket => {
  console.log("🔌 Client connected:", socket.id);
});

/* ================= DB ================= */
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => {
    console.error("❌ MongoDB error:", err.message);
    process.exit(1);
  });

/* ================= AUTH ================= */
function requireCashier(req, res, next) {
  const token = req.headers["x-access-token"];
  if (token !== process.env.CASHIER_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

/* ================= ROUTES ================= */

/* CREATE ORDER (PUBLIC) */
app.post("/api/orders", async (req, res) => {
  try {
    const { tableId, items } = req.body;

    if (!Number.isInteger(tableId) || !Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: "Invalid order" });
    }

    const valid = items.every(
      i =>
        typeof i.name === "string" &&
        typeof i.price === "number" &&
        typeof i.qty === "number"
    );

    if (!valid) {
      return res.status(400).json({ error: "Invalid items" });
    }

    const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);

    const order = await Order.create({
      tableId,
      items,
      total,
      status: "pending"
    });

    io.emit("order:new", order);
    res.status(201).json(order);
  } catch (err) {
    console.error("❌ Order error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* GET ORDERS */
app.get("/api/orders", async (req, res) => {
  const { status } = req.query;
  const filter = status ? { status } : {};
  const orders = await Order.find(filter).sort({ createdAt: 1 });
  res.json(orders);
});

/* UPDATE ORDER STATUS */
app.patch("/api/orders/:id", requireCashier, async (req, res) => {
  const allowed = ["pending", "cooking", "ready", "completed"];
  const { status } = req.body;

  if (!allowed.includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });

  order.status = status;
  await order.save();

  io.emit("order:update", order);
  res.json(order);
});

/* HEALTH CHECK */
app.get("/health", (_, res) => {
  res.json({ status: "ok" });
});

/* ================= START ================= */
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
