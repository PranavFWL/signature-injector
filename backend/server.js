const express = require("express");
const cors = require("cors");



const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(cors());

// Test route
app.get("/", (req, res) => {
  res.send("Backend is running!");
});

const signRoute = require("./routes/sign");
app.use("/sign-pdf", signRoute);

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("Server running on port", PORT));
