import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import type { AuthUser } from "@workspace/api-client-react";
import { ShieldAlert } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { useLocation } from "wouter";

export function ProtectedRoute({ children, role = "viewer" }: { children: ReactNode; role?: AuthUser["role"] }) {
  const { status, canAccessRole, user } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (status === "unauthenticated") {
      navigate("/login", { replace: true });
    }
  }, [navigate, status]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  if (status !== "authenticated") return null;

  if (!canAccessRole(role)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-md border border-border bg-card p-6 text-center">
          <ShieldAlert className="mx-auto mb-4 h-8 w-8 text-destructive" />
          <h1 className="text-xl font-bold">Access Restricted</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Signed in as {user?.role}. This area requires {role} access.
          </p>
          <Button className="mt-5" onClick={() => navigate("/", { replace: true })}>
            Return to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
