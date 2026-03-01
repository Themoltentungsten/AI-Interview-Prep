
import dotenv from "dotenv";
dotenv.config();
import {Redis} from "ioredis";

const redisUrl = process.env.VALKEY_URL || "redis://localhost:6379";

export const redisClient = new Redis(
  redisUrl
);

export const subscriber = new Redis(redisUrl); // locked to subscribe only