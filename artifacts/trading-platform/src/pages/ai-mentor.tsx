import { Bot } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AIChatCard } from "@/components/ai/ai-cards";

export default function AIMentorPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Bot className="h-6 w-6 text-primary" />
            AI Mentor
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Coaching from the existing AI layer</p>
        </div>
        <Badge variant="outline" className="w-fit font-mono">NO TRADE EXECUTION</Badge>
      </div>

      <AIChatCard defaultQuestion="What are the highest-impact improvements I should focus on today?" />
    </div>
  );
}
