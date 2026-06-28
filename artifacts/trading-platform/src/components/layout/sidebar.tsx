import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useGetScannerStatus, getGetScannerStatusQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import {
  Activity,
  BarChart2,
  BookOpen,
  Briefcase,
  Crosshair,
  Eye,
  FileText,
  LayoutDashboard,
  LogOut,
  Settings,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout, canAccessRole } = useAuth();
  const { data: status, isError: scannerStatusError } = useGetScannerStatus({
    query: {
      queryKey: getGetScannerStatusQueryKey(),
      refetchInterval: 15000,
    },
  });

  const routes = [
    {
      label: "Platform",
      items: [
        { name: "Dashboard", path: "/", icon: LayoutDashboard, role: "viewer" },
        { name: "Live Scanner", path: "/scanner", icon: Activity, role: "admin" },
        { name: "Top Gainers", path: "/gainers", icon: TrendingUp, role: "admin" },
        { name: "Top Losers", path: "/losers", icon: TrendingDown, role: "admin" },
        { name: "Signals", path: "/signals", icon: Crosshair, role: "admin" },
      ],
    },
    {
      label: "Execution",
      items: [
        { name: "Open Trades", path: "/trades/open", icon: Briefcase, role: "admin" },
        { name: "Trade Journal", path: "/trades/journal", icon: BookOpen, role: "admin" },
        { name: "Watchlist", path: "/watchlist", icon: Eye, role: "viewer" },
      ],
    },
    {
      label: "Research",
      items: [
        { name: "Analytics", path: "/analytics", icon: BarChart2, role: "viewer" },
        { name: "Learning Center", path: "/learning", icon: BookOpen, role: "admin" },
        { name: "Reports", path: "/reports", icon: FileText, role: "viewer" },
      ],
    },
    {
      label: "System",
      items: [
        { name: "Admin Panel", path: "/admin", icon: Settings, role: "admin" },
      ],
    },
  ];

  const isRunning = status?.running;
  const visibleRoutes = routes
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canAccessRole(item.role as "admin" | "viewer")),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <Sidebar variant="inset" className="border-r border-border">
      <SidebarHeader className="border-b border-border p-4">
        <div className="flex items-center gap-2">
          <div className="bg-primary/20 p-1.5 rounded text-primary">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <div className="font-bold tracking-tight text-foreground leading-tight">
              QUANT<span className="text-primary">EDGE</span>
            </div>
            <div className="text-[10px] font-mono text-muted-foreground tracking-widest">AI v2.0</div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {visibleRoutes.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground font-mono">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      asChild
                      isActive={
                        location === item.path ||
                        (item.path !== "/" && location.startsWith(item.path))
                      }
                      tooltip={item.name}
                    >
                      <Link href={item.path} className="flex items-center gap-3">
                        <item.icon className="h-4 w-4" />
                        <span>{item.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-border p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-mono text-muted-foreground">Scanner</div>
          <div className="flex items-center gap-1.5">
            <div
              className={`h-2 w-2 rounded-full ${isRunning ? "bg-green-400 animate-pulse" : scannerStatusError ? "bg-yellow-500" : "bg-red-500"}`}
            />
            <span
              className={`text-xs font-mono font-bold ${isRunning ? "text-green-400" : scannerStatusError ? "text-yellow-400" : "text-red-400"}`}
            >
              {isRunning ? "LIVE" : scannerStatusError ? "UNKNOWN" : "OFF"}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="text-xs font-mono text-muted-foreground">Mode</div>
          <div className="text-xs font-mono text-primary font-bold">PAPER</div>
        </div>
        <div className="flex items-center justify-between gap-3 pt-2">
          <div className="min-w-0">
            <div className="truncate text-xs font-mono text-foreground">{user?.username}</div>
            <div className="text-[10px] font-mono uppercase text-muted-foreground">{user?.role}</div>
          </div>
          <Button variant="outline" size="sm" onClick={logout} className="h-8 px-2">
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
