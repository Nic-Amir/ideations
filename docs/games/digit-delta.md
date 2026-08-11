# Digit Delta

Locked product brief + playable ideations POC. Full mechanics and platform_standard mapping live in [`product_spec.md`](./digit-delta/product_spec.md).

## Thesis

Digit Delta is a **trading-gamified** Higher/Lower digit game: build a streak on live last digits, **Hold**, then beat the house dealer’s run. You are paid on the **length Δ** via a fixed pay table. Length ties (on stand) refund the stake. Dealer bust always pays the player (Δ = player length).

Inspired by casino Ride the Tide structure, but framed as digit trading — not a Digit Ladder variant (no parlay multipliers).

## Locked structuring

| Decision | Lock |
| --- | --- |
| Face | **Free draw** — next tick locks D before stake |
| Collect | Strict Higher / Lower; equal or wrong → **LOST** |
| Hold | Allowed at length ≥ 2 (face + ≥1 correct call) |
| Dealer | **0–3 Higher · 4–6 Stand (settle) · 7–9 Lower** until stand or bust |
| Dealer bust | Player **WON**; Δ = `playerLen` (dealer treated as 0) |
| Stand win | `playerLen > dealerLen` → fixed payout by Δ |
| Stand tie | `playerLen === dealerLen` → **REFUNDED** |
| Pricing | Fixed total-return table (not live step mults) |

Statuses: `OPEN` → `WON` | `LOST` | `REFUNDED`.

## RTP (validated)

Under uniform digits + optimal player picks:

| Strategy | Approx RTP |
| --- | --- |
| Hold at 3 (recommended) | **~97%** |
| Hold at 4 | ~96% |
| Hold at 2 | ~95% (slightly worse) |

Pay table (total return incl. stake): Δ1 **1.5×** · Δ2 **2.3×** · Δ3 **3.3×** · Δ4 **4.75×** · Δ5+ **6.75×**.

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
