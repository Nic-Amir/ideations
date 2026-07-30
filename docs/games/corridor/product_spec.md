# Corridor — Product Specification

**Version:** 1.0 · **Date:** July 2026  
**Read `platform_standard.md` first** (trading-game-specs). This document defines only product-specific behavior. Everything in the platform standard applies unchanged when this product is ported to the Deriv Product Mesh.

**Ideations note:** The playable POC in this repo is client-side. Engine types, money (integer cents), contract status, `locked_pricing`, and `settlement_data` mirror platform_standard §6.2 / §8.1 / §23.7 so a Go backend can lift them without reshaping the product.

**Arcade name:** Corridor · **Mechanic subtitle:** Stay in / Goes out · **Slug:** `corridor`

---

## 1. Glossary of Terms

**Stake / Notional:** The amount the player risks. Stake equals notional — one number at risk; no leverage.

**Corridor:** The open price interval between the Upper Barrier and Lower Barrier. Fixed at contract placement for the full duration `T`.

**Stay in (Inside):** Contract side that wins if the synthetic price never touches either barrier for all `T` ticks (no-touch).

**Goes out (Outside):** Contract side that wins if either barrier is touched (inclusive) on or before tick `T` (first touch).

**Upper Barrier (U) / Lower Barrier (L):** Log-symmetric price levels around the entry spot: `U = S₀ × exp(+d)`, `L = S₀ × exp(−d)`. Fixed at placement.

**Barrier Offset (d):** Log-distance from entry spot to each barrier. Locked in `locked_pricing`.

**Duration (T):** Number of ticks to maturity. Player picks from fixed options (5 / 10 / 15).

**First touch:** The earliest tick where `price ≥ U` or `price ≤ L`. Settles Goes out as winner.

**No-touch:** Path stays strictly inside `(L, U)` for all `T` ticks. Settles Stay in as winner. **Not a refund.**

**Entry Spot (S₀):** Synthetic price at placement. Barriers and pricing lock from S₀.

**Tick:** One GBM price update. One tick = one second of simulated time.

**Locked Multiplier:** Payout multiple for the picked side, locked at place: `mult = (1/p) × (1 − margin)`.

**Locked Pricing:** Immutable pricing snapshot at placement (`pricing_model`, margin, σ, d, T, p_stay, p_goes, mults, pick). Required by platform_standard §6.2.

**Settlement Data:** Self-contained proof of outcome (path, touched side or null, settle tick, stake/payout cents). Required for audit replay (§12).

---

## 2. Product Concept

Corridor is a fixed-duration Stay-in / Goes-out arcade: the player stakes a notional, taps Inside or Outside on a time-strip board showing live multipliers, then watches a path run for `T` ticks. No mid-path cash-out.

**Why this product exists:** trading-game has Barrier Predictor (first-touch + refund) but no Stay-in / Goes-out product. Box-O supplies the UX DNA (spatial tap, mults on surface, instant settle FX) without cloning its grid.

**Core loop:** (1) Set stake, distance, T; (2) tap Inside or Outside — terms lock; (3) path reveals; (4) settle `WON` / `LOST` with FX.

---

## 3. Feed Requirements

- **Feed type:** Synthetic Product Feed (server-generated when ported; client GBM in ideations POC)
- **Model:** Driftless GBM — `close_new = close_prev × exp(−0.5σ²dt + σ√dt · Z)`
- **σ:** Default instrument `V_100` (σ = 1.0 annualized), S₀ = 100,000
- **dt:** `1 / (365 × 24 × 3600)` (one second)
- **Z:** Cryptographically secure RNG (`crypto/rand` / Web Crypto) — platform_standard §23
- **Tick frequency:** 1 Hz simulated; UI may reveal faster for pacing

---

## 4. Product Mechanics

### 4.1 Contract Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `contract_type` | String | Always `CORRIDOR` |
| `instrument` | String | e.g. `V_100` |
| `entry_spot` | Decimal | S₀ at placement |
| `upper_barrier` / `lower_barrier` | Decimal | Locked corridor |
| `barrier_offset` | Decimal | Log-distance d |
| `ticks` | Integer | Duration T |
| `pick` | String | `stay` \| `goes` |
| `stake_amount` | USDT | Stake (platform stores USDT; engine uses cents) |

### 4.2 Settlement

| Condition | Winner side | If player picked that side |
| --- | --- | --- |
| No barrier touch for all T ticks | Stay in | `WON`, payout = stake × locked mult |
| First touch of U or L within T | Goes out | `WON`, payout = stake × locked mult |
| Opposite of winner | — | `LOST`, payout = 0 |
| Urgent shutdown void | — | `VOID`, stake refunded (platform_standard §7) |

No `REFUNDED` path in normal play (unlike Barrier Predictor no-touch).

### 4.3 Tick Evaluation

After each tick `t = 1…T`:

1. If `price >= U` or `price <= L` → settle immediately (Goes out wins)  
2. Else if `t < T` → continue  
3. Else (`t = T`, still inside) → Settle Stay in wins  

No mid-path cash-out.

### 4.4 Duration

Fixed maturity `T` ticks. Player selects from `{5, 10, 15}`.

### 4.5 Distance presets

Barrier width is a multiple of the calibrated offset where P(touch) ≈ 0.5 at factor 1.0 (same family as Barrier Predictor):

| Preset | Factor | Effect |
| --- | --- | --- |
| Near | 0.75 | Tighter corridor → Stay harder, Goes easier |
| Standard | 1.0 | Balanced |
| Far | 1.4 | Wider corridor → Stay easier, Goes harder |

---

## 5. Pricing Model

### 5.1 Fair probabilities

```
p_stay = noTouchProbability(offsetSigma, T)   // discrete first-passage grid
p_goes = 1 − p_stay
```

`offsetSigma = calibratedOffsetSigma(T) × distanceFactor`, with per-tick drift μ in σ units matching the GBM settlement loop (Barrier Predictor family).

### 5.2 Multipliers

Platform margin `m` (default **0.03**):

```
mult_stay = (1 / p_stay) × (1 − m)
mult_goes = (1 / p_goes) × (1 − m)
```

Display/lock as two-decimal multipliers (floor at 1.01). Payout in integer cents: `floor(stake_cents × mult)` (or `Math.floor` equivalent).

Expected value per unit stake on either side ≈ `−m` when using the corresponding fair `p`.

### 5.3 `locked_pricing` (required fields)

```json
{
  "pricing_model": "corridor_double_barrier_v1",
  "platform_margin": 0.03,
  "sigma": 1.0,
  "dt_years": 3.1709791983764586e-8,
  "ticks": 10,
  "distance_preset": "standard",
  "p_stay": 0.5,
  "p_goes": 0.5,
  "mult_stay": 1.94,
  "mult_goes": 1.94,
  "barrier_offset_log": 0.0004,
  "offset_sigma": 2.5,
  "pick": "stay",
  "instrument": "V_100"
}
```

---

## 6. Money & Contracts (platform_standard)

- All money in **integer cents** internally; USDT float only at API boundary with `Round(x * 100)`.
- Contract statuses: `OPEN` → `WON` | `LOST` (| `VOID` on shutdown).
- `currency`: `"USDT"`.
- `settlement_data` MUST include: `outcome`, `pick`, `touched` (`upper`|`lower`|`null`), `settle_tick`, `prices`, `stake_cents`, `payout_cents`, `locked_multiplier`.
- `feed_snapshot`: instrument, σ, ticks used for settlement.
- Server authority when ported — client POC is non-authoritative demo.

### 6.1 Activity

On settle, emit `CONTRACT_SETTLED` with `outcome` `WON`/`LOST`, stake/payout in USDT (platform_standard §22).

---

## 7. Risk & Limits (product-specific defaults)

| Limit | Default |
| --- | --- |
| Min stake | 0.10 USDT (10¢) |
| Max stake | Product settings (ideations UI: 5000 credits) |
| Commission / margin | 3% of stake EV target |
| Cash-out | Disallowed |

---

## 8. Frontend (platform_standard §25 + product)

- Mobile-first column; sentence case  
- Hero: scrolling **time strip** — columns = future windows; each has Inside / Outside tap targets with **live multipliers**  
- Stake dock + duration / distance controls  
- One gesture: tap zone → path runs → settle  
- Result overlay + particles / sound (Box-O / Barrier Predictor spirit)  
- Design tokens only (no hardcoded hex)  
- **Do not** present primary CTA as “Buy Stay In / Buy Goes Out” under a chart

---

## 9. Ideations ↔ Mesh mapping

| Mesh deliverable | Ideations POC |
| --- | --- |
| Go backend + DB contracts | Pure TS engine + in-memory contract object |
| Authoritative feed | Client driftless GBM + crypto RNG |
| Balance / ledger | Demo `balance-store` |
| Arcade registry | `game-registry.ts` track `other` |
| Provably fair | Short `/provably-fair` section |
