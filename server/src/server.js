import 'dotenv/config';

import app from "./app.js";

import { env } from "./config/env.js";
import { connectRedis } from "./config/redis.js";

async function startServer() {
  try {
    await connectRedis();

    app.listen(env.PORT, env.HOST, () => {
      console.log("");
      console.log("======================================");
      console.log("   LEAVE MANAGEMENT API");
      console.log("======================================");
      console.log(`Environment : ${env.NODE_ENV}`);
      console.log(`Server      : http://${env.HOST}:${env.PORT}`);
      console.log(`Frontend    : ${env.FRONTEND_URL}`);
      console.log("Redis       : connected");
      console.log("======================================");
      console.log("");
    });
  } catch (error) {
    console.error("❌ Failed to start server");
    console.error(error);

    process.exit(1);
  }
}

startServer();