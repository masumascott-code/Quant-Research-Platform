import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function ThemeToggle() {
  const { resolvedTheme, theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = resolvedTheme === "dark";
  const themeLabel = !mounted
    ? "Theme"
    : theme === "system"
      ? "System"
      : isDark
        ? "Dark"
        : "Light";
  const nextTheme = isDark ? "light" : "dark";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1.5 px-2.5"
          onClick={() => setTheme(nextTheme)}
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          <span className="text-xs font-mono">{themeLabel}</span>
          <span className="sr-only">Toggle light and dark theme</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {mounted ? `Switch to ${nextTheme} mode` : "Toggle theme"}
      </TooltipContent>
    </Tooltip>
  );
}
