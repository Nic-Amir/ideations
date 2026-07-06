'use strict';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useBalanceStore } from '@/stores/balance-store';
import { useBarrierRaceSound } from '@/hooks/use-barrier-race-sound';
import {
  type AssetId,
  type RacePath,
  type SettlementResult,
  type NearMissInfo,
  BARRIER_RACE_CONFIG,
  RACE_TICK_MS,
  RACE_SETTLE_MS,
  MAX_RACE_ANIM_MS,
  SLIDING_WINDOW_SIZE,
  generateRacePath,
  settleRace,
  getOfferedOdds,
  getNearMiss,
  distanceToBarrierSigma,
  estimateLiveProbabilities,
  computeCashOutOffer,
} from '@/lib/games/barrier-race';

export type RacePhase = 'idle' | 'racing' | 'settled';

export type RaceMode = 'classic' | 'cashout';

export type RaceResultOutcome = SettlementResult['outcome'] | 'cashout';

/** Ghost fast-forward after a cash-out: reveal the rest within this budget. */
const GHOST_REVEAL_MS = 2000;
const GHOST_TICK_MS = 80;

export interface RaceHistoryEntry {
  pick: AssetId;
  winner: AssetId | 'tie' | 'timeout';
  outcome: RaceResultOutcome;
  payout: number;
  stake: number;
}

export interface CashOutCounterfactual {
  /** What the held position would have paid at settlement. */
  payout: number;
  wouldHaveWon: boolean;
}

export interface BarrierRaceResult {
  outcome: RaceResultOutcome;
  payout: number;
  stake: number;
  netPL: number;
  pick: AssetId;
  winner: AssetId | 'tie' | 'timeout';
  multiplier: number;
  nearMiss: NearMissInfo | null;
  counterfactual: CashOutCounterfactual | null;
}

export function useBarrierRace() {
  const { balance, placeBet, addWinnings, adjustBalance } = useBalanceStore();
  const sound = useBarrierRaceSound();

  const [stake, setStake] = useState(100);
  const [mode, setModeState] = useState<RaceMode>('classic');
  const [phase, setPhase] = useState<RacePhase>('idle');
  const [pick, setPick] = useState<AssetId | null>(null);
  const [path, setPath] = useState<RacePath | null>(null);
  const [visibleTick, setVisibleTick] = useState(0);
  const [settlement, setSettlement] = useState<SettlementResult | null>(null);
  const [result, setResult] = useState<BarrierRaceResult | null>(null);
  const [history, setHistory] = useState<RaceHistoryEntry[]>([]);
  const [playError, setPlayError] = useState<string | null>(null);
  const [barrierFlash, setBarrierFlash] = useState(false);
  const [cashOutOffer, setCashOutOffer] = useState<number | null>(null);
  const [cashedOut, setCashedOut] = useState(false);
  const [animEpoch, setAnimEpoch] = useState(0);

  const pathRef = useRef<RacePath | null>(null);
  const pickRef = useRef<AssetId | null>(null);
  const stakeRef = useRef(stake);
  /** Stake locked in when the trade was placed — settlement must use this. */
  const tradeStakeRef = useRef(stake);
  const animFrameRef = useRef<number>(0);
  const raceStartRef = useRef(0);
  const addWinningsRef = useRef(addWinnings);
  const adjustBalanceRef = useRef(adjustBalance);
  const phaseRef = useRef<RacePhase>('idle');
  const tickMsRef = useRef(RACE_TICK_MS);
  const soundRef = useRef(sound);
  const modeRef = useRef<RaceMode>('classic');
  /** Amount and tick of an executed cash-out; null while position is open. */
  const cashedOutRef = useRef<{ amount: number; tick: number } | null>(null);
  const cashOutOfferRef = useRef<number | null>(null);
  const lastQuotedTickRef = useRef(-1);

  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);

  useEffect(() => {
    stakeRef.current = stake;
  }, [stake]);
  useEffect(() => {
    addWinningsRef.current = addWinnings;
  }, [addWinnings]);
  useEffect(() => {
    adjustBalanceRef.current = adjustBalance;
  }, [adjustBalance]);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const maxStake = Math.max(10, Math.min(balance, 5000));
  const canTrade =
    phase === 'idle' && stake <= balance && balance > 0;

  const windowStats = (() => {
    const window = history.slice(0, SLIDING_WINDOW_SIZE);
    const n = window.length;
    if (n === 0) return { drift: 0, vol: 0, n: 0 };
    const driftWins = window.filter((e) => e.winner === 'drift').length;
    const volWins = window.filter((e) => e.winner === 'vol').length;
    return { drift: driftWins / n, vol: volWins / n, n };
  })();

  const setMode = useCallback((next: RaceMode) => {
    if (phaseRef.current !== 'idle') return;
    modeRef.current = next;
    setModeState(next);
  }, []);

  const startRace = useCallback(
    (selected: AssetId) => {
      if (phaseRef.current !== 'idle') return;

      setPlayError(null);
      setResult(null);
      setSettlement(null);
      setBarrierFlash(false);
      setCashedOut(false);
      setCashOutOffer(null);
      cashedOutRef.current = null;
      cashOutOfferRef.current = null;
      lastQuotedTickRef.current = -1;

      const currentStake = stakeRef.current;
      if (!placeBet(currentStake)) {
        setPlayError('Not enough credits for this stake.');
        return;
      }
      tradeStakeRef.current = currentStake;

      const racePath = generateRacePath();

      // Long races fast-forward so the reveal never exceeds the cap.
      tickMsRef.current = Math.min(
        RACE_TICK_MS,
        MAX_RACE_ANIM_MS / Math.max(racePath.settleTick, 1),
      );

      pathRef.current = racePath;
      pickRef.current = selected;
      raceStartRef.current = performance.now();
      soundRef.current.resetRace();

      phaseRef.current = 'racing';
      setPick(selected);
      setPath(racePath);
      setVisibleTick(0);
      setPhase('racing');
      setAnimEpoch((e) => e + 1);
    },
    [placeBet],
  );

  const dismissResult = useCallback(() => {
    setResult(null);
    setSettlement(null);
    setPath(null);
    setPick(null);
    setVisibleTick(0);
    phaseRef.current = 'idle';
    setPhase('idle');
    setBarrierFlash(false);
    setCashedOut(false);
    setCashOutOffer(null);
    cashedOutRef.current = null;
    cashOutOfferRef.current = null;
  }, []);

  /** Restart immediately with the same pick and stake (result overlay CTA). */
  const raceAgain = useCallback(() => {
    const lastPick = pickRef.current;
    if (phaseRef.current !== 'settled' || !lastPick) return;
    dismissResult();
    startRace(lastPick);
  }, [dismissResult, startRace]);

  const cashOut = useCallback(() => {
    const racePath = pathRef.current;
    const offer = cashOutOfferRef.current;
    if (
      phaseRef.current !== 'racing' ||
      modeRef.current !== 'cashout' ||
      cashedOutRef.current !== null ||
      racePath === null ||
      offer === null
    ) {
      return;
    }

    const elapsed = performance.now() - raceStartRef.current;
    const currentTick = Math.min(
      Math.floor(elapsed / tickMsRef.current),
      racePath.settleTick,
    );
    if (currentTick >= racePath.settleTick) return;

    cashedOutRef.current = { amount: offer, tick: currentTick };
    if (offer > 0) addWinningsRef.current(offer);
    soundRef.current.playCashOut();
    setCashedOut(true);
    setCashOutOffer(null);

    // Ghost fast-forward: rebase the clock so the current tick stays put and
    // the remaining path replays quickly as a counterfactual reveal.
    const remaining = Math.max(racePath.settleTick - currentTick, 1);
    const ghostTickMs = Math.min(GHOST_TICK_MS, GHOST_REVEAL_MS / remaining);
    tickMsRef.current = ghostTickMs;
    raceStartRef.current = performance.now() - currentTick * ghostTickMs;
    setAnimEpoch((e) => e + 1);
  }, []);

  useEffect(() => {
    if (phase !== 'racing' || !pathRef.current) return;

    const tickMs = tickMsRef.current;
    const totalTicks = pathRef.current.settleTick;
    const raceDuration = totalTicks * tickMs;
    let flashed = false;

    function tick() {
      const racePath = pathRef.current;
      const selected = pickRef.current;
      if (!racePath || !selected) return;

      const elapsed = performance.now() - raceStartRef.current;
      const tickIndex = Math.min(
        Math.floor(elapsed / tickMs),
        racePath.settleTick,
      );
      setVisibleTick(tickIndex);

      const positionOpen = cashedOutRef.current === null;

      if (tickIndex > 0 && tickIndex < racePath.settleTick && positionOpen) {
        const p1 = racePath.prices1[tickIndex];
        const p2 = racePath.prices2[tickIndex];
        const closestSigma = Math.min(
          distanceToBarrierSigma(p1, 'drift'),
          distanceToBarrierSigma(p2, 'vol'),
        );
        soundRef.current.playApproachTick(tickIndex, closestSigma);
      }

      // Live re-pricing: quote a fresh cash-out offer once per revealed tick.
      if (
        modeRef.current === 'cashout' &&
        positionOpen &&
        tickIndex < racePath.settleTick &&
        tickIndex !== lastQuotedTickRef.current
      ) {
        lastQuotedTickRef.current = tickIndex;
        const live = estimateLiveProbabilities(
          Math.log(racePath.prices1[tickIndex]),
          Math.log(racePath.prices2[tickIndex]),
        );
        const pWin = selected === 'drift' ? live.pWin1 : live.pWin2;
        const offer = computeCashOutOffer(
          tradeStakeRef.current,
          getOfferedOdds(selected),
          pWin,
          live.pRefund,
        );
        cashOutOfferRef.current = offer;
        setCashOutOffer(offer);
      }

      // Flash the barrier the moment the winning path reaches it, then hold
      // for the settle pause before showing the result.
      if (!flashed && tickIndex >= racePath.settleTick) {
        flashed = true;
        setBarrierFlash(true);
        soundRef.current.playBarrierHit();
      }

      if (tickIndex >= racePath.settleTick && elapsed >= raceDuration + RACE_SETTLE_MS) {
        const tradeStake = tradeStakeRef.current;
        const settled = settleRace(selected, racePath, tradeStake);
        const soldPosition = cashedOutRef.current;

        let entry: RaceHistoryEntry;
        let raceResult: BarrierRaceResult;

        if (soldPosition !== null) {
          // Position was sold mid-race; the payout already happened at the tap.
          // Settlement here only resolves the counterfactual for the overlay.
          const kept = soldPosition.amount;
          raceResult = {
            outcome: 'cashout',
            payout: kept,
            stake: tradeStake,
            netPL: kept - tradeStake,
            pick: selected,
            winner: settled.winner,
            multiplier: settled.multiplier,
            nearMiss: null,
            counterfactual: {
              payout: settled.payout,
              wouldHaveWon: settled.outcome === 'win',
            },
          };
          entry = {
            pick: selected,
            winner: settled.winner,
            outcome: 'cashout',
            payout: kept,
            stake: tradeStake,
          };
          // Relief when the sale beat holding, a neutral tone for regret —
          // the player still banked credits, so a full loss sting is wrong.
          if (kept >= settled.payout) soundRef.current.playWin();
          else soundRef.current.playRefund();
        } else {
          if (settled.outcome === 'win') {
            addWinningsRef.current(settled.payout);
            soundRef.current.playWin();
          } else if (settled.payout > 0) {
            // Tie/timeout refunds return the stake without counting as winnings.
            adjustBalanceRef.current(settled.payout);
            soundRef.current.playRefund();
          } else {
            soundRef.current.playLoss();
          }

          raceResult = {
            outcome: settled.outcome,
            payout: settled.payout,
            stake: tradeStake,
            netPL: settled.payout - tradeStake,
            pick: selected,
            winner: settled.winner,
            multiplier: settled.multiplier,
            nearMiss:
              settled.outcome === 'lose' ? getNearMiss(selected, racePath) : null,
            counterfactual: null,
          };
          entry = {
            pick: selected,
            winner: settled.winner,
            outcome: settled.outcome,
            payout: settled.payout,
            stake: tradeStake,
          };
        }

        setSettlement(settled);
        setResult(raceResult);
        setHistory((prev) => [entry, ...prev].slice(0, SLIDING_WINDOW_SIZE));

        phaseRef.current = 'settled';
        setPhase('settled');
        return;
      }

      animFrameRef.current = requestAnimationFrame(tick);
    }

    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [phase, animEpoch]);

  const driftOdds = getOfferedOdds('drift');
  const volOdds = getOfferedOdds('vol');

  /** Current distance to the barrier per asset, in per-tick σ (spec's d/s). */
  const liveDistances = (() => {
    if (!path) return null;
    const t = Math.min(visibleTick, path.prices1.length - 1);
    return {
      drift: distanceToBarrierSigma(path.prices1[t], 'drift'),
      vol: distanceToBarrierSigma(path.prices2[t], 'vol'),
    };
  })();

  return {
    stake,
    setStake,
    phase,
    pick,
    path,
    visibleTick,
    settlement,
    result,
    history,
    playError,
    barrierFlash,
    balance,
    maxStake,
    canTrade,
    windowStats,
    driftOdds,
    volOdds,
    liveDistances,
    mode,
    setMode,
    cashOutOffer,
    cashedOut,
    cashOut,
    barrier: BARRIER_RACE_CONFIG.barrier,
    startPrice: BARRIER_RACE_CONFIG.s0,
    startRace,
    dismissResult,
    raceAgain,
    raceTickMs: RACE_TICK_MS,
    settleMs: RACE_SETTLE_MS,
  };
}
