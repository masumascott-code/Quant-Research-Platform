import { Router, type IRouter } from "express";
import { authenticate, auditLogger, requireAdminForMutations } from "../middleware/security";
import authRouter from "./auth";
import healthRouter from "./health";
import scannerRouter from "./scanner";
import signalsRouter from "./signals";
import tradesRouter from "./trades";
import analyticsRouter from "./analytics";
import learningRouter from "./learning";
import reportsRouter from "./reports";
import liveRouter from "./live";
import watchlistRouter from "./watchlist";
import adminRouter from "./admin";
import aiRouter from "./ai";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);

router.use(authenticate);
router.use(auditLogger);
router.use(requireAdminForMutations);

router.use("/scanner", scannerRouter);
router.use("/signals", signalsRouter);
router.use("/trades", tradesRouter);
router.use("/analytics", analyticsRouter);
router.use("/learning", learningRouter);
router.use("/reports", reportsRouter);
router.use("/live", liveRouter);
router.use("/watchlist", watchlistRouter);
router.use("/admin", adminRouter);
router.use("/ai", aiRouter);

export default router;
