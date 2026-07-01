import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { Activity, Lock } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";

export default function Login() {
  const { login, status } = useAuth();
  const [, navigate] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      navigate("/", { replace: true });
    }
  }, [navigate, status]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login({ username, password });
    } catch {
      setError("Invalid username or password");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
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
              <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Secure Console</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
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
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={submitting || status === "loading"}>
              <Lock className="mr-2 h-4 w-4" />
              {submitting ? "Signing in..." : "Sign In"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm text-muted-foreground">
            Need access?{" "}
            <Link href="/register" className="text-primary hover:underline">
              Request an account
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
