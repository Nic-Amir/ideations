# Digit Delta

Locked product brief + playable ideations POC. Full mechanics and platform_standard mapping live in [`product_spec.md`](./digit-delta/product_spec.md).

## Thesis

Digit Delta is a **trading-gamified** Higher/Lower digit game: build a streak on live last digits, **Hold**, then beat the house dealer’s run. You are paid on the **length Δ** (`playerLen − dealerLen`) via a tapered pay table. Length ties (on stand) refund the stake. Dealer bust always pays the player on the same Δ (at least Δ1).

**House edge is second-move only** — player and dealer share the same stop floor (cannot stop on the opening digit alone). Equal digits reroll (not collected). Length 6 is a fixed jackpot climax.

Inspired by casino Ride the Tide structure, but framed as digit trading — not a Digit Ladder variant (no parlay multipliers).

## Locked structuring

| Decision | Lock |
| --- | --- |
| Face | **Free draw** — next tick locks D before stake |
| Collect | Strict Higher / Lower; **equal → reroll** (not collected); wrong way → **LOST** |
| Stop floor | Both sides: must call after the opening digit (length ≥ 2 to stop) |
| Hold | Player may Hold at length ≥ 2 (**~3 recommended**) |
| Dealer (len ≥ 2) | **0–3 Higher · 4–6 Stand · 7–9 Lower** |
| Dealer (len 1) | Must call — optimal Higher (≤5) / Lower (≥6); never Stand |
| Reach length 6 | Instant **WON**; fixed jackpot **3.6×**; dealer does not play |
| Dealer bust | Player **WON**; Δ = `max(playerLen − dealerLen, 1)` |
| Stand win | `playerLen > dealerLen` → tapered payout by Δ |
| Stand tie | `playerLen === dealerLen` → **REFUNDED** |
| Pricing | `digit_delta_taper_v1` / pay table **v5** |

Statuses: `OPEN` → `WON` | `LOST` | `REFUNDED`.

## RTP (validated)

Under uniform digits + optimal picks, equal=reroll, tapered table + 3.6× cap jackpot:

| Strategy | Approx RTP |
| --- | --- |
| Hold at 2 | **~89%** |
| Hold at 3 (recommended) | **~98.5–99%** |
| Hold at 4 | **~91%** |
| Hold at 5 | **~78%** |
| Hold at 6 (jackpot ride) | **~81%** |

Pay table (total return): Δ1 **2.25×** · Δ2 **2.55×** · Δ3 **2.8×** · Δ4 **3×** · Δ5+ **3.15×** · length-6 jackpot **3.6×**.

Max strategy RTP ≤ 99%. Hold-at-3 is the clear sweet spot.

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

Client POC with mesh-shaped rounds: integer cents, `locked_pricing` (pay table version + auto_win_mult), `settlement_data` with lengths/Δ/dealer_stop_reason.
