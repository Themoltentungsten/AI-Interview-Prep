import { Request, Response } from "express";
import { redisClient } from "../config/redis.config.js";
import { AuthenticatedRequest } from "../types/auth-request.js";
import { prisma } from "@repo/db/prisma-db";
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
  interviewFeedback: async (req: AuthenticatedRequest, res: Response) => {
    const interviewId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    if (!interviewId) {
      res.status(400).json({ error: "Interview ID is required" });
      return;
    }

    try {
      const raw = await redisClient.get(`interview:${interviewId}:summary`);
      if (!raw) {
        res.status(404).json({ error: "Results not ready yet." });
        return;
      }

      const summary = JSON.parse(raw);

      // Fetch user's score history for the history chart
      const userId = summary.user_id;
      let history: any[] = [];

      if (userId) {
        const historyRaw = await redisClient.lrange(`user:${userId}:interview_scores`, 0, 19);
        history = historyRaw
          .map((h: string) => { try { return JSON.parse(h); } catch { return null; } })
          .filter(Boolean)
          .reverse();

        // Save this session to history (idempotent)
        const alreadySaved = history.some((h) => h.interview_id === interviewId
      );
        if (!alreadySaved) {
          await redisClient.rpush(
            `user:${userId}:interview_scores`,
            JSON.stringify({
              interview_id: interviewId,
              score: summary.overall_score,
              role: summary.role,
              date_iso: summary.date_iso,
            })
          );
        }
      }

      res.json({ ...summary, history });

    } catch (err) {
      console.error("[results]", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
  storeNeon: async (req: AuthenticatedRequest, res: Response) => {

    const interviewId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    if (!interviewId) {
      res.status(400).json({ error: "Interview ID is required" });
      return;
    }

    try {
      // ── 1. Read summary from Redis ───────────────────────
      const rawSummary = await redisClient.get(`interview:${interviewId}:summary`);
      if (!rawSummary) {
        res.status(404).json({ error: "Summary not found in Redis. Interview may not be complete yet." });
        return;
      }

      const summary = JSON.parse(rawSummary);

      // ── 2. Read full Q&A history from Redis ──────────────
      const rawHistory = await redisClient.lrange(`interview:${interviewId}:history`, 0, -1);
      const history: Array<{
        index: number;
        question: string;
        answer: string;
        score: number;        // 0-10 from Python
        confidence: number;
        feedback: string;
        difficulty: string;
        timestamp: number;
      }> = rawHistory.map((h: string) => JSON.parse(h));

      if (history.length === 0) {
        res.status(400).json({ error: "No question history found in Redis." });
        return;
      }

      // ── 3. Check Interview record exists in Postgres ─────
      const interview = await prisma.interview.findUnique({
        where: { id: interviewId },
      });

      if (!interview) {
        res.status(404).json({ error: `Interview ${interviewId} not found in database.` });
        return;
      }

      // ── 4. Persist each Q&A as Question → InterviewQuestion → Response → Evaluation ──
      await prisma.$transaction(async (tx) => {

        for (const step of history) {
          // Upsert Question by content (avoids duplicates in question bank)
          const question = await tx.question.upsert({
            where: { id: `generated-${interviewId}-${step.index}` },
            update: {},
            create: {
              id: `generated-${interviewId}-${step.index}`,
              content: step.question,
              difficulty: mapDifficulty(step.difficulty),
              type: interview.type,
            },
          });

          // Upsert InterviewQuestion (link interview ↔ question)
          const interviewQuestion = await tx.interviewQuestion.upsert({
            where: {
              interviewId_questionId: {
                interviewId,
                questionId: question.id,
              },
            },
            update: {
              score: Math.round(step.score * 10), // 0-10 → 0-100
              order: step.index,
            },
            create: {
              interviewId,
              questionId: question.id,
              score: Math.round(step.score * 10),
              order: step.index,
            },
          });

          // Upsert Response
          const response = await tx.response.upsert({
            where: { interviewQuestionId: interviewQuestion.id },
            update: { userText: step.answer },
            create: {
              interviewQuestionId: interviewQuestion.id,
              userText: step.answer,
              submittedAt: new Date(step.timestamp * 1000),
            },
          });

          // Upsert Evaluation
          await tx.evaluation.upsert({
            where: { responseId: response.id },
            update: {
              overallScore: Math.round(step.score * 10),
              confidenceScore: step.confidence,
              feedback: step.feedback,
            },
            create: {
              responseId: response.id,
              overallScore: Math.round(step.score * 10),
              confidenceScore: step.confidence,
              feedback: step.feedback,
              // Map skill scores to schema fields where possible
              clarity: summary.skill_scores?.["Clarity"] ?? null,
              technical: summary.skill_scores?.["Technical Depth"] ?? null,
              confidence: summary.skill_scores?.["Confidence"] ?? null,
              strengths: summary.strengths?.join(" | ") ?? null,
              improvements: summary.weaknesses?.join(" | ") ?? null,
            },
          });
        }

        // ── 5. Mark interview as COMPLETED ──────────────────
        await tx.interview.update({
          where: { id: interviewId },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
          },
        });
      });

      // ── 6. Save score to Redis history list (for feedback page chart) ──
      const userId = interview.userId;
      const historyKey = `user:${userId}:interview_scores`;
      const existing = await redisClient.lrange(historyKey, 0, -1);
      const alreadySaved = existing.some((e: string) => {
        try { return JSON.parse(e).interview_id === interviewId; }
        catch { return false; }
      });
      if (!alreadySaved) {
        await redisClient.rpush(historyKey, JSON.stringify({
          interview_id: interviewId,
          score: summary.overall_score,
          role: summary.role,
          date_iso: summary.date_iso,
        }));
      }

      console.log(`[complete] Interview ${interviewId} persisted to Neon ✅`);
      res.json({ success: true, interviewId, questionsStored: history.length });

    } catch (err: any) {
      console.error("[complete] Error:", err);
      res.status(500).json({ error: "Failed to persist interview", details: err.message });
    }
  },
  startInterview: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const session = req.session;

      if (!session?.user?.id) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const userId = session.user.id;
      const { interviewType, interviewTitle } = req.body
      if (!interviewTitle || !interviewType) {
        return res.status(400).json({
          message: "Interview title and type are required"
        });
      }
      const interview = await prisma.interview.create({
        data: {
          title: interviewTitle,
          type: interviewType,
          userId: userId,   // required relation
          status: "CREATED"
        }
      })

      const job = {
        type: "interview_creation",
        payload: {
          user_id: userId,
          interview_id: interview.id,
          interview_type: interview.type,
        },
        meta: {
          enqueuedAt: new Date(),
        },
      };

      await redisClient.rpush("jobs", JSON.stringify(job));
      console.log("✅Interview Job pushed to queue");

      return res.status(201).json({
        message: "Interveiw Created",
        data: interview
      });
    } catch (error) {
      console.error("Error creating interview:", error);
      return res.status(500).json({ message: "Failed to create interview" });
    }
  },

};

function mapDifficulty(d: string): "EASY" | "MEDIUM" | "HARD" | null {
  switch (d.toLowerCase()) {
    case "intro":
    case "easy": return "EASY";
    case "medium": return "MEDIUM";
    case "hard": return "HARD";
    default: return null;
  }
}