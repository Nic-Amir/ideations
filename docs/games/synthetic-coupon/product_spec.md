# Synthetic Coupon — Product Specification

**Version:** 1.0 · **Date:** July 2026  
**Read `platform_standard.md` first** (trading-game-specs). This document defines only product-specific behavior. Everything in the platform standard applies unchanged when this product is ported to the Deriv Product Mesh.

**Ideations note:** The playable POC in this repo is client-side. Engine types, money (integer cents), contract status, `locked_pricing`, and `settlement_data` mirror platform_standard §6.2 / §8.1 / §23.7 so a Go backend can lift them without reshaping the product.

---

## 1. Glossary of Terms

**Stake / Notional:** The amount the player risks. Stake equals notional — one number at risk; no leverage.

**Corridor:** The open price interval between the Upper Barrier and Lower Barrier. The position survives only while the synthetic price stays strictly inside (or on) the corridor until a breach check fails.

**Upper Barrier (U) / Lower Barrier (L):** Log-symmetric price levels around the entry spot: `U = S₀ × exp(+d)`, `L = S₀ × exp(−d)`. Fixed at contract placement.

**Barrier Offset (d):** Log-distance from entry spot to each barrier. Locked in `locked_pricing`.

**Coupon Period (T):** Number of ticks between coupon accruals. Configurable (e.g. 5 / 10 / 15).

**Fixed Coupon (C):** Constant cash amount accrued to the position after each full period survived without breach. `C = k × stake`, with `k` set by distance preset. Accrues on the position; not paid to the wallet until settlement.

**Accrued Coupons:** Running sum of coupons earned while the contract is `OPEN`.

**Position Value (V):** `stake + accrued` (display). On cash-out, payout equals V. On default, payout is 0.

**Default / Breach:** Price reaches or crosses U or L. Contract status → `LOST`; full position wipe.

**Early Cash-Out:** Player settles while `OPEN` after at least one coupon. Contract status → `WON`; `payout_amount` = stake + accrued (USDT).

**Entry Spot (S₀):** Synthetic price at placement. Barriers and pricing lock from S₀.

**Tick:** One GBM price update. One tick = one second of simulated time.

**Locked Pricing:** Immutable pricing snapshot at placement (`pricing_model`, margin, σ, d, T, k, C, p_period). Required by platform_standard §6.2.

**Settlement Data:** Self-contained proof of outcome (path/ticks evaluated, breach side or cash-out tick, accrued, payout). Required for audit replay (§12).

---

## 2. Product Concept

Synthetic Coupon is an open-ended survival / income game: the player stakes into a fixed double-barrier corridor and accrues a fixed-cash coupon every period the price stays inside. They may cash out anytime for stake plus accrued coupons, or lose everything on barrier breach.

**Why this product exists:** Combines Aviator-style cash-out timing with accumulator-style period survival and Barrier Predictor corridor visuals — an arcade “synthetic bond” without fixed-income UI.

**Core loop:** (1) Configure stake, corridor width, period T; (2) enter — terms lock; (3) watch price in corridor; (4) each survived T accrues C; (5) cash out → `WON`, or breach → `LOST`.

---

## 3. Feed Requirements

- **Feed type:** Synthetic Product Feed (server-generated when ported; client GBM in ideations POC)
- **Model:** Driftless GBM — μ effective via Itô: `close_new = close_prev × exp(−0.5σ²dt + σ√dt · Z)`
- **σ:** Default instrument `V_100` (σ = 1.0 annualized), S₀ = 100,000
- **dt:** `1 / (365 × 24 × 3600)` (one second)
- **Z:** Cryptographically secure RNG (`crypto/rand` / Web Crypto) — platform_standard §23
- **Tick frequency:** 1 Hz simulated; UI may reveal faster for pacing

---

## 4. Product Mechanics

### 4.1 Contract Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `contract_type` | String | Always `SYNTHETIC_COUPON` |
| `instrument` | String | e.g. `V_100` |
| `entry_spot` | Decimal | S₀ at placement |
| `upper_barrier` / `lower_barrier` | Decimal | Locked corridor |
| `barrier_offset` | Decimal | Log-distance d |
| `period_ticks` | Integer | T |
| `coupon_cents` | Integer | Fixed C in integer cents |
| `stake_amount` | USDT | Stake (platform stores USDT; engine uses cents) |

### 4.2 Settlement

| Condition | Status | `payout_amount` |
| --- | --- | --- |
| Player cash-out while alive | `WON` | stake + accrued (USDT) |
| Price touches/crosses U or L | `LOST` | 0 |
| Urgent shutdown void | `VOID` | stake refunded (platform_standard §7) |

No `REFUNDED` path in normal play (unlike Barrier Predictor no-touch).

### 4.3 Tick Evaluation

After each tick:

1. If `price >= U` or `price <= L` → settle `LOST` immediately  
2. Else if ticks since last coupon (or entry) reach `period_ticks` → accrue `C`, reset period counter  
3. Else continue  

Cash-out may occur between ticks while status is `OPEN`, after **at least one coupon** has accrued (blocks free cancel and pre-coupon bail). Soft horizon: if still alive after `MAX_ROUND_TICKS` (360), the contract auto cash-outs (`WON`).

### 4.4 Duration

Open-ended until cash-out or default. No hard maturity.

---

## 5. Pricing Model

### 5.1 Period survival

`p = P(no barrier touch over next T ticks | currently inside)` via the same discrete first-passage grid as Barrier Predictor (`noTouchProbability`).

### 5.2 Coupon sizing (one-period EV anchor)

Assume a player who plans to cash out after exactly one more period, risking current stake S (at entry, accrued = 0):

```
EV = p × (S + C) + (1 − p) × 0 − S = p·C − (1 − p)·S
```

Target `EV = −m · S` with platform margin `m` (default **0.02**):

```
C = S × (1 − p − m) / p
```

Equivalently pick coupon rate `k = C/S` per distance preset and solve barrier offset so `p = (1 − m) / (1 + k)`.

| Preset | `k` | Tag |
| --- | --- | --- |
| Near | 0.08 | Higher coupon, tighter corridor |
| Standard | 0.05 | Balanced |
| Far | 0.03 | Lower coupon, wider corridor |

`C` and barriers **lock at entry**. Later periods keep the same fixed `C` (constant cash), not re-sized to `V` — readable product; RTP for multi-period play is validated by Monte Carlo under cash-out policies.

### 5.3 `locked_pricing` (required fields)

```json
{
  "pricing_model": "synthetic_coupon_period_notouch_v1",
  "platform_margin": 0.02,
  "sigma": 1.0,
  "dt_years": 2.0e-7,
  "period_ticks": 10,
  "distance_preset": "standard",
  "coupon_rate_k": 0.05,
  "coupon_cents": 500,
  "p_period_notouch": 0.9333,
  "barrier_offset_log": 0.0012,
  "offset_sigma": 3.8
}
```

---

## 6. Money & Contracts (platform_standard)

- All money in **integer cents** internally; USDT float only at API boundary with `Round(x * 100)`.
- Contract statuses: `OPEN` → `WON` | `LOST` (| `VOID` on shutdown).
- `currency`: `"USDT"`.
- `settlement_data` MUST include: outcome reason (`cash_out` | `default`), breach side if any, tick index, price path (or hash + seed for replay), accrued_cents, payout_cents, timestamps.
- `feed_snapshot`: instrument, σ, ticks used for settlement.
- Server authority when ported — client POC is non-authoritative demo.

### 6.1 Activity

On settle, emit `CONTRACT_SETTLED` with `outcome` `WON`/`LOST`, stake/payout in USDT (platform_standard §22).

### 6.2 Early cash-out vs platform cashout

**Player early cash-out** settles the open contract (`WON`).  
**Platform `/api/credits/cashout`** drains product balance and may `settle_open` per §6.1 — distinct from in-round cash-out.

---

## 7. Risk & Limits (product-specific defaults)

| Limit | Default |
| --- | --- |
| Min stake | 0.10 USDT (10¢) |
| Max stake | Product settings (ideations UI: 5000 credits) |
| Max periods before soft warning | None (open-ended) |
| Commission / margin | 2% one-period EV anchor |

---

## 8. Frontend (platform_standard §25 + product)

- Mobile-first column; sentence case  
- Hero: corridor chart with fixed U/L  
- HUD: accrued coupons, next-coupon countdown, position value  
- Primary CTA while open: Cash out (shows payout)  
- Result overlay: Cashed out vs Defaulted  
- Design tokens only (no hardcoded hex)

---

## 9. Ideations ↔ Mesh mapping

| Mesh deliverable | Ideations POC |
| --- | --- |
| Go backend + DB contracts | Pure TS engine + in-memory contract object |
| Session / credits API | Zustand demo balance |
| SSE activity | Local history only |
| crypto/rand | `crypto.getRandomValues` |

Port checklist: implement platform_standard endpoints; persist contracts; move RNG and settlement server-side; keep this spec’s mechanics and `locked_pricing` schema.
