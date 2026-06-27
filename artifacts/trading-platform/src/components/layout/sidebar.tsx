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
import {
  Activity,
  BarChart2,
  BookOpen,
  Briefcase,
  Crosshair,
  Eye,
  FileText,
  LayoutDashboard,
  Settings,
  Shield,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

export function AppSidebar() {
  const [location] = useLocation();
  const { data: status } = useGetScannerStatus({
    query: {
      queryKey: getGetScannerStatusQueryKey(),
      refetchInterval: 15000,
    },
  });

  const routes = [
    {
      label: "Platform",
      items: [
        { name: "Dashboard", path: "/", icon: LayoutDashboard },
        { name: "Live Scanner", path: "/scanner", icon: Activity },
        { name: "Top Gainers", path: "/gainers", icon: TrendingUp },
        { name: "Top Losers", path: "/losers", icon: TrendingDown },
        { name: "Signals", path: "/signals", icon: Crosshair },
      ],
    },
    {
      label: "Execution",
      items: [
        { name: "Open Trades", path: "/trades/open", icon: Briefcase },
        { name: "Trade Journal", path: "/trades/journal", icon: BookOpen },
        { name: "Watchlist", path: "/watchlist", icon: Eye },
      ],
    },
    {
      label: "Research",
      items: [
        { name: "Analytics", path: "/analytics", icon: BarChart2 },
        { name: "Learning Center", path: "/learning", icon: BookOpen },
        { name: "Reports", path: "/reports", icon: FileText },
      ],
    },
    {
      label: "System",
      items: [
        { name: "Admin Panel", path: "/admin", icon: Settings },
      ],
    },
  ];

  const isRunning = status?.running;

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
        {routes.map((group) => (
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
              className={`h-2 w-2 rounded-full ${isRunning ? "bg-green-400 animate-pulse" : "bg-red-500"}`}
            />
            <span
              className={`text-xs font-mono font-bold ${isRunning ? "text-green-400" : "text-red-400"}`}
            >
              {isRunning ? "LIVE" : "OFF"}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="text-xs font-mono text-muted-foreground">Mode</div>
          <div className="text-xs font-mono text-primary font-bold">PAPER</div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
