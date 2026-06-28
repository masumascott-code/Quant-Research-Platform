import { Router } from "express";
import { securityConfig } from "../config/security";
import {
  auditAuthAttempt,
  authenticate,
  authenticateCredentials,
  issueToken,
  rateLimit,
} from "../middleware/security";

const router = Router();

function parseLoginBody(body: unknown): { username: string; password: string } | null {
  if (!body || typeof body !== "object") return null;
  const candidate = body as Record<string, unknown>;
  if (typeof candidate.username !== "string" || typeof candidate.password !== "string") {
    return null;
  }
  return {
    username: candidate.username,
    password: candidate.password,
  };
}

router.post("/login", rateLimit(securityConfig.authRateLimitMax), (req, res) => {
  if (!securityConfig.authEnabled) {
    res.status(403).json({ error: "Authentication is disabled" });
    return;
  }

  const parsed = parseLoginBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "Invalid login body" });
    return;
  }

  const user = authenticateCredentials(parsed.username, parsed.password);
  if (!user) {
    auditAuthAttempt(req, parsed.username, false);
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const token = issueToken(user);
  auditAuthAttempt(req, user.username, true, user.role);
  res.json({
    accessToken: token.token,
    tokenType: "Bearer",
    expiresIn: token.expiresIn,
    user,
  });
});

router.get("/me", authenticate, (req, res) => {
  res.json({ user: req.auth });
});

export default router;
