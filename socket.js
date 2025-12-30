const { Server } = require("socket.io");

module.exports = function initSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: [
        "https://scan2eat-frontend.vercel.app",
        "https://scan2eat-cashier.netlify.app",
        "https://scan2eat-kitchen.netlify.app",
        "http://localhost:5173"
      ],
      methods: ["GET", "POST"]
    }
  });

  io.on("connection", socket => {
    console.log("🔌 Client connected:", socket.id);

    socket.on("disconnect", () => {
      console.log("❌ Client disconnected:", socket.id);
    });
  });

  return io;
};
