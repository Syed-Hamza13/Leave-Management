import "dotenv/config";
import app from "./app.js";

const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(`Leave Management API running on ${HOST}:${PORT}`);
});