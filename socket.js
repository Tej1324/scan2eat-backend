module.exports = (io) => {
    io.on("connection", (socket) => {
        console.log("User connected:", socket.id);

        socket.on("placeOrder", (orderData) => {
            io.emit("newOrder", orderData); // Send to chef & cashier
        });

        socket.on("updateItemStatus", (update) => {
            io.emit("orderStatus", update); // Send to customer & cashier
        });

        socket.on("paymentDone", (orderId) => {
            io.emit("paymentUpdate", { orderId, status: "paid" });
        });
    });
};

