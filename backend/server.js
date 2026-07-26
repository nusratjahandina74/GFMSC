import dotenv from "dotenv";
import app from "./src/app.js";
import connectDB from "./src/config/db.js";

// Execute immediate variables configurations loading
dotenv.config();

// Activate core database connections cluster safely
connectDB();

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`[GFMSC Production Engine]: Server running successfully on port ${PORT}`);
});
