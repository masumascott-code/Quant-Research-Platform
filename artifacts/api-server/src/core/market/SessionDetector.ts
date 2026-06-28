import type { SessionResult } from "./types";

export class SessionDetector {
  detect(date = new Date()): SessionResult {
    const hour = date.getUTCHours();
    const sessions = this.activeSessions(hour);
    const session = sessions.includes("NEW_YORK")
      ? "NEW_YORK"
      : sessions.includes("LONDON")
        ? "LONDON"
        : sessions.includes("ASIAN")
          ? "ASIAN"
          : "SYDNEY";
    const overlap = sessions.length > 1 ? sessions.join("_") : null;
    const qualityScore = overlap ? 90 : session === "LONDON" || session === "NEW_YORK" ? 75 : 55;
    return { session, overlap, qualityScore };
  }

  private activeSessions(utcHour: number) {
    const sessions: Array<"ASIAN" | "LONDON" | "NEW_YORK" | "SYDNEY"> = [];
    if (utcHour >= 0 && utcHour < 9) sessions.push("ASIAN");
    if (utcHour >= 7 && utcHour < 16) sessions.push("LONDON");
    if (utcHour >= 13 && utcHour < 22) sessions.push("NEW_YORK");
    if (utcHour >= 21 || utcHour < 6) sessions.push("SYDNEY");
    return sessions;
  }
}
