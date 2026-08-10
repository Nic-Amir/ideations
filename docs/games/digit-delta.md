# Digit Delta

Locked product brief + playable ideations POC. Full mechanics and platform_standard mapping live in [`product_spec.md`](./digit-delta/product_spec.md).

## Thesis

Digit Delta is a **trading-gamified** Higher/Lower digit game: build a streak on live last digits, **Hold**, then beat the house dealer’s run. You are paid on the **length Δ** (player − dealer) via a fixed pay table. Length ties refund the stake.

Inspired by casino Ride the Tide structure, but framed as digit trading — not a Digit Ladder variant (no parlay multipliers).

## Locked structuring

| Decision | Lock |
| --- | --- |
| Face | **Free draw** — next tick locks D before stake |
| Collect | Strict Higher / Lower; equal or wrong → **LOST** |
| Hold | Allowed at length ≥ 2 (face + ≥1 correct call) |
| Dealer | **0–4 Higher · 5 Stand (settle) · 6–9 Lower** until stand or bust |
| Win | `playerLen > dealerLen` → fixed payout by Δ |
| Tie | `playerLen === dealerLen` → **REFUNDED** |
| Pricing | Fixed total-return table (not live step mults) |

Statuses: `OPEN` → `WON` | `LOST` | `REFUNDED`.

## RTP (validated)

Under uniform digits + optimal player picks:

| Strategy | Approx RTP |
| --- | --- |
| Hold at 3 (recommended) | **~97%** |
| Hold at 4 | ~96% |
| Hold at 2 | ~83% (worse — encourages longer streaks) |

Pay table (total return incl. stake): Δ1 **2.7×** · Δ2 **3.65×** · Δ3 **4.9×** · Δ4 **6.8×** · Δ5+ **9.5×**.

## Playable surface

- Route: `/game/digit-delta` (Other ideas · Live)
- Play loop UI: **Build → Hold → Dealer → Result** with a You vs Dealer board and live Δ
- Engine: `src/lib/games/digit-delta.ts`
- Spec: `docs/games/digit-delta/product_spec.md`

## Distinct from

| Product | Difference |
| --- | --- |
| Digit Ladder | Parlay pot + per-step multipliers; no dealer |
| Digits Over/Under | Threshold prediction; no streak Hold |

## Platform standard (in mind)

Client POC with mesh-shaped rounds: integer cents, `locked_pricing` (pay table version), `settlement_data` with lengths/Δ/dealer_stop_reason.
