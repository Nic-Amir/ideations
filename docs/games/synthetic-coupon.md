# Synthetic Coupon

Locked product brief + playable ideations POC. Full mechanics and platform_standard mapping live in [`product_spec.md`](./synthetic-coupon/product_spec.md).

## Thesis

Arcade-feel synthetic bond: stake enters a **price corridor** (double barrier). Survive each period `T` → accrue a **fixed-cash coupon**. Breach a barrier → **full position wipe**. Cash out anytime for stake + accrued coupons.

## Locked structuring

| Decision | Lock |
| --- | --- |
| Notional vs stake | **Stake = notional** |
| Coupon form | **Fixed cash per period** (`C = k × stake`) |
| Default | **Full position wipe** |
| Cash-out | **Anytime while alive after ≥1 tick** |
| Barrier style | **Fixed corridor from entry** |
| Duration | **Open-ended** |

Coupons **accrue on the position** until cash-out. Contract statuses follow platform_standard: `OPEN` → `WON` | `LOST`.

## Playable surface

- Route: `/game/synthetic-coupon` (Other ideas · Live)
- Engine: `src/lib/games/synthetic-coupon.ts` — integer cents, `locked_pricing`, `settlement_data`
- Spec: `docs/games/synthetic-coupon/product_spec.md`
- Fairness write-up: [`/provably-fair`](/provably-fair) (Game 5: Synthetic Coupon)

Cash-out is allowed anytime after the first survived tick. Soft horizon auto cash-outs at 360 ticks.

## Platform standard (in mind)

Ideations is client-side demo balance. The engine still emits mesh-shaped contracts so a Go product can port without reshaping: money in cents, locked pricing model name + margin + probs, settlement proof with path, `CONTRACT_SETTLED` outcomes `WON`/`LOST`. See product_spec §6 and §9.
