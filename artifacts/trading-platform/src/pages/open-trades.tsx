import { useGetOpenTrades, getGetOpenTradesQueryKey, useCloseTrade } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Briefcase, X, Shield, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useLivePrices } from "@/hooks/use-live-prices";

export default function OpenTrades() {
  const { data: trades, isLoading } = useGetOpenTrades({
    query: {
      queryKey: getGetOpenTradesQueryKey(),
      refetchInterval: 15000
    }
  });
  const livePrices = useLivePrices();
  const hasLive = Object.keys(livePrices).length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-primary" />
            Open Trades
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Live active positions</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-md border border-border bg-card">
          {hasLive ? (
            <>
              <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
              <span className="text-success">LIVE FEED</span>
            </>
          ) : (
            <>
              <span className="h-2 w-2 rounded-full bg-muted-foreground" />
              <span className="text-muted-foreground">CONNECTING…</span>
            </>
          )}
        </div>
      </div>

      <div className="rounded-md border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent bg-muted/30">
              <TableHead className="font-mono text-xs text-muted-foreground py-3">SYMBOL</TableHead>
              <TableHead className="font-mono text-xs text-muted-foreground">DIR</TableHead>
              <TableHead className="font-mono text-xs text-muted-foreground text-right">ENTRY</TableHead>
              <TableHead className="font-mono text-xs text-muted-foreground text-right">
                <span className="flex items-center justify-end gap-1">
                  <Zap className="h-3 w-3 text-yellow-500" /> MARK PRICE
                </span>
              </TableHead>
              <TableHead className="font-mono text-xs text-muted-foreground text-right">LIVE PNL</TableHead>
              <TableHead className="font-mono text-xs text-muted-foreground text-center">TP TARGETS</TableHead>
              <TableHead className="font-mono text-xs text-muted-foreground text-right">STOP LOSS</TableHead>
              <TableHead className="font-mono text-xs text-muted-foreground text-right">ACTIONS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i} className="border-border">
                  {Array.from({ length: 8 }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : trades?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground font-mono text-sm">
                  NO OPEN POSITIONS
                </TableCell>
              </TableRow>
            ) : (
              trades?.map((trade) => (
                <LiveTradeRow key={trade.id} trade={trade} livePrices={livePrices} />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function LiveTradeRow({ trade, livePrices }: { trade: any; livePrices: Record<string, any> }) {
  const liveData = livePrices[trade.symbol];
  const markPrice = liveData?.price ?? null;
  const prevPriceRef = useRef<number | null>(null);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (markPrice == null) return undefined;
    if (prevPriceRef.current != null && markPrice !== prevPriceRef.current) {
      setFlash(markPrice > prevPriceRef.current ? "up" : "down");
      const t = setTimeout(() => setFlash(null), 600);
      prevPriceRef.current = markPrice;
      return () => clearTimeout(t);
    }
    prevPriceRef.current = markPrice;
    return undefined;
  }, [markPrice]);

  const livePnl = markPrice != null ? calcPnl(trade, markPrice) : null;
  const livePnlPct = markPrice != null ? calcPnlPct(trade, markPrice) : null;

  const flashClass =
    flash === "up" ? "bg-success/10 transition-colors duration-300" :
    flash === "down" ? "bg-destructive/10 transition-colors duration-300" : "";

  return (
    <TableRow className={`border-border hover:bg-muted/50 transition-colors ${flashClass}`}>
      <TableCell className="font-mono font-bold text-foreground">
        <div className="flex flex-col">
          {trade.symbol}
          <span className="text-[10px] text-muted-foreground font-normal">{trade.tradeId?.slice(0, 8)}</span>
        </div>
      </TableCell>

      <TableCell>
        <Badge variant="outline" className={`font-mono text-xs ${trade.direction === 'LONG' ? 'text-success border-success/30 bg-success/10' : 'text-destructive border-destructive/30 bg-destructive/10'}`}>
          {trade.direction}
        </Badge>
      </TableCell>

      <TableCell className="font-mono text-right text-sm">
        {Number(trade.entryPrice).toFixed(4)}
      </TableCell>

      <TableCell className="font-mono text-right text-sm">
        {markPrice != null ? (
          <span className={flash === "up" ? "text-success font-semibold" : flash === "down" ? "text-destructive font-semibold" : "text-foreground"}>
            {markPrice.toFixed(4)}
          </span>
        ) : (
          <span className="text-muted-foreground animate-pulse">···</span>
        )}
      </TableCell>

      <TableCell className="font-mono text-right text-sm">
        {livePnl != null ? (
          <div className="flex flex-col items-end">
            <span className={livePnl > 0 ? "text-success font-bold" : livePnl < 0 ? "text-destructive font-bold" : "text-muted-foreground"}>
              {livePnl > 0 ? "+" : ""}{livePnl.toFixed(4)}
            </span>
            <span className={`text-[10px] ${livePnlPct! > 0 ? "text-success" : livePnlPct! < 0 ? "text-destructive" : "text-muted-foreground"}`}>
              {livePnlPct! > 0 ? "+" : ""}{livePnlPct!.toFixed(2)}%
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground">---</span>
        )}
      </TableCell>

      <TableCell className="text-center">
        <div className="flex justify-center gap-1.5">
          {[
            { hit: trade.tp1Hit, price: trade.tp1, label: "TP1" },
            { hit: trade.tp2Hit, price: trade.tp2, label: "TP2" },
            { hit: trade.tp3Hit, price: trade.tp3, label: "TP3" },
          ].map(({ hit, price, label }) => {
            const nearTarget = markPrice != null && !hit && Math.abs(markPrice - price) / price < 0.005;
            return (
              <div
                key={label}
                title={`${label}: ${price}`}
                className={`w-3 h-3 rounded-sm transition-all ${
                  hit
                    ? "bg-success"
                    : nearTarget
                    ? "bg-yellow-500 animate-pulse"
                    : "bg-muted border border-border"
                }`}
              />
            );
          })}
        </div>
      </TableCell>

      <TableCell className="font-mono text-right text-sm">
        <span className="flex items-center justify-end gap-1 text-muted-foreground">
          <Shield className="h-3 w-3" />
          {Number(trade.currentSl || trade.stopLoss).toFixed(4)}
        </span>
      </TableCell>

      <TableCell className="text-right">
        <CloseTradeDialog trade={trade} markPrice={markPrice} />
      </TableCell>
    </TableRow>
  );
}

function calcPnl(trade: any, markPrice: number): number {
  const entry = Number(trade.entryPrice);
  const qty = Number(trade.quantity);
  return trade.direction === "LONG"
    ? (markPrice - entry) * qty
    : (entry - markPrice) * qty;
}

function calcPnlPct(trade: any, markPrice: number): number {
  const entry = Number(trade.entryPrice);
  return trade.direction === "LONG"
    ? ((markPrice - entry) / entry) * 100
    : ((entry - markPrice) / entry) * 100;
}

function CloseTradeDialog({ trade, markPrice }: { trade: any; markPrice: number | null }) {
  const [open, setOpen] = useState(false);
  const [exitPrice, setExitPrice] = useState("");
  const [reason, setReason] = useState("");
  
  const closeMutation = useCloseTrade();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Pre-fill mark price when dialog opens
  useEffect(() => {
    if (open && markPrice != null && !exitPrice) {
      setExitPrice(markPrice.toFixed(6));
    }
  }, [open, markPrice]);

  const handleClose = () => {
    if (!exitPrice || !reason) return;
    closeMutation.mutate(
      { id: trade.id, data: { exitPrice: parseFloat(exitPrice), exitReason: reason } },
      {
        onSuccess: () => {
          toast({ title: "Trade Closed", description: `Closed ${trade.symbol} at ${exitPrice}` });
          setOpen(false);
          queryClient.invalidateQueries({ queryKey: getGetOpenTradesQueryKey() });
        }
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="font-mono text-xs h-8 border-border">
          <X className="h-3 w-3 mr-1" /> CLOSE
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-mono flex items-center gap-2">
            MANUAL CLOSE: {trade.symbol}
            <Badge variant="outline" className={trade.direction === 'LONG' ? 'text-success' : 'text-destructive'}>
              {trade.direction}
            </Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {markPrice != null && (
            <div className="rounded-md bg-muted/40 border border-border px-3 py-2 font-mono text-xs flex justify-between">
              <span className="text-muted-foreground">MARK PRICE</span>
              <span className="text-foreground font-semibold">{markPrice.toFixed(6)}</span>
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="price" className="font-mono text-xs text-muted-foreground uppercase">Exit Price</Label>
            <Input
              id="price"
              type="number"
              step="any"
              value={exitPrice}
              onChange={(e) => setExitPrice(e.target.value)}
              className="font-mono bg-muted/50 border-border"
              placeholder="e.g. 4.82"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="reason" className="font-mono text-xs text-muted-foreground uppercase">Exit Reason</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="bg-muted/50 border-border"
              placeholder="e.g. TP1 hit, manual close"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} className="font-mono">CANCEL</Button>
          <Button
            onClick={handleClose}
            disabled={closeMutation.isPending || !exitPrice || !reason}
            className="font-mono bg-primary text-primary-foreground hover:bg-primary/90"
          >
            CONFIRM CLOSE
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
