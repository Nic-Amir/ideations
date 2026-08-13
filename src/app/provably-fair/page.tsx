import Link from 'next/link';
import {
  Button,
  Card,
  CardContent,
  Separator,
} from '@trading-game/design-intelligence-layer';

export default function ProvablyFairPage() {
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
          Digit and Crash games resolve from a continuous market-style tick
          stream (local ~1 Hz feed in this POC). Each tick carries a quote
          (e.g.{' '}
          <code className="font-display tabular-nums text-on-prominent bg-subtle px-1 rounded">
            6432.17
          </code>
          ). The <strong>last digit</strong> of this quote becomes the atomic unit of
          randomness — in this case, <strong>7</strong>.
        </p>
        <p className="body-sm text-on-subtle leading-relaxed">
          Volatility and Crash-style instruments produce ticks approximately once
          per second. Each tick is timestamped and auditable within the session.
          For digit games, last digits are treated as uniform across 0–9. For
          Index Ascent, the index correction is the source of randomness.
        </p>
        <p className="body-sm text-on-subtle leading-relaxed">
          Client-side simulation games (Volatility Plinko, Barrier Predictor /
          Race / Touch, Corridor, Synthetic Derby) generate paths with
          driftless geometric Brownian motion and{' '}
          <code className="font-display tabular-nums text-on-prominent bg-subtle px-1 rounded">
            crypto.getRandomValues()
          </code>{' '}
          — not tick last digits.
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
          Index Ascent
        </h2>
        <p className="body-sm text-on-subtle leading-relaxed">
          A momentum game on synthetic ascent indices (Ascent 1%, 5%, 10%).
          Each instrument pays a labeled per-tick growth rate while crashing
          on average once every house-rounded N ticks (100 / 20 / 10). A
          correction is detected as any downward move in the quote, since the
          index only rises between correction events.
        </p>
        <p className="body-sm text-on-subtle leading-relaxed">
          The correction distribution is geometric and therefore{' '}
          <strong>memoryless</strong>: every tick carries the same 1-in-N
          correction probability regardless of how long the ascent has run. This
          is why a position can open on any tick without changing the odds.
        </p>
        <Card className="border-0 bg-subtle">
          <CardContent className="p-4 space-y-2 body-sm">
            <p className="font-medium text-on-prominent">Key Formulas</p>
            <div className="font-display text-xs space-y-1 text-on-subtle">
              <p>p (correction per tick) = 1 / N</p>
              <p>P(survive k ticks) = (1 − p)^k</p>
              <p>Displayed multiplier after k ticks = (1 + g)^k</p>
              <p>Process RTP at cash-out = [(1 − p)(1 + g)]^k</p>
              <p>House edge = house-rounded N vs labeled g (no separate 2% display edge)</p>
            </div>
          </CardContent>
        </Card>
        <p className="body-sm text-on-subtle leading-relaxed">
          Multipliers are capped at 100× and auto-exits settle at a minimum of
          1.01×. Every round is auditable against the synthetic tick history.
        </p>
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
                ['Five of a Kind', '77777', '7×'],
                ['Four of a Kind', '33383', '5×'],
                ['Full House', '44422', '2.38×'],
                ['Straight', '89012', '2.08×'],
                ['Three of a Kind', '55563', '1.61×'],
                ['Two Pair', '33448', '1.52×'],
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
          3×3 grid. Each row is filled by three sequential ticks from its own
          chosen feed symbol (rows fill in parallel). Eight paylines settle
          additively (3 rows + 3 columns + 2 diagonals). Stake is split across
          the lines (
          <code className="font-display tabular-nums text-on-prominent bg-subtle px-1 rounded">
            line bet = stake/8
          </code>
          ); each matching pattern pays{' '}
          <code className="font-display tabular-nums text-on-prominent bg-subtle px-1 rounded">
            line bet × multiplier
          </code>
          . Example at stake 100: Pair pays 25 credits per matching line, Triple
          187.5, Jackpot 777 pays 1,250. Wins credit automatically. Target RTP
          ~95.5%.
        </p>
        <Card className="border-0 bg-subtle">
          <CardContent className="p-4 space-y-1 text-xs">
            <div className="flex justify-between text-on-subtle mb-2 font-semibold">
              <span>Pattern (per line)</span>
              <div className="flex gap-6">
                <span className="w-16 text-right">Prob</span>
                <span className="w-24 text-right">@ stake 100</span>
              </div>
            </div>
            {[
              ['777 (Jackpot)', '0.10%', '1,250 credits'],
              ['Triple (non-7)', '0.90%', '187.5 credits'],
              ['Sequential', '6.00%', '37.5 credits'],
              ['Pair', '27.00%', '25 credits'],
              ['No Match', '66.00%', '0'],
            ].map(([combo, prob, payout]) => (
              <div key={combo} className="flex justify-between text-on-subtle">
                <span>{combo}</span>
                <div className="flex gap-6">
                  <span className="font-display tabular-nums w-16 text-right">{prob}</span>
                  <span className="font-display tabular-nums w-24 text-right">{payout}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="heading-h3 font-display text-on-prominent">
          Game 4: Volatility Plinko
        </h2>
        <p className="body-sm text-on-subtle leading-relaxed">
          Unlike digit and Crash games, Volatility Plinko generates synthetic price
          paths client-side using Geometric Brownian Motion (GBM) with{' '}
          <code className="font-display tabular-nums text-on-prominent bg-subtle px-1 rounded">
            crypto.getRandomValues()
          </code>{' '}
          as the entropy source.
        </p>
        <Card className="border-0 bg-subtle">
          <CardContent className="p-4 font-display text-xs text-on-subtle">
            <p>S(t+1) = S(t) × exp((μ − σ²/2)Δt + σ√(Δt) × Z)</p>
            <p className="mt-1">μ = 0 (no drift), σ = risk-dependent, Z = Box-Muller normal</p>
          </CardContent>
        </Card>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="heading-h3 font-display text-on-prominent">
          Game 5: Corridor
        </h2>
        <p className="body-sm text-on-subtle leading-relaxed">
          Fixed-duration Stay in / Goes out. Stake equals notional inside a
          log-symmetric double barrier for T ticks. Inside wins if the path
          never touches either barrier; Outside wins on first touch. No mid-path
          cash-out and no refund on no-touch.
        </p>
        <p className="body-sm text-on-subtle leading-relaxed">
          Entropy is client-side driftless GBM with{' '}
          <code className="font-display tabular-nums text-on-prominent bg-subtle px-1 rounded">
            crypto.getRandomValues()
          </code>
          , same family as Barrier Predictor. Fair{' '}
          <code className="text-on-prominent">p_stay</code> comes from the
          discrete first-passage grid; each side pays{' '}
          <code className="font-display text-on-prominent">
            (1/p)×(1−m)
          </code>{' '}
          with margin m ≈ 0.03, locked at place.
        </p>
        <Card className="border-0 bg-subtle">
          <CardContent className="p-4 space-y-2 text-xs text-on-subtle">
            <p>
              Money uses integer cents. Each round stores{' '}
              <code className="text-on-prominent">locked_pricing</code> (
              <code className="text-on-prominent">corridor_double_barrier_v1</code>
              ) and <code className="text-on-prominent">settlement_data</code>{' '}
              with path, touched side, and payout for audit replay.
            </p>
            <p className="font-display">
              p_stay = noTouchProbability · mult = (1/p)×(1−m) · outcomes WON /
              LOST
            </p>
          </CardContent>
        </Card>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="heading-h3 font-display text-on-prominent">
          Game 6: Digit Ladder
        </h2>
        <p className="body-sm text-on-subtle leading-relaxed">
          Casino-style Higher / Lower on the next tick&apos;s last digit versus
          the face digit. Strict compare only — ties bust the pot. After a win,
          cash out or parlay the entire pot on the next rung.
        </p>
        <p className="body-sm text-on-subtle leading-relaxed">
          Settlement digits come from the tick stream — no client RNG for
          outcomes. Fair probabilities assume uniform last digits:{' '}
          <code className="font-display tabular-nums text-on-prominent bg-subtle px-1 rounded">
            P(Higher)=(9−D)/10
          </code>
          ,{' '}
          <code className="font-display tabular-nums text-on-prominent bg-subtle px-1 rounded">
            P(Lower)=D/10
          </code>
          . Multipliers use the Digits commission formula{' '}
          <code className="font-display text-on-prominent">1/(p+0.02)</code>,
          locked per step.
        </p>
        <Card className="border-0 bg-subtle">
          <CardContent className="p-4 space-y-2 text-xs text-on-subtle">
            <p>
              Money uses integer cents. Each round stores{' '}
              <code className="text-on-prominent">locked_pricing</code> (
              <code className="text-on-prominent">digit_ladder_vs_current_v1</code>
              ) with per-step snapshots and{' '}
              <code className="text-on-prominent">settlement_data</code> for
              audit replay.
            </p>
            <p className="font-display">
              Parlay pot = floor(pot × step_mult) · cash-out credits pot · bust
              pays 0
            </p>
          </CardContent>
        </Card>
      </section>

      <Separator />

      <Card className="border-0 bg-subtle">
        <CardContent className="p-3">
          <p className="body-xs text-on-subtle">
            <strong className="text-on-prominent">Demo Only</strong> — No real
            money wagered. Tick games use a local market-style feed in this POC.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
