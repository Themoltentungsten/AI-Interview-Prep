import { Request, Response } from "express";
import { redisClient } from "../config/redis.config.js";
import { AuthenticatedRequest } from "../types/auth-request.js";

export const resumeController = {
  processResume: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const session = req.session;

      if (!session?.user?.id) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const userId = session.user.id;

      const { fileId, S3fileName } = req.body;

      if (!fileId || !S3fileName) {
        return res.status(400).json({ message: "Missing fileId or S3fileName" });
      }

      const job = {
        type: "resume_processing",
        payload: {
          user_id: userId,
          file_id: fileId,
          s3_file_name: S3fileName,
        },
        meta: {
          enqueuedAt: new Date(),
        },
      };

      await redisClient.rpush("jobs", JSON.stringify(job));

      console.log("✅ Job pushed to queue");

      return res.status(200).json({
        message: "Job queued successfully",
      });
    } catch (error) {
      console.error("Error processing resume:", error);
      return res.status(500).json({ message: "Failed to process resume" });
    }
  },

  uploadResume: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const session = req.session;

      if (!session?.user?.id) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const userId = session.user.id;

      // Upload logic here

      return res.status(200).json({ message: "Resume uploaded" });
    } catch (error) {
      console.error("Error uploading resume:", error);
      return res.status(500).json({ message: "Failed to upload resume" });
    }
  },

  deleteResume: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const session = req.session;

      if (!session?.user?.id) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const userId = session.user.id;

      // Delete logic here

      return res.status(200).json({ message: "Resume deleted" });
    } catch (error) {
      console.error("Error deleting resume:", error);
      return res.status(500).json({ message: "Failed to delete resume" });
    }
  },
};