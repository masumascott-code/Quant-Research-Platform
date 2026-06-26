import { useGetOpenTrades, getGetOpenTradesQueryKey, useCloseTrade } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Briefcase, X, Target, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function OpenTrades() {
  const { data: trades, isLoading } = useGetOpenTrades({
    query: {
      queryKey: getGetOpenTradesQueryKey(),
      refetchInterval: 10000
    }
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Briefcase className="h-6 w-6 text-primary" />
          Open Trades
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Live active positions</p>
      </div>

      <div className="rounded-md border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent bg-muted/30">
              <TableHead className="font-mono text-xs text-muted-foreground py-3">SYMBOL</TableHead>
              <TableHead className="font-mono text-xs text-muted-foreground">DIR</TableHead>
              <TableHead className="font-mono text-xs text-muted-foreground text-right">ENTRY</TableHead>
              <TableHead className="font-mono text-xs text-muted-foreground text-right">CURRENT PNL</TableHead>
              <TableHead className="font-mono text-xs text-muted-foreground text-center">TP TARGETS</TableHead>
              <TableHead className="font-mono text-xs text-muted-foreground text-right">STOP LOSS</TableHead>
              <TableHead className="font-mono text-xs text-muted-foreground text-right">ACTIONS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="border-border">
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24 mx-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : trades?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground font-mono text-sm">NO OPEN POSITIONS</TableCell>
              </TableRow>
            ) : (
              trades?.map((trade) => (
                <TableRow key={trade.id} className="border-border hover:bg-muted/50 transition-colors">
                  <TableCell className="font-mono font-bold text-foreground">
                    <div className="flex flex-col">
                      {trade.symbol}
                      <span className="text-[10px] text-muted-foreground font-normal">{trade.tradeId.slice(0, 8)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`font-mono ${trade.direction === 'LONG' ? 'text-success border-success/30 bg-success/10' : 'text-destructive border-destructive/30 bg-destructive/10'}`}>
                      {trade.direction}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-right">{trade.entryPrice.toFixed(4)}</TableCell>
                  <TableCell className="font-mono text-right">
                    {trade.pnl != null ? (
                      <span className={trade.pnl > 0 ? "text-success font-bold" : trade.pnl < 0 ? "text-destructive font-bold" : ""}>
                        ${trade.pnl.toFixed(2)} ({trade.pnlPercent?.toFixed(2)}%)
                      </span>
                    ) : '---'}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex justify-center gap-1.5">
                      <div className={`w-3 h-3 rounded-sm ${trade.tp1Hit ? 'bg-success' : 'bg-muted border border-border'}`} title={`TP1: ${trade.tp1}`} />
                      <div className={`w-3 h-3 rounded-sm ${trade.tp2Hit ? 'bg-success' : 'bg-muted border border-border'}`} title={`TP2: ${trade.tp2}`} />
                      <div className={`w-3 h-3 rounded-sm ${trade.tp3Hit ? 'bg-success' : 'bg-muted border border-border'}`} title={`TP3: ${trade.tp3}`} />
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-right flex items-center justify-end gap-1">
                    <Shield className="h-3 w-3 text-muted-foreground" />
                    {trade.currentSl || trade.stopLoss}
                  </TableCell>
                  <TableCell className="text-right">
                    <CloseTradeDialog trade={trade} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function CloseTradeDialog({ trade }: { trade: any }) {
  const [open, setOpen] = useState(false);
  const [exitPrice, setExitPrice] = useState("");
  const [reason, setReason] = useState("");
  
  const closeMutation = useCloseTrade();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleClose = () => {
    if (!exitPrice || !reason) return;
    
    closeMutation.mutate(
      { 
        id: trade.id,
        data: {
          exitPrice: parseFloat(exitPrice),
          exitReason: reason
        }
      },
      {
        onSuccess: () => {
          toast({ title: "Trade Closed", description: `Successfully closed ${trade.symbol}` });
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
          <div className="grid gap-2">
            <Label htmlFor="price" className="font-mono text-xs text-muted-foreground uppercase">Exit Price</Label>
            <Input 
              id="price" 
              type="number" 
              step="any"
              value={exitPrice} 
              onChange={(e) => setExitPrice(e.target.value)} 
              className="font-mono bg-muted/50 border-border" 
              placeholder="e.g. 50000"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="reason" className="font-mono text-xs text-muted-foreground uppercase">Exit Reason</Label>
            <Input 
              id="reason" 
              value={reason} 
              onChange={(e) => setReason(e.target.value)} 
              className="bg-muted/50 border-border" 
              placeholder="e.g. Manual intervention due to market structure"
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