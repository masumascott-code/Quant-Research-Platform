import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./sidebar";
import { ReactNode } from "react";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex min-h-screen w-full bg-background text-foreground font-sans">
        <AppSidebar />
        <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-6">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}