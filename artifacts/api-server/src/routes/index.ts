import { Router, type IRouter } from "express";
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

const router: IRouter = Router();

router.use(healthRouter);
router.use("/scanner", scannerRouter);
router.use("/signals", signalsRouter);
router.use("/trades", tradesRouter);
router.use("/analytics", analyticsRouter);
router.use("/learning", learningRouter);
router.use("/reports", reportsRouter);
router.use("/live", liveRouter);
router.use("/watchlist", watchlistRouter);
router.use("/admin", adminRouter);

export default router;
