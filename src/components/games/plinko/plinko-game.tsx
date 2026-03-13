'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBalanceStore } from '@/stores/balance-store';
import {
  getRiskConfig,
  generateVolatilityRun,
  getBarrierPriceLevels,
  type VolatilityRun,
} from '@/lib/games/plinko';
import type { PlinkoRisk } from '@/types';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  GameLayout,
  GameNotice,
  GameStatusLine,
} from '@/components/games/shared/game-layout';

const CHART_PADDING = { top: 20, right: 80, bottom: 32, left: 56 };
const START_PRICE = 1000;
const MAX_CONCURRENT_RUNS = 5;

interface RunDisplay {
  id: number;
  run: VolatilityRun;
  animProgress: number;
  startedAt: number;
  stake: number;
}

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------

function VolatilityChart({
  runs,
  activeRuns,
  risk,
  width,
  height,
}: {
  runs: RunDisplay[];
  activeRuns: RunDisplay[];
  risk: PlinkoRisk;
  width: number;
  height: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const config = getRiskConfig(risk);
  const zones = config.zones;
  const barrierLevels = getBarrierPriceLevels(risk, START_PRICE);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#131325';
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, 12);
    ctx.fill();

    const plotW = width - CHART_PADDING.left - CHART_PADDING.right;
    const plotH = height - CHART_PADDING.top - CHART_PADDING.bottom;

    // Y range: all completed runs + all active run quotes + barrier levels
    const activeRunIds = new Set(activeRuns.map((r) => r.id));
    let allQuotes: number[] = [START_PRICE];
    for (const r of runs) allQuotes = allQuotes.concat(r.run.quotes);
    for (const r of activeRuns) allQuotes = allQuotes.concat(r.run.quotes);

    const barrierPrices = barrierLevels.map((b) => b.price);
    const allValues = allQuotes.concat(barrierPrices);
    const minV = Math.min(...allValues);
    const maxV = Math.max(...allValues);
    const range = maxV - minV || 1;
    const pad = range * 0.08;
    const yMin = minV - pad;
    const yMax = maxV + pad;

    const xScale = (i: number, totalTicks: number) =>
      CHART_PADDING.left + (i / totalTicks) * plotW;
    const yScale = (v: number) =>
      CHART_PADDING.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = CHART_PADDING.top + (plotH / 5) * i;
      ctx.beginPath();
      ctx.moveTo(CHART_PADDING.left, y);
      ctx.lineTo(width - CHART_PADDING.right, y);
      ctx.stroke();
    }

    // Start price reference line
    const startY = yScale(START_PRICE);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(CHART_PADDING.left, startY);
    ctx.lineTo(width - CHART_PADDING.right, startY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Barrier lines and zone bands
    const bandWidth = 64;
    const bandX = width - CHART_PADDING.right + 4;
    const uniqueZones = zones.slice(0, 5);

    for (const zone of uniqueZones) {
      const minK = zone.minSigma;
      const maxK = Math.min(zone.maxSigma, 5);

      const upperBarrierMin = barrierLevels.find((b) => b.sigma === minK);
      const upperBarrierMax = barrierLevels.find((b) => b.sigma === maxK);

      const posTop = upperBarrierMax ? yScale(upperBarrierMax.price) : yScale(yMax);
      const posBot = upperBarrierMin ? yScale(upperBarrierMin.price) : yScale(START_PRICE);

      if (posBot > posTop) {
        ctx.fillStyle = zone.color + '10';
        ctx.fillRect(CHART_PADDING.left, posTop, plotW, posBot - posTop);
        ctx.fillStyle = zone.color + '18';
        ctx.fillRect(bandX, posTop, bandWidth, posBot - posTop);
        ctx.fillStyle = zone.color;
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`${zone.payout}×`, bandX + 4, (posTop + posBot) / 2 + 3);
      }

      if (zone.label !== 'Center') {
        const lowerBarrierMin = barrierLevels.find((b) => b.sigma === -minK);
        const lowerBarrierMax = barrierLevels.find((b) => b.sigma === -maxK);

        const negTop = lowerBarrierMin ? yScale(lowerBarrierMin.price) : yScale(START_PRICE);
        const negBot = lowerBarrierMax ? yScale(lowerBarrierMax.price) : yScale(yMin);

        if (negBot > negTop) {
          ctx.fillStyle = zone.color + '10';
          ctx.fillRect(CHART_PADDING.left, negTop, plotW, negBot - negTop);
          ctx.fillStyle = zone.color + '18';
          ctx.fillRect(bandX, negTop, bandWidth, negBot - negTop);
          ctx.fillStyle = zone.color;
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'left';
          ctx.fillText(`${zone.payout}×`, bandX + 4, (negTop + negBot) / 2 + 3);
        }
      }
    }

    // Draw barrier lines
    for (const barrier of barrierLevels) {
      const absK = Math.abs(barrier.sigma);
      const zone = uniqueZones.find(
        (z) => z.minSigma === absK || z.maxSigma === absK,
      );
      const bColor = zone?.color ?? '#555';
      const by = yScale(barrier.price);
      ctx.strokeStyle = bColor + '50';
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(CHART_PADDING.left, by);
      ctx.lineTo(width - CHART_PADDING.right, by);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#8B8BA3';
      ctx.font = '8px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(
        `${barrier.sigma > 0 ? '+' : ''}${barrier.sigma}σ`,
        CHART_PADDING.left - 4,
        by + 3,
      );
    }

    // Y-axis labels
    ctx.fillStyle = '#8B8BA3';
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const val = yMin + ((yMax - yMin) / 5) * (5 - i);
      const y = CHART_PADDING.top + (plotH / 5) * i;
      ctx.fillText(val.toFixed(1), CHART_PADDING.left - 6, y + 3);
    }

    // Completed runs (faded) — skip any that are currently active
    for (const r of runs) {
      if (activeRunIds.has(r.id)) continue;
      const quotes = r.run.quotes;
      const total = quotes.length - 1;
      ctx.strokeStyle = r.run.isPositive
        ? 'rgba(0,212,170,0.15)'
        : 'rgba(255,59,92,0.15)';
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < quotes.length; i++) {
        const x = xScale(i, total);
        const y = yScale(quotes[i]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Active runs — each drawn bright with a trailing dot
    for (const activeRun of activeRuns) {
      const quotes = activeRun.run.quotes;
      const total = quotes.length - 1;
      const visibleCount = Math.max(1, Math.floor(activeRun.animProgress * quotes.length));
      const color = activeRun.run.isPositive ? '#00D4AA' : '#FF3B5C';

      ctx.save();
      ctx.shadowColor = color + '60';
      ctx.shadowBlur = 12;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < visibleCount && i < quotes.length; i++) {
        const x = xScale(i, total);
        const y = yScale(quotes[i]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();

      const lastIdx = Math.min(visibleCount - 1, quotes.length - 1);
      const ex = xScale(lastIdx, total);
      const ey = yScale(quotes[lastIdx]);

      ctx.save();
      ctx.shadowColor = color + '80';
      ctx.shadowBlur = 16;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(ex, ey, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (activeRun.animProgress >= 1) {
        ctx.fillStyle = color;
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'left';
        const pctStr = (activeRun.run.percentChange * 100).toFixed(2);
        const sign = activeRun.run.percentChange >= 0 ? '+' : '';
        ctx.fillText(`${sign}${pctStr}%`, ex + 10, ey - 4);
        ctx.fillText(`${activeRun.run.payout}×`, ex + 10, ey + 10);
      }
    }

    // X-axis tick labels
    ctx.fillStyle = '#8B8BA3';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    const sampleLen =
      activeRuns[0]?.run.quotes.length ??
      runs[0]?.run.quotes.length ??
      config.tickCount + 1;
    const totalTicks = sampleLen - 1;
    const step = Math.max(1, Math.floor(totalTicks / 5));
    for (let i = 0; i <= totalTicks; i += step) {
      const x = xScale(i, totalTicks);
      ctx.fillText(String(i), x, height - 10);
    }
  }, [runs, activeRuns, risk, width, height, zones, barrierLevels, config.tickCount]);

  return (
    <canvas
      ref={canvasRef}
      className="block rounded-xl"
      style={{ width, height }}
    />
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PlinkoGame() {
  const { balance, placeBet, addWinnings } = useBalanceStore();

  const [risk, setRisk] = useState<PlinkoRisk>('medium');
  const [stake, setStake] = useState(100);
  const [runs, setRuns] = useState<RunDisplay[]>([]);
  const [activeRuns, setActiveRuns] = useState<RunDisplay[]>([]);
  const [lastResult, setLastResult] = useState<{
    payout: number;
    amount: number;
    pctChange: number;
    zScore: number;
  } | null>(null);
  const [history, setHistory] = useState<
    Array<{ payout: number; pctChange: number }>
  >([]);
  const runIdRef = useRef(0);
  const animFrameRef = useRef<number>(0);
  const activeRunsRef = useRef<RunDisplay[]>([]);
  const configRef = useRef(getRiskConfig(risk));
  const addWinningsRef = useRef(addWinnings);
  const [chartWidth, setChartWidth] = useState(560);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep refs in sync
  useEffect(() => { activeRunsRef.current = activeRuns; }, [activeRuns]);
  useEffect(() => { configRef.current = getRiskConfig(risk); }, [risk]);
  useEffect(() => { addWinningsRef.current = addWinnings; }, [addWinnings]);

  // Resize observer for chart width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries)
        setChartWidth(Math.min(e.contentRect.width - 24, 700));
    });
    ro.observe(el);
    setChartWidth(Math.min(el.clientWidth - 24, 700));
    return () => ro.disconnect();
  }, []);

  // Single animation loop — started/stopped based on activeRuns
  useEffect(() => {
    if (activeRuns.length === 0) {
      cancelAnimationFrame(animFrameRef.current);
      return;
    }

    const duration = configRef.current.tickCount * 80 + 400;

    function tick() {
      const now = performance.now();
      const current = activeRunsRef.current;

      const nextActive: RunDisplay[] = [];
      const justCompleted: RunDisplay[] = [];

      for (const r of current) {
        const elapsed = now - r.startedAt;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        if (eased >= 1) {
          justCompleted.push({ ...r, animProgress: 1 });
        } else {
          nextActive.push({ ...r, animProgress: eased });
        }
      }

      // Credit winnings and move completed runs to history
      if (justCompleted.length > 0) {
        for (const r of justCompleted) {
          const winAmount = r.stake * r.run.payout;
          if (winAmount > 0) addWinningsRef.current(winAmount);
        }

        const latestCompleted = justCompleted[justCompleted.length - 1];
        setLastResult({
          payout: latestCompleted.run.payout,
          amount: latestCompleted.stake * latestCompleted.run.payout,
          pctChange: latestCompleted.run.percentChange,
          zScore: latestCompleted.run.zScore,
        });
        setHistory((prev) => [
          ...justCompleted.map((r) => ({
            payout: r.run.payout,
            pctChange: r.run.percentChange,
          })),
          ...prev,
        ].slice(0, 20));
        setRuns((prev) => [
          ...prev.slice(-(10 - justCompleted.length)),
          ...justCompleted,
        ]);
      }

      setActiveRuns(nextActive);
      activeRunsRef.current = nextActive;

      if (nextActive.length > 0) {
        animFrameRef.current = requestAnimationFrame(tick);
      }
    }

    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  // Only re-run when active runs transitions from empty to non-empty
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRuns.length === 0 ? 0 : 1]);

  const config = getRiskConfig(risk);
  const maxStake = Math.max(10, Math.min(balance, 5000));
  const isAnimating = activeRuns.length > 0;

  const generate = useCallback(() => {
    if (!placeBet(stake)) return;

    const run = generateVolatilityRun(risk);
    const id = runIdRef.current++;
    const display: RunDisplay = {
      id,
      run,
      animProgress: 0,
      startedAt: performance.now(),
      stake,
    };

    setActiveRuns((prev) => [...prev, display]);
  }, [risk, stake, placeBet]);

  return (
    <div ref={containerRef}>
      <GameLayout
        ticks={[]}
        highlightedTicks={[]}
        lastConsumedTick={null}
        extractionKey={0}
        statusLine={
          <GameStatusLine>
            {isAnimating
              ? `${activeRuns.length} path${activeRuns.length > 1 ? 's' : ''} in flight.`
              : lastResult
                ? `${lastResult.payout}x settlement on a ${lastResult.pctChange >= 0 ? '+' : ''}${(lastResult.pctChange * 100).toFixed(2)}% move.`
                : `Pick a risk preset and generate a ${config.tickCount}-tick run.`}
          </GameStatusLine>
        }
        marketContent={
          <>
            <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
              <div className="section-label">Simulation source</div>
              <p className="mt-2 text-sm text-foreground">
                This module does not consume the live Deriv tick stream.
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                It generates a client-side geometric Brownian motion path using secure browser entropy and then settles on the terminal move zone.
              </p>
            </div>

            <div className="rounded-2xl border border-white/8 bg-white/3 p-4 text-sm text-muted-foreground">
              <div className="section-label">Model inputs</div>
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span>Sigma profile</span>
                  <span className="font-mono-game text-foreground">{risk}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Tick count</span>
                  <span className="font-mono-game text-foreground">{config.tickCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Target RTP</span>
                  <span className="font-mono-game text-foreground">
                    {(config.targetRTP * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/8 bg-white/3 p-4 text-xs text-muted-foreground">
              Paths are generated locally with secure browser randomness rather than the live tick stream.
            </div>
          </>
        }
        playArea={
          <div className="space-y-5">
            <AnimatePresence>
              {lastResult ? (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <GameNotice tone={lastResult.payout >= 1 ? 'success' : 'default'}>
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-display text-lg font-semibold">
                          {lastResult.payout}x settlement
                        </p>
                        <p className="mt-1 text-xs opacity-80">
                          {lastResult.pctChange >= 0 ? '+' : ''}
                          {(lastResult.pctChange * 100).toFixed(2)}% move · Z=
                          {lastResult.zScore >= 0 ? '+' : ''}
                          {lastResult.zScore.toFixed(2)}
                        </p>
                      </div>
                      <div className="font-mono-game text-lg font-semibold">
                        {lastResult.amount > 0 ? `+${lastResult.amount.toFixed(0)}` : '0'}
                      </div>
                    </div>
                  </GameNotice>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <div className="rounded-[2rem] border border-white/8 bg-[linear-gradient(180deg,rgba(17,27,42,0.95),rgba(10,18,30,0.88))] p-4">
              <VolatilityChart
                runs={runs}
                activeRuns={activeRuns}
                risk={risk}
                width={chartWidth}
                height={360}
              />
            </div>
          </div>
        }
        controls={
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
              <div className="section-label">Risk preset</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(['low', 'medium', 'high'] as PlinkoRisk[]).map((r) => {
                  const rc = getRiskConfig(r);
                  return (
                    <button
                      key={r}
                      onClick={() => !isAnimating && setRisk(r)}
                      className={`rounded-2xl border px-3 py-2 text-xs transition-all ${
                        risk === r
                          ? 'border-primary/20 bg-primary/10 text-primary'
                          : 'border-white/8 bg-white/4 text-muted-foreground hover:text-foreground'
                      } ${isAnimating ? 'cursor-not-allowed opacity-50' : ''}`}
                    >
                      {r.charAt(0).toUpperCase() + r.slice(1)} ({rc.tickCount}t)
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-muted-foreground">Stake</span>
                <span className="font-mono-game text-primary">{stake}</span>
              </div>
              <Slider
                value={[stake]}
                onValueChange={(v) => setStake(Array.isArray(v) ? v[0] : v)}
                min={10}
                max={maxStake}
                step={10}
                disabled={isAnimating}
              />
            </div>

            {isAnimating && (
              <div className="flex items-center justify-between rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-xs text-muted-foreground">
                <span>In flight</span>
                <span className="font-mono-game text-foreground">
                  {activeRuns.length} / {MAX_CONCURRENT_RUNS}
                </span>
              </div>
            )}

            <Button
              onClick={generate}
              className="h-12 w-full text-base font-semibold"
              disabled={
                stake > balance ||
                balance <= 0 ||
                activeRuns.length >= MAX_CONCURRENT_RUNS
              }
            >
              {activeRuns.length >= MAX_CONCURRENT_RUNS
                ? 'Max paths in flight'
                : activeRuns.length > 0
                  ? 'Drop another ball'
                  : 'Generate run'}
            </Button>
          </div>
        }
        tabs={[
          {
            id: 'payouts',
            label: 'Payouts',
            content: (
              <div className="space-y-2">
                {config.zones.slice(0, 5).map((zone, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: zone.color }}
                      />
                      <span className="text-muted-foreground">{zone.label}</span>
                    </div>
                    <div className="flex gap-3 text-muted-foreground">
                      <span className="font-mono-game">
                        {zone.minSigma === 0 ? '<' : ''}
                        {zone.minSigma === 0 ? zone.maxSigma : zone.minSigma}sigma
                        {zone.maxSigma !== Infinity && zone.minSigma !== 0
                          ? `-${zone.maxSigma}sigma`
                          : ''}
                        {zone.maxSigma === Infinity ? '+' : ''}
                      </span>
                      <span
                        className="font-mono-game font-medium"
                        style={{ color: zone.color }}
                      >
                        {zone.payout}x
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ),
          },
          {
            id: 'history',
            label: 'History',
            content: history.length ? (
              <div className="space-y-2">
                {history.map((run, index) => (
                  <div
                    key={`${run.payout}-${run.pctChange}-${index}`}
                    className="flex items-center justify-between rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-xs text-muted-foreground"
                  >
                    <span>Run {history.length - index}</span>
                    <span className="font-mono-game">{run.payout}x</span>
                    <span className="font-mono-game">
                      {run.pctChange >= 0 ? '+' : ''}
                      {(run.pctChange * 100).toFixed(2)}%
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No runs generated yet.</div>
            ),
          },
          {
            id: 'rules',
            label: 'Rules',
            content: (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Select a risk preset, set your stake, and generate a synthetic price path.</p>
                <p>The terminal move lands in a payout zone based on its sigma distance from the start.</p>
                <p>Higher risk presets widen the tails and enable larger payouts.</p>
                <p>You can drop up to {MAX_CONCURRENT_RUNS} balls at the same time — each costs one stake.</p>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
