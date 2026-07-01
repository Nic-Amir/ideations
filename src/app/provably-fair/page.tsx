import Link from 'next/link';
import {
  Button,
  Card,
  CardContent,
  Separator,
} from '@trading-game/design-intelligence-layer';
import {
  getRiskConfig,
  computeAnalyticalRTP,
  computeSigmaEff,
  getZoneProbabilities,
} from '@/lib/games/plinko';
import type { PlinkoRisk } from '@/types';

function formatSigmaRange(minSigma: number, maxSigma: number): string {
  if (minSigma === 0) return `|Z| < ${maxSigma}σ`;
  if (maxSigma === Infinity) return `|Z| ≥ ${minSigma}σ`;
  return `${minSigma}σ – ${maxSigma}σ`;
}

function PlinkoZoneTable({ risk }: { risk: PlinkoRisk }) {
  const config = getRiskConfig(risk);
  const sigmaEff = computeSigmaEff(config.sigma, config.tickCount);
  const analytical = computeAnalyticalRTP(risk);
  return (
    <Card className="border-0 bg-subtle">
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-medium text-on-prominent capitalize">{risk} risk</p>
          <p className="text-xs text-on-subtle">
            {config.tickCount} ticks · σ_eff = {sigmaEff.toFixed(4)} · target RTP{' '}
            {(config.targetRTP * 100).toFixed(0)}% · analytical ~{(analytical * 100).toFixed(1)}%
          </p>
        </div>
        <div className="space-y-1">
          {config.zones.map((zone) => (
            <div key={zone.label} className="flex justify-between gap-2 text-xs text-on-subtle">
              <span>{zone.label}</span>
              <span className="font-display tabular-nums">{formatSigmaRange(zone.minSigma, zone.maxSigma)}</span>
              <span className="font-display tabular-nums text-on-prominent">{zone.payout}×</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProvablyFairPage() {
  const zoneProbs = getZoneProbabilities();
  return (
    <div className="mx-auto max-w-3xl px-layout-margin-inline py-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="heading-h2 font-display text-on-prominent">
            Provably Fair
          </h1>
          <p className="body-sm text-on-subtle mt-1">
            Every outcome from verifiable market data, not opaque RNGs.
          </p>
        </div>
        <Button variant="tertiary" size="sm" asChild>
          <Link href="/">Back</Link>
        </Button>
      </div>

      <Separator />

      <section className="space-y-4">
        <h2 className="heading-h3 font-display text-on-prominent">
          How Entropy Works
        </h2>
        <p className="body-sm text-on-subtle leading-relaxed">
          All games (except Volatility Plinko) use real-time tick data streamed
          from the Deriv API. Each tick contains a financial quote (e.g.,{' '}
          <code className="font-display tabular-nums text-on-prominent bg-subtle px-1 rounded">
            6432.17
          </code>
          ). The <strong>last digit</strong> of this quote becomes the atomic unit of
          randomness — in this case, <strong>7</strong>.
        </p>
        <p className="body-sm text-on-subtle leading-relaxed">
          Deriv synthetic indices (Volatility 10, 25, 50, 100) produce ticks
          approximately once per second. Each tick is timestamped (epoch) and
          auditable. The last digit is uniformly distributed across 0–9, with
          each digit having a 10% probability.
        </p>
        <Card className="border-0 bg-subtle">
          <CardContent className="p-4 font-display text-xs">
            <p className="text-on-subtle mb-2">Example tick response:</p>
            <pre className="text-on-prominent whitespace-pre-wrap">{`{
  "tick": {
    "epoch": 1710300000,
    "quote": "6432.17",
    "symbol": "1HZ100V",
    "pip_size": 2
  }
}
// Last digit extracted: 7`}</pre>
          </CardContent>
        </Card>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="heading-h3 font-display text-on-prominent">
          Game 1: Digit Sync
        </h2>
        <p className="body-sm text-on-subtle leading-relaxed">
          A crash/chicken-out game. Each draw reveals the last digit of the next
          live tick. Collect unique digits (0–9) to increase your multiplier.
          If a duplicate appears, you&apos;re knocked out.
        </p>
        <Card className="border-0 bg-subtle">
          <CardContent className="p-4 space-y-2 body-sm">
            <p className="font-medium text-on-prominent">Key Formulas</p>
            <div className="font-display text-xs space-y-1 text-on-subtle">
              <p>P(survive draw n) = (10 − (n−1)) / 10</p>
              <p>P(survive all n draws) = 10! / ((10−n)! × 10^n)</p>
              <p>Fair multiplier at draw n = 1 / P(survive all n)</p>
              <p>Actual multiplier = Fair × 0.97 (3% house edge)</p>
            </div>
          </CardContent>
        </Card>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border-subtle text-on-subtle">
                <th className="py-2 text-left font-medium">Draw</th>
                <th className="py-2 text-right font-medium">Survival</th>
                <th className="py-2 text-right font-medium">Cumulative</th>
                <th className="py-2 text-right font-medium">Fair Multi</th>
                <th className="py-2 text-right font-medium">Actual (97%)</th>
              </tr>
            </thead>
            <tbody className="font-display tabular-nums">
              {[
                [1, '100%', '100.0%', '1.00×', '0.97×'],
                [2, '90%', '90.0%', '1.11×', '1.08×'],
                [3, '80%', '72.0%', '1.39×', '1.35×'],
                [4, '70%', '50.4%', '1.98×', '1.93×'],
                [5, '60%', '30.2%', '3.31×', '3.21×'],
                [6, '50%', '15.1%', '6.61×', '6.42×'],
                [7, '40%', '6.0%', '16.53×', '16.04×'],
                [8, '30%', '1.8%', '55.10×', '53.45×'],
                [9, '20%', '0.4%', '275.51×', '267.24×'],
                [10, '10%', '0.04%', '2755.10×', '2672.44×'],
              ].map(([draw, surv, cum, fair, actual]) => (
                <tr key={String(draw)} className="border-b border-border-subtle/50">
                  <td className="py-1.5">{draw}</td>
                  <td className="py-1.5 text-right">{surv}</td>
                  <td className="py-1.5 text-right">{cum}</td>
                  <td className="py-1.5 text-right">{fair}</td>
                  <td className="py-1.5 text-right text-on-prominent">{actual}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="heading-h3 font-display text-on-prominent">
          Game 2: Digit Poker
        </h2>
        <p className="body-sm text-on-subtle leading-relaxed">
          Video poker with digits 0–9 instead of cards. 5 digits dealt from
          live ticks. Hold any cards, draw replacements. Two Pair or better
          returns a profit.
        </p>
        <Card className="border-0 bg-subtle">
          <CardContent className="p-4 space-y-2 body-sm">
            <p className="font-medium text-on-prominent">Pay Table</p>
            <div className="space-y-1">
              {[
                ['Five of a Kind', '77777', '40×'],
                ['Four of a Kind', '33383', '9×'],
                ['Full House', '44422', '1.8×'],
                ['Straight', '89012', '1.5×'],
                ['Three of a Kind', '55563', '1.2×'],
                ['Two Pair', '33448', '1.1×'],
                ['One Pair', '33567', '0×'],
                ['High Card', '13579', '0×'],
              ].map(([hand, example, payout]) => (
                <div key={hand} className="flex justify-between text-xs text-on-subtle">
                  <span>
                    {hand}{' '}
                    <span className="font-display text-on-prominent/50">
                      ({example})
                    </span>
                  </span>
                  <span className="font-display tabular-nums">{payout}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="heading-h3 font-display text-on-prominent">
          Game 3: Digit Slots
        </h2>
        <p className="body-sm text-on-subtle leading-relaxed">
          3-reel slot machine. Each reel stopped by a live tick&apos;s last digit.
          Calibrated pay table targeting ~95.5% RTP.
        </p>
        <Card className="border-0 bg-subtle">
          <CardContent className="p-4 space-y-1 text-xs">
            {[
              ['777 (Jackpot)', '0.10%', '100×'],
              ['Triple (non-7)', '0.90%', '15×'],
              ['Sequential', '6.00%', '3×'],
              ['Pair', '27.00%', '2×'],
              ['No Match', '66.00%', '0×'],
            ].map(([combo, prob, payout]) => (
              <div key={combo} className="flex justify-between text-on-subtle">
                <span>{combo}</span>
                <div className="flex gap-6">
                  <span className="font-display tabular-nums w-16 text-right">{prob}</span>
                  <span className="font-display tabular-nums w-10 text-right">{payout}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <Separator />

      <section id="volatility-plinko" className="space-y-4 scroll-mt-6">
        <h2 className="heading-h3 font-display text-on-prominent">
          Game 4: Volatility Plinko
        </h2>
        <p className="body-sm text-on-subtle leading-relaxed">
          Unlike the other games, Volatility Plinko generates synthetic price
          paths client-side using Geometric Brownian Motion (GBM) with{' '}
          <code className="font-display tabular-nums text-on-prominent bg-subtle px-1 rounded">
            crypto.getRandomValues()
          </code>{' '}
          as the entropy source. Settlement uses the terminal log-return Z-score
          against σ-barriers — not the decorative digits shown on the chart.
        </p>
        <Card className="border-0 bg-subtle">
          <CardContent className="p-4 font-display text-xs text-on-subtle space-y-2">
            <p>S(t+1) = S(t) × exp((μ − σ²/2)Δt + σ√(Δt) × Z)</p>
            <p>μ = 0, Δt = 0.01 per tick, Z ~ N(0,1) via Box-Muller</p>
            <p>
              σ_eff = σ × tickCount / 100 — std dev of total log return over the path
            </p>
            <p>zScore = ln(S_T / S_0) / σ_eff → payout zone</p>
            <p className="text-on-prominent/80">
              The per-step drift term −(σ²/2)Δt biases log returns slightly negative vs
              the symmetric normal zone model. Payouts are calibrated to empirical
              Monte Carlo RTP, not the analytical formula alone.
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 bg-subtle">
          <CardContent className="p-4 space-y-2 body-sm">
            <p className="font-medium text-on-prominent">Zone probabilities (Z ~ N(0,1))</p>
            <div className="grid gap-1 text-xs text-on-subtle sm:grid-cols-2">
              <p>Center |Z| &lt; 1: {(zoneProbs.center * 100).toFixed(2)}%</p>
              <p>Inner 1–2σ (each side): {(zoneProbs.inner * 100).toFixed(2)}%</p>
              <p>Mid 2–3σ (each side): {(zoneProbs.mid * 100).toFixed(2)}%</p>
              <p>Outer 3–4σ (each side): {(zoneProbs.outer * 100).toFixed(3)}%</p>
              <p>Extreme ≥4σ (each side): {(zoneProbs.extreme * 100).toFixed(4)}%</p>
            </div>
            <p className="text-xs text-on-subtle pt-1">
              A payout ≥ 1× returns your stake or more. Center bands (0.2–0.5×) are
              partial returns — net losses after the full stake is deducted.
            </p>
          </CardContent>
        </Card>
        <div className="space-y-3">
          <PlinkoZoneTable risk="low" />
          <PlinkoZoneTable risk="medium" />
          <PlinkoZoneTable risk="high" />
        </div>
      </section>

      <Separator />

      <Card className="border-0 bg-subtle">
        <CardContent className="p-3">
          <p className="body-xs text-on-subtle">
            <strong className="text-on-prominent">Demo Only</strong> — No real money wagered. Data:{' '}
            <a
              href="https://api.deriv.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 hover:no-underline"
            >
              Deriv API
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
