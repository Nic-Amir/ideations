import { Separator } from '@/components/ui/separator';

export default function ProvablyFairPage() {
  return (
    <div className="max-w-3xl mx-auto p-6 md:p-8 space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Provably Fair
        </h1>
        <p className="mt-2 text-muted-foreground">
          Every game outcome on Ideations is derived from verifiable,
          market-sourced data — not opaque random number generators.
        </p>
      </div>

      <Separator />

      <section className="space-y-4">
        <h2 className="font-display text-xl font-semibold">
          How Entropy Works
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          All games (except Volatility Plinko) use real-time tick data streamed
          from the Deriv API. Each tick contains a financial quote (e.g.,{' '}
          <code className="font-mono-game text-primary bg-muted px-1 rounded">6432.17</code>).
          The <strong>last digit</strong> of this quote becomes the atomic unit of
          randomness — in this case, <strong>7</strong>.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Deriv synthetic indices (Volatility 10, 25, 50, 100) produce ticks
          approximately once per second. Each tick is timestamped (epoch) and
          auditable. The last digit is uniformly distributed across 0–9, with
          each digit having a 10% probability.
        </p>
        <div className="rounded-lg bg-muted/50 p-4 font-mono-game text-xs">
          <p className="text-muted-foreground mb-2">Example tick response:</p>
          <pre className="text-foreground whitespace-pre-wrap">{`{
  "tick": {
    "epoch": 1710300000,
    "quote": "6432.17",
    "symbol": "R_100",
    "pip_size": 2
  }
}
// Last digit extracted: 7`}</pre>
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="font-display text-xl font-semibold">
          Game 1: Digit Collect
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          A crash/chicken-out game. Each draw reveals the last digit of the next
          live tick. Collect unique digits (0–9) to increase your multiplier.
          If a duplicate appears, you&apos;re knocked out.
        </p>
        <div className="rounded-lg bg-muted/50 p-4 space-y-2 text-sm">
          <p className="font-medium">Key Formulas</p>
          <div className="font-mono-game text-xs space-y-1 text-muted-foreground">
            <p>P(survive draw n) = (10 − (n−1)) / 10</p>
            <p>P(survive all n draws) = 10! / ((10−n)! × 10^n)</p>
            <p>Fair multiplier at draw n = 1 / P(survive all n)</p>
            <p>Actual multiplier = Fair × 0.97 (3% house edge)</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-2 text-left font-medium">Draw</th>
                <th className="py-2 text-right font-medium">Survival</th>
                <th className="py-2 text-right font-medium">Cumulative</th>
                <th className="py-2 text-right font-medium">Fair Multi</th>
                <th className="py-2 text-right font-medium">Actual (97%)</th>
              </tr>
            </thead>
            <tbody className="font-mono-game">
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
                <tr key={String(draw)} className="border-b border-border/30">
                  <td className="py-1.5">{draw}</td>
                  <td className="py-1.5 text-right">{surv}</td>
                  <td className="py-1.5 text-right">{cum}</td>
                  <td className="py-1.5 text-right">{fair}</td>
                  <td className="py-1.5 text-right text-primary">{actual}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="font-display text-xl font-semibold">
          Game 2: Digit Poker
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Video poker with digits 0–9 instead of cards. 5 digits dealt from
          live ticks. Hold any cards, draw replacements. Two Pair or better
          returns a profit.
        </p>
        <div className="rounded-lg bg-muted/50 p-4 space-y-2 text-sm">
          <p className="font-medium">Pay Table</p>
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
              <div key={hand} className="flex justify-between text-xs text-muted-foreground">
                <span>{hand} <span className="font-mono-game text-foreground/50">({example})</span></span>
                <span className="font-mono-game">{payout}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          With only 10 digit values, matching hands occur far more often than in
          standard poker. The top-end payouts are compressed to compensate, while
          every hand from Two Pair upward returns a profit. Calibrated to ~96.6%
          RTP with optimal hold strategy via exact brute-force computation over
          all 100,000 possible hands and 32 hold patterns.
        </p>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="font-display text-xl font-semibold">
          Game 3: Digit Slots
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          3-reel slot machine. Each reel stopped by a live tick&apos;s last digit.
          Calibrated pay table targeting ~95.5% RTP (verified via brute-force
          enumeration over all 1,000 possible outcomes).
        </p>
        <div className="rounded-lg bg-muted/50 p-4 space-y-1 text-xs">
          {[
            ['777 (Jackpot)', '0.10%', '100×'],
            ['Triple (non-7)', '0.90%', '15×'],
            ['Sequential', '6.00%', '3×'],
            ['Pair', '27.00%', '2×'],
            ['No Match', '66.00%', '0×'],
          ].map(([combo, prob, payout]) => (
            <div key={combo} className="flex justify-between text-muted-foreground">
              <span>{combo}</span>
              <div className="flex gap-6">
                <span className="font-mono-game w-16 text-right">{prob}</span>
                <span className="font-mono-game w-10 text-right">{payout}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Sequential detects any ordering of 3 consecutive digits mod 10
          (e.g., 3-1-2 or 0-9-8). Gamble feature: after any win, risk your
          winnings on the next tick digit. 0–4 = lose, 5–9 = double. Fair
          50/50 gamble (up to 5 rounds).
        </p>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="font-display text-xl font-semibold">
          Game 4: Volatility Run
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Unlike the other games, Volatility Run generates synthetic price
          paths client-side using Geometric Brownian Motion (GBM) with{' '}
          <code className="font-mono-game text-primary bg-muted px-1 rounded">crypto.getRandomValues()</code>{' '}
          as the entropy source. The final price position (percent change from
          start) determines the payout zone.
        </p>
        <div className="rounded-lg bg-muted/50 p-4 font-mono-game text-xs text-muted-foreground">
          <p>S(t+1) = S(t) × exp((μ − σ²/2)Δt + σ√(Δt) × Z)</p>
          <p className="mt-1">μ = 0 (no drift), σ = risk-dependent, Z = Box-Muller normal</p>
          <p className="mt-1">Payout = f(|percentChange|) — symmetric zones around 0%</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-2 text-left font-medium">Parameter</th>
                <th className="py-2 text-center font-medium">Low</th>
                <th className="py-2 text-center font-medium">Medium</th>
                <th className="py-2 text-center font-medium">High</th>
              </tr>
            </thead>
            <tbody className="font-mono-game">
              <tr className="border-b border-border/30">
                <td className="py-1.5 text-muted-foreground">Tick Count</td>
                <td className="py-1.5 text-center">8</td>
                <td className="py-1.5 text-center">12</td>
                <td className="py-1.5 text-center">16</td>
              </tr>
              <tr className="border-b border-border/30">
                <td className="py-1.5 text-muted-foreground">Sigma</td>
                <td className="py-1.5 text-center">0.15</td>
                <td className="py-1.5 text-center">0.35</td>
                <td className="py-1.5 text-center">0.60</td>
              </tr>
              <tr className="border-b border-border/30">
                <td className="py-1.5 text-muted-foreground">Center Payout</td>
                <td className="py-1.5 text-center">0.5×</td>
                <td className="py-1.5 text-center">0.3×</td>
                <td className="py-1.5 text-center">0.2×</td>
              </tr>
              <tr className="border-b border-border/30">
                <td className="py-1.5 text-muted-foreground">Max Payout</td>
                <td className="py-1.5 text-center">25×</td>
                <td className="py-1.5 text-center text-primary">170×</td>
                <td className="py-1.5 text-center text-primary">1000×</td>
              </tr>
              <tr>
                <td className="py-1.5 text-muted-foreground">Target RTP</td>
                <td className="py-1.5 text-center">97%</td>
                <td className="py-1.5 text-center">96%</td>
                <td className="py-1.5 text-center">95%</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Tick count per risk level controls variance — more ticks allow
          larger price moves. Zone barriers at ±1σ, ±2σ, ±3σ, ±4σ of
          effective volatility.
        </p>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="font-display text-xl font-semibold">
          Foundational Assumptions
        </h2>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="text-primary">1.</span>
            Last digits from Deriv synthetic indices are uniformly distributed
            across 0–9 (P = 0.10 each).
          </li>
          <li className="flex gap-2">
            <span className="text-primary">2.</span>
            Consecutive tick digits are independent (no autocorrelation).
          </li>
          <li className="flex gap-2">
            <span className="text-primary">3.</span>
            Generated volatility quotes for Volatility Run produce fair
            price paths via GBM with zero drift.
          </li>
        </ul>
        <p className="text-xs text-muted-foreground italic">
          Validation: Chi-squared goodness-of-fit test on 10,000+ ticks confirms
          uniformity. All game math is validated via Monte Carlo simulation.
        </p>
      </section>

      <Separator />

      <div className="rounded-xl border border-border bg-card/50 p-4 text-center">
        <p className="text-sm text-muted-foreground">
          <strong>Demo Only</strong> — No real money is wagered. This platform is
          a proof of concept demonstrating market-driven game mechanics.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Data source:{' '}
          <a
            href="https://api.deriv.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Deriv API
          </a>{' '}
          — Free WebSocket access to real-time synthetic index tick data.
        </p>
      </div>
    </div>
  );
}
