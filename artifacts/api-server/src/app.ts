import express, { type Express } from "express";
import cors, { type CorsOptions } from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { securityConfig } from "./config/security";
import { logger } from "./lib/logger";
import { rateLimit } from "./middleware/security";
import { ScannerService } from "./services/scanner";
import { PriceTracker } from "./services/price-tracker";
import { SlMonitor } from "./services/sl-monitor";

const app: Express = express();

app.set("trust proxy", securityConfig.trustProxy);

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (securityConfig.corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(null, false);
  },
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"],
  credentials: false,
  maxAge: 600,
};

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors(corsOptions));
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});
app.use(rateLimit(securityConfig.rateLimitMax));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Auto-start scanner and price tracker when server boots (non-blocking)
setTimeout(() => {
  const scanner = ScannerService.getInstance();
  scanner.start().catch(err => logger.error({ err }, "Failed to auto-start scanner"));

  const tracker = PriceTracker.getInstance();
  tracker.start().catch(err => logger.error({ err }, "Failed to start price tracker"));

  // Start SL/TP monitor after price tracker has had time to fetch initial prices
  setTimeout(() => {
    SlMonitor.getInstance().start();
  }, 5_000);
}, 3000);

export default app;
