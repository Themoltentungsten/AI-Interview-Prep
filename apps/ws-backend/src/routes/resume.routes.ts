import { Router } from "express";

import { resumeController } from "../controllers/resume.controllers.js";
import { authMiddleware } from "../middlewares/error.middlewares.js";


const router: Router = Router();

router.post("/process-resume",authMiddleware, resumeController.processResume);
router.post("/store-resume-data",authMiddleware, resumeController.storeResume);
export default router;