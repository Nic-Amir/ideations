# index-ascent-pricing Specification

## Purpose

Defines how Index Ascent positions are priced while open and at
cash-out. Covers the house-rounded geometric crash process, the
advertised growth multiplier (with **no** separate display edge), the
process RTP identity and its cap exception, auto-target tick maths,
firm live cash-out quotes, settlement payout computation, and audit
inputs locked at buy.

Unlike `barrier-predictor-pricing` (discrete first-passage + refund-aware
odds) and `barrier-race-pricing` (overround `1/(P+c)`), Index Ascent uses
a **memoryless geometric crash** with house-rounded `N` paired to an
advertised growth rate `g`. The paid curve is `M(k) = (1+g)^k`. There is
no multiplicative `e = 0.02` display edge. The house edge is the
asymmetry between crash spacing and paid growth.

Lifecycle and cash-out semantics are delegated to `index-ascent-contract`;
money movement to `index-ascent-settlement`.

## Requirements
### Requirement: House-Rounded Instruments

Exact fair geometric pairing would use `N_fair = (1+g)/g` so that
`p = g/(1+g)` and `P(survive k) × (1+g)^k = 1`. Index Ascent instead uses
**house-rounded** integer `N = floor(N_fair)`:

| Instrument | `g` | Exact fair N | Locked N | `p = 1/N` | Per-tick factor `(1−p)(1+g)` |
|---|---|---|---|---|---|
| `ASCENT1` | 0.01 | 101 | **100** | 0.01 | 0.9999 |
| `ASCENT5` | 0.05 | 21 | **20** | 0.05 | 0.9975 |
| `ASCENT10` | 0.10 | 11 | **10** | 0.10 | 0.99 |

Exact fair growth for a locked N would be `g_fair = 1/(N−1)` (~1.0101% / ~5.263% / ~11.111%). Paying the lower labeled `g` while crashing at `p = 1/N` is the sole commercial edge.

#### Scenario: Locked table is normative

- **WHEN** a contract is accepted on any ascent instrument
- **THEN** `growth_rate` and `avg_ticks_per_crash` match the table above
- **AND** `per_tick_crash_probability = 1 / avg_ticks_per_crash`

### Requirement: Geometric Survival Model

Let `N = avg_ticks_per_crash` and `p = 1/N`. After surviving `k` ticks without a crash:

```
P(survive k) = (1 − p)^k          # 1 when k ≤ 0
```

The process is memoryless: from any entry tick, survival for the next `k` ticks depends only on `N` and `k`, not on history before entry.

#### Scenario: Survival at k = 0

- **WHEN** `k = 0` for any `N`
- **THEN** `P(survive 0) = 1`

#### Scenario: Survival on Ascent 5%

- **WHEN** `k = 10` and `N = 20`
- **THEN** `P(survive 10) = (19/20)^10`

### Requirement: Displayed Multiplier

With advertised growth `g`, display floor `1.00`, and cap `MAX_MULTIPLIER = 100`:

```
M(k) = clamp((1 + g)^k, 1.00, 100)     # 1 when k ≤ 0
```

There is **no** `× (1 − e)` display edge. This is the number shown to the player and the basis for manual cash-out payouts.

#### Scenario: Displayed at k = 10, Ascent 5%

- **WHEN** `k = 10` and `g = 0.05`
- **THEN** `M = 1.05^10 ≈ 1.628895`

#### Scenario: Entry is 1.00

- **WHEN** `k = 0`
- **THEN** `M = 1.00`

#### Scenario: Cap binds deep runs

- **WHEN** `k` is large enough that `(1+g)^k > 100` (e.g. `g = 0.10`, `k = 49`)
- **THEN** `M = 100`

### Requirement: Process RTP

For any `k` where the multiplier cap is **not** binding:

```
RTP(k) = P(survive k) × M(k) = [(1 − p)(1 + g)]^k
```

| Instrument | Per-tick factor | RTP at k = 10 (uncapped) |
|---|---|---|
| Ascent 1% | 0.9999 | ≈ 0.99900045 |
| Ascent 5% | 0.9975 | ≈ 0.97530913 |
| Ascent 10% | 0.99 | ≈ 0.90438208 |

Edge compounds with depth: deeper climbs → lower expected return. Cap at 100 further favors the house for large `k`.

**Cap exception.** Once `M` is capped at 100, `RTP(k) < [(1−p)(1+g)]^k` for that `k`.

#### Scenario: Uncapped process RTP on Ascent 10%

- **WHEN** `k = 10`, `N = 10`, `g = 0.10` (cap not binding)
- **THEN** `P(survive 10) × M(10) = 0.99^10`

#### Scenario: Cap exception documented

- **WHEN** `M` is capped at 100
- **THEN** `P(survive k) × 100` is strictly less than the uncapped process RTP for that `k`
- **AND** the pricing record MUST make the cap visible to operators

### Requirement: Settlement Payout Computation

At settlement:

- **CASHOUT (manual)** → `sell_price = round_down_6dp(stake × M(ticks_survived))` using the displayed multiplier at exit (may be `1.00`).
- **CASHOUT (auto)** → `sell_price = round_down_6dp(stake × settle_mult)` where `settle_mult = max(1.01, min(auto_cashout_target, M(ticks_survived)))`.
- **LOST (bust)** → `sell_price = "0.000000"`.
- **REFUNDED** → `sell_price = buy_price`.

WIN/CASHOUT credit ledger uses `+sell_price`. No credit on LOST. Decimal-safe arithmetic only; `float64` money forbidden.

#### Scenario: Manual cash-out payout

- **WHEN** `stake = "100.000000"`, `g = 0.05`, `k = 10`, manual cash-out
- **THEN** `sell_price = round_down_6dp(100 × 1.05^10)` under decimal evaluation of the displayed mult
- **AND** a CASHOUT credit ledger row carries that amount

#### Scenario: Bust pays nothing

- **WHEN** a contract busts
- **THEN** `sell_price = "0.000000"` and no credit ledger row is written

#### Scenario: Auto settle uses target clamp

- **WHEN** auto-cashout fires with `target = 2.00` and `M = 2.01`
- **THEN** settlement uses `settle_mult = 2.00` (min of target and displayed, still ≥ 1.01)

### Requirement: Auto-Target Math

The number of survived ticks required for `M` to reach a target `T` is:

```
k = 0                         if T ≤ 1
k = ∞                         if T > 100
k = ceil( ln(T) / ln(1 + g) ) otherwise
```

Milestone targets `[1.1, 1.25, 1.5, 2, 3, 5, 10, 25, 50, 100]` SHOULD be computable for info surfaces via this formula plus `P(survive k)`.

#### Scenario: Ticks to 1.5× on Ascent 5%

- **WHEN** `target = 1.5` and `g = 0.05`
- **THEN** `k = 9`
- **AND** `M(9) ≥ 1.5` and `M(8) < 1.5`

#### Scenario: Target above cap unreachable

- **WHEN** `target = 101`
- **THEN** ticks-to-reach is infinite / unreachable

### Requirement: Live Position Value

While `OPEN`, the firm cash-out offer is:

```
contract_current_value = round_down_6dp(stake × M(ticks_survived))
```

This is **not** merely indicative: it is the amount a successful manual cash-out pays at that instant (subject to race with a simultaneous bust on the next tick handler ordering — crash is evaluated on tick arrival before cash-out application for that same quote).

#### Scenario: Live value tracks the climb

- **WHEN** `ticks_survived` increases on a non-crash tick
- **THEN** `contract_current_value` updates to `stake × M(k)`

#### Scenario: Live value at entry is stake

- **WHEN** `ticks_survived = 0`
- **THEN** `contract_current_value = stake`

### Requirement: Recorded Pricing Inputs

Every contract MUST persist enough inputs in `locked_pricing` (admin-only) to audit cash-out and RTP claims:

- Engine id `geometric-growth-house-rounded-n`
- `instrument`, `growth_rate`, `avg_ticks_per_crash`, `per_tick_crash_probability`
- `display_floor`, `max_multiplier`
- `stake`, `auto_cashout_target` (if any), `config_version`
- At settlement: `ticks_survived`, `displayed_multiplier`, `sell_price`, `settle_reason`

MUST NOT appear on trimmed player endpoints. MUST NOT persist a separate `house_edge` scalar — edge is implied by locked `g` and `N`.

#### Scenario: Audit re-derives displayed mult

- **WHEN** an auditor reads `locked_pricing` and settlement `ticks_survived`
- **THEN** they recompute `M = clamp((1+g)^k, 1, 100)`
- **AND** it matches the settled displayed multiplier

#### Scenario: locked_pricing omitted from player GET

- **WHEN** a player reads their contract
- **THEN** `locked_pricing` is absent from the response

### Requirement: Payout Viability

At placement, `stake × max_multiplier` MUST NOT exceed the configured `max_single_payout` (per `index-ascent-risk`). Auto-cashout targets MUST satisfy `1.01 ≤ target ≤ 100` when provided.

#### Scenario: Target below 1.01 rejected

- **WHEN** `auto_cashout_target = "1.00"`
- **THEN** the placement is rejected with `invalid_auto_cashout_target`

#### Scenario: Max payout gate

- **WHEN** `stake × 100` exceeds `max_single_payout`
- **THEN** the placement is rejected at the risk cascade
