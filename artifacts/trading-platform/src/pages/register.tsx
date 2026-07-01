import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiFetch } from "@/lib/api-fetch";
import { useAuth } from "@/lib/auth";
import { Activity, ArrowLeft, Send } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";

interface RegisterResult {
  success: boolean;
  status: "pending" | "active";
  message: string;
}

const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,32}$/;

export default function Register() {
  const { status } = useAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      navigate("/", { replace: true });
    }
  }, [navigate, status]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const validationError = validateForm({ email, username, password, confirmPassword });
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const result = await apiFetch<RegisterResult>("api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          username: username.trim(),
          password,
        }),
      });

      setMessage(result.message || "Registration request received. Please wait for admin approval before signing in.");
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(formatRegistrationError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8 text-foreground">
      <Card className="w-full max-w-sm border-border bg-card">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="rounded bg-primary/20 p-1.5 text-primary">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-xl">
                QUANT<span className="text-primary">EDGE</span> AI
              </CardTitle>
              <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Request Access</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </div>
            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            {message && (
              <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
                {message}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={submitting || status === "loading"}>
              <Send className="mr-2 h-4 w-4" />
              {submitting ? "Sending request..." : "Request Account"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm text-muted-foreground">
            <Link href="/login" className="inline-flex items-center gap-1 text-primary hover:underline">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

function validateForm(input: {
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
}): string | null {
  if (!input.email.trim()) return "Email is required";
  if (!input.username.trim()) return "Username is required";
  if (!USERNAME_PATTERN.test(input.username.trim())) {
    return "Username must be 3-32 characters using letters, numbers, dots, underscores, or hyphens";
  }
  if (!input.password) return "Password is required";
  if (input.password.length < 12) return "Password must be at least 12 characters";
  if (input.password !== input.confirmPassword) return "Passwords do not match";
  return null;
}

function formatRegistrationError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 400) return err.message || "Please check the registration form";
    if (err.status === 404) return "Registration is currently unavailable.";
    if (err.status === 503) return "Registration is temporarily unavailable.";
  }

  return "Registration request could not be completed. Please try again later.";
}
