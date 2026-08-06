# Digit Ladder

Locked product brief + playable ideations POC. Full mechanics and platform_standard mapping live in [`product_spec.md`](./digit-ladder/product_spec.md).

## Thesis

Digit Ladder is casino High/Low on live last digits: the face digit is the current tick’s last digit; the player calls **Higher** or **Lower** for the **next** tick. Wins can be **cashed out** or **parlayed** (climb the ladder) — the whole pot rides the next step. Odds follow Digits Over/Under math vs the entry digit; ties bust.

## Locked structuring

| Decision | Lock |
| --- | --- |
| Face value | **Current last digit D** |
| Sides | **Higher** (`D' > D`) / **Lower** (`D' < D`) |
| Tie | **LOST** (busts pot) |
| Duration | **1 tick per step** |
| Money | **Parlay** — stake debited once; continue risks entire pot; cash-out credits pot |
| Pricing | **Digits commission:** `mult = 1 / (base_prob + 0.02)` |
| Offers | **D=0** no Lower; **D=9** no Higher |

Contract statuses follow platform_standard: `OPEN` → `WON` (cashed) | `LOST` (bust).

## Playable surface

- Route: `/game/digit-ladder` (Other ideas · Live)
- Engine: `src/lib/games/digit-ladder.ts` — integer cents, `locked_pricing`, `settlement_data`
- Spec: `docs/games/digit-ladder/product_spec.md`
- Fairness write-up: [`/provably-fair`](/provably-fair) (Digit Ladder)

## Distinct from

| Product | Difference |
| --- | --- |
| Digits Over/Under | Keypad threshold + multi-tick duration; no parlay ladder |
| Rise Fall | Price direction vs barrier, not last-digit compare |

## Platform standard (in mind)

Ideations is client-side demo balance. The engine still emits mesh-shaped rounds so a Go product can port without reshaping: money in cents, locked pricing model + commission + per-step snapshots, settlement proof with digits, outcomes `WON`/`LOST`. See product_spec §6 and §9.
