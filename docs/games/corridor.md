# Corridor

Locked product brief + playable ideations POC. Full mechanics and platform_standard mapping live in [`product_spec.md`](./corridor/product_spec.md).

## Thesis

Corridor is a fixed-duration double-barrier arcade: stake a notional, tap **Inside** or **Outside** under a corridor chart, and win if price stays between log-symmetric barriers for all `T` ticks (Stay in) or touches either barrier within `T` (Goes out). Fair odds come from Barrier Predictor’s discrete `noTouchProbability` on a fixed corridor width; multipliers lock at place with house margin; no mid-path cash-out. Feel is Box-O DNA (spatial tap, live mults on the board, one gesture, settle FX) — not a trading-terminal binary form.

## Locked structuring

| Decision | Lock |
| --- | --- |
| Notional vs stake | **Stake = notional** |
| Contract sides | **Stay in** (no-touch) vs **Goes out** (first touch) |
| Barriers | **Fixed log-symmetric corridor from entry** |
| Duration | **Fixed T ticks** (player picks 5 / 10 / 15) |
| Cash-out | **None** (avoids wall-snipe / American edge) |
| No-touch outcome | **Stay in wins** (not a refund) |
| Pricing | **Fair p from discrete double-barrier grid; mult = (1/p)×(1−margin) per side** |

Contract statuses follow platform_standard: `OPEN` → `WON` | `LOST`.

## Playable surface

- Route: `/game/corridor` (Other ideas · Live)
- Engine: `src/lib/games/corridor.ts` — integer cents, `locked_pricing`, `settlement_data`
- Spec: `docs/games/corridor/product_spec.md`
- Fairness write-up: [`/provably-fair`](/provably-fair) (Game 5: Corridor)

## Distinct from

| Product | Difference |
| --- | --- |
| Barrier Predictor | Which barrier touches first; no-touch = refund. Here no-touch = Stay wins; touch = Goes wins |

## Platform standard (in mind)

Ideations is client-side demo balance. The engine still emits mesh-shaped contracts so a Go product can port without reshaping: money in cents, locked pricing model name + margin + probs, settlement proof with path, `CONTRACT_SETTLED` outcomes `WON`/`LOST`. See product_spec §6 and §9.
