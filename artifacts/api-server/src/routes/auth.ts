import { Router } from "express";
import { securityConfig } from "../config/security";
import {
  auditAuthAttempt,
  authenticate,
  authenticateCredentials,
  issueToken,
  rateLimit,
} from "../middleware/security";
import {
  authenticateDbUserOrFallback,
  registerPublicUser,
  registrationAcceptedMessage,
  validateRegistrationBody,
} from "../core/auth/service";
import {
  createPendingViewerUser,
  findUserByNormalizedEmailOrUsername,
  isAuthUserSchemaUnavailable,
  verifyDbUserPassword,
  updateLastLoginAt,
} from "../core/auth/users";

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

router.post("/register", rateLimit(securityConfig.authRateLimitMax), async (req, res) => {
  if (!securityConfig.authEnabled || !securityConfig.registrationEnabled) {
    res.status(404).json({ error: "Registration is not available" });
    return;
  }

  const parsed = validateRegistrationBody(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.message });
    return;
  }

  let registration;
  try {
    registration = await registerPublicUser(parsed.input, {
      findUserByIdentifier: findUserByNormalizedEmailOrUsername,
      createUser: createPendingViewerUser,
      autoApprove: securityConfig.registrationAutoApprove,
    });
  } catch (err) {
    if (isAuthUserSchemaUnavailable(err)) {
      res.status(503).json({ error: "Registration is temporarily unavailable" });
      return;
    }
    throw err;
  }

  res.status(202).json({
    success: true,
    status: registration.status,
    message: registrationAcceptedMessage(registration.status),
  });
});

router.post("/login", rateLimit(securityConfig.authRateLimitMax), async (req, res) => {
  if (!securityConfig.authEnabled) {
    res.status(403).json({ error: "Authentication is disabled" });
    return;
  }

  const parsed = parseLoginBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "Invalid login body" });
    return;
  }

  const user = await authenticateDbUserOrFallback(parsed.username, parsed.password, {
    findUserByIdentifier: findUserByNormalizedEmailOrUsername,
    verifyPassword: verifyDbUserPassword,
    updateLastLoginAt,
    authenticateFallback: authenticateCredentials,
  });
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
