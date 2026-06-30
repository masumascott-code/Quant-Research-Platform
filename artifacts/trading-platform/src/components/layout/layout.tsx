import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./sidebar";
import { ReactNode } from "react";
import { Activity } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex min-h-dvh w-full min-w-0 bg-background text-foreground font-sans">
        <AppSidebar />
        <main className="relative flex h-dvh min-w-0 flex-1 flex-col overflow-hidden">
          <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur md:hidden">
            <div className="flex min-w-0 items-center gap-2">
              <SidebarTrigger className="-ml-1 h-9 w-9" />
              <div className="flex min-w-0 items-center gap-2">
                <div className="rounded bg-primary/20 p-1.5 text-primary">
                  <Activity className="h-4 w-4" />
                </div>
                <div className="truncate text-sm font-bold">
                  QUANT<span className="text-primary">EDGE</span>
                </div>
              </div>
            </div>
            <ThemeToggle />
          </header>
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-5 md:p-6">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
