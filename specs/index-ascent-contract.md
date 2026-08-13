# index-ascent-contract Specification

## Purpose

Defines the Index Ascent contract lifecycle: synthetic instrument
selection (`ASCENT1` / `ASCENT5` / `ASCENT10`), geometric survival
against house-rounded per-tick crash probability, first-class anytime
cash-out (manual or auto-target), bust-on-down-tick settlement, the
status machine (`OPEN` → `{CASHOUT, LOST, REFUNDED}`), feed-backed
crash detection, stake bounds, the one-active-position constraint, and
the backend-owned trading principle. Multiplier maths and process RTP
are delegated to `index-ascent-pricing`; money movement to
`index-ascent-settlement`.

Index Ascent is an open-ended survival product on a **synthetic ascent
index**. The player stakes and holds through ascending ticks; the
displayed multiplier grows at a labeled per-tick growth rate. The
player may cash out at any time while `OPEN`. Any downward quote move
busts the position and the stake is forfeited. Unlike
`barrier-predictor-contract` and `barrier-touch-contract`, there is no
fixed maturity and no pre-generated GBM path: settlement is driven by
the live synthetic feed.

## Requirements
### Requirement: Instrument Selection

An Index Ascent contract SHALL be placed on exactly one synthetic ascent instrument:

| Symbol | Name | Advertised growth `g` | House-rounded `N` | Per-tick crash `p = 1/N` |
|---|---|---|---|---|
| `ASCENT1` | Ascent 1% | 0.01 | 100 | 0.01 |
| `ASCENT5` | Ascent 5% | 0.05 | 20 | 0.05 |
| `ASCENT10` | Ascent 10% | 0.10 | 10 | 0.10 |

`N` is **house-rounded** below the exact fair geometric value `N_fair = (1+g)/g` (101 / 21 / 11). The instrument locks both `g` and `N` at placement. The geometric crash model is memoryless: entry is allowed on any feed tick without changing the odds from that point forward.

#### Scenario: Ascent 5% accepted

- **WHEN** a placement specifies `instrument = "ASCENT5"`
- **THEN** the contract locks `growth_rate = 0.05`, `avg_ticks_per_crash = 20`, and `p = 1/20`
- **AND** subsequent survival and multiplier maths use those locked values

#### Scenario: Unknown instrument rejected

- **WHEN** a placement specifies an instrument other than `ASCENT1`, `ASCENT5`, or `ASCENT10`
- **THEN** the placement is rejected with `invalid_instrument`

### Requirement: Survival and Bust

While a contract is `OPEN`, each new feed quote is evaluated against the previous quote:

- If the quote is a **crash tick** (per "Feed and Crash Detection"): the contract transitions to `LOST` with `settle_reason = "bust"`. `ticks_survived` is **not** incremented. The player receives nothing (`sell_price = "0.000000"`). The displayed multiplier at bust is the pre-crash value (informational only; not a payout).
- Otherwise: `ticks_survived` increments by 1 and the live displayed multiplier updates per `index-ascent-pricing` "Displayed Multiplier".

There is no fixed maturity. The contract remains `OPEN` until cash-out, bust, or operator refund.

#### Scenario: Down tick busts the position

- **WHEN** a contract is `OPEN` with `ticks_survived = 12` and a crash tick arrives
- **THEN** the contract is LOST with `settle_reason = "bust"`
- **AND** `ticks_survived` remains `12` (not incremented)
- **AND** `sell_price = "0.000000"`

#### Scenario: Up or flat tick increments survival

- **WHEN** a contract is `OPEN` with `ticks_survived = 5` and a non-crash tick arrives
- **THEN** `ticks_survived` becomes `6`
- **AND** the contract stays `OPEN`
- **AND** the live displayed multiplier is recomputed for `k = 6`

### Requirement: Cash-Out Anytime

While a contract is `OPEN`, the player MAY cash out at any time, including immediately after entry. Cash-out is a first-class settlement path, not an informational mark.

**Manual cash-out.** A successful cash-out request transitions the contract to `CASHOUT` with `settle_reason = "manual_cashout"`. The player receives `potential_payout = round_down_6dp(stake × displayed_multiplier)` at the current `ticks_survived` (per `index-ascent-pricing` "Settlement Payout Computation").

**Auto-cashout.** An optional `auto_cashout_target` (≥ `1.01` when set) may be locked at buy. When a non-crash tick causes `displayed_multiplier ≥ auto_cashout_target`, the contract transitions to `CASHOUT` with `settle_reason = "auto_cashout"`. Settlement uses `settle_mult = max(1.01, min(auto_cashout_target, displayed_multiplier))`. For manual cash-out the settle multiplier is the live displayed value (which is `1.00` at entry).

**Same-tick precedence.** Crash is evaluated **before** auto-cashout. If a tick is a crash tick, the contract busts even if the auto-cashout target would have been reached on that same tick.

#### Scenario: Manual cash-out at entry

- **WHEN** a contract is `OPEN` with `ticks_survived = 0` and the player requests cash-out
- **THEN** the contract is CASHOUT with `settle_reason = "manual_cashout"`
- **AND** `sell_price = buy_price` (stake returned 1:1)

#### Scenario: Manual cash-out after climb

- **WHEN** a contract on `ASCENT5` has `ticks_survived = 10` (displayed multiplier = `1.05^10`) and the player cashes out
- **THEN** the contract is CASHOUT
- **AND** `sell_price = round_down_6dp(stake × displayed_multiplier)`

#### Scenario: Auto-cashout fires on target

- **WHEN** a contract has `auto_cashout_target = 2.00` and a non-crash tick first makes `displayed_multiplier ≥ 2.00`
- **THEN** the contract is CASHOUT with `settle_reason = "auto_cashout"`

#### Scenario: Same-tick crash beats auto-cashout

- **WHEN** a tick is both a crash tick and would have pushed `displayed_multiplier` to or above `auto_cashout_target`
- **THEN** the contract is LOST with `settle_reason = "bust"`
- **AND** `auto_cashed_out` is false / `settle_reason` is not `auto_cashout`

#### Scenario: Cash-out rejected when not OPEN

- **WHEN** a cash-out is requested for a terminal contract
- **THEN** the request is rejected and no ledger movement occurs

### Requirement: Contract Lifecycle

A contract MUST progress through:

1. `OPEN` — from `/buy` acceptance until terminal. Sub-states may be observed via `ticks_survived` (0 at entry; increasing on each survived tick).
2. One terminal state: `CASHOUT`, `LOST`, or `REFUNDED`.

A contract MUST NOT transition out of a terminal state. The status enum is exactly `{OPEN, CASHOUT, LOST, REFUNDED}`.

`settle_reason` (admin-only per `index-ascent-database` "contracts Table") takes:

- `"manual_cashout"` — player-initiated cash-out
- `"auto_cashout"` — auto-target reached on a non-crash tick
- `"bust"` — crash tick while OPEN
- `"operator_refund"` — operator or monitoring voided the position

Unlike `barrier-predictor-contract`, there is no ordinary no-touch refund. `REFUNDED` is operational only.

#### Scenario: OPEN → CASHOUT on manual exit

- **WHEN** the player cashes out an OPEN contract
- **THEN** status becomes `CASHOUT` and does not leave that state

#### Scenario: OPEN → LOST on bust

- **WHEN** a crash tick arrives while OPEN
- **THEN** status becomes `LOST` with `settle_reason = "bust"`

#### Scenario: Terminal is final

- **WHEN** a contract is `CASHOUT`, `LOST`, or `REFUNDED`
- **THEN** further ticks and cash-out requests do not change status or balances

#### Scenario: Operator refund

- **WHEN** an operator voids an OPEN contract
- **THEN** the contract is REFUNDED with `settle_reason = "operator_refund"`
- **AND** the stake is credited back via a REFUND ledger row

### Requirement: Contract Timestamps

| Field | Meaning | NULL when |
|---|---|---|
| `start_time` | Instant `/buy` was accepted; lock anchor | never |
| `entry_tick_at` | Timestamp of the feed quote used as the entry reference | never after acceptance |
| `ticks_survived` | Integer count of non-crash ticks since entry | never (0 at entry) |
| `auto_cashout_target` | Optional locked target (≥ 1.01) | when not requested |
| `settle_tick_at` | Instant of cash-out or bust settlement | non-terminal; may be null for pre-resolution operator refund |

Invariants:

- For CASHOUT / LOST: `start_time ≤ entry_tick_at < settle_tick_at` (or `≤` when settlement is on the entry window edge as defined by the feed handler).
- `ticks_survived ≥ 0`; on bust it equals the count before the crash tick.
- The displayed multiplier at any moment is a pure function of locked `g` and current `ticks_survived` (per pricing); it is not a separately persisted quote history requirement beyond audit needs.

#### Scenario: ticks_survived starts at zero

- **WHEN** a placement is accepted
- **THEN** `ticks_survived = 0` and displayed multiplier is `1.00`

#### Scenario: settle_tick_at set on cash-out

- **WHEN** a contract cashes out
- **THEN** `settle_tick_at` is non-null
- **AND** `ticks_survived` equals the survival count used for the payout multiplier

### Requirement: Parameter Locking

Locked at `start_time` and immutable for the contract life:

| Parameter | Meaning |
|---|---|
| `instrument` | Ascent symbol |
| `growth_rate` | Advertised `g` |
| `avg_ticks_per_crash` | House-rounded N |
| `per_tick_crash_probability` | p = 1/N |
| `max_multiplier` | 100 |
| `display_floor` | 1.00 |
| `stake` / `buy_price` | Debited stake |
| `auto_cashout_target` | Optional |
| `config_version` | Settings version |

There is **no** separate display house-edge parameter. Edge is embedded in the house-rounded `N` vs advertised `g` asymmetry (per `index-ascent-pricing`).

The **payout multiplier is not a single scalar locked at buy**. It is `M(ticks_survived)` evaluated at exit. Admin changes to instrument tables MUST NOT re-price an OPEN contract's locked `g` / `N`.

#### Scenario: g and N locked at buy

- **WHEN** a contract is accepted on `ASCENT1` with `g = 0.01` and `N = 100`
- **THEN** later admin edits to symbol metadata do not change that contract's growth schedule or crash probability

#### Scenario: Auto target locked

- **WHEN** a placement sets `auto_cashout_target = "2.00"`
- **THEN** the target is stored at INSERT and never updated
- **AND** mid-flight changes from the client are rejected

### Requirement: Feed and Crash Detection

Settlement MUST be driven by the backend's synthetic ascent feed consumer (per `index-ascent-feed`). The frontend MUST NOT decide bust or cash-out amounts.

A tick is a crash tick when:

```
(prev_quote − quote) / prev_quote > 1e-7
```

with finite positive `prev_quote`. Flat or upward moves are not crashes. Invalid quotes (`NaN`, non-positive prev) MUST NOT be treated as crashes; the handler MUST skip or hold per feed policy without falsely busting.

Between crashes, ascent indices are expected to tick strictly upward at ~1 Hz. The geometric model `p = 1/N` is the pricing assumption; material deviation of the live feed from that process is a model-risk concern for operators, not a client-side override.

#### Scenario: Relative drop above threshold is a crash

- **WHEN** `prev_quote = 1000` and `quote = 999.999` (relative drop > 1e-7)
- **THEN** `isCrashTick` is true

#### Scenario: Tiny float noise below threshold is not a crash

- **WHEN** the relative drop is ≤ `1e-7`
- **THEN** the tick is not a crash

#### Scenario: No client-side bust decision

- **WHEN** the frontend observes a down tick
- **THEN** it does not locally mark the contract LOST without a backend settlement message

### Requirement: Stake Bounds

The `stake` MUST be a 6-decimal USDT string, strictly positive, within `[min_stake, max_stake]`. Locked and debited verbatim as `buy_price`. Decimal-safe arithmetic only.

A placement whose `stake × max_multiplier` would exceed `max_single_payout` MUST be rejected at the risk cascade (per `index-ascent-risk`).

#### Scenario: Zero stake rejected

- **WHEN** `stake = "0.000000"`
- **THEN** the placement is rejected with `INVALID_STAKE`

#### Scenario: Stake stored verbatim

- **WHEN** `stake = "10.000000"` is accepted
- **THEN** `parameters.stake = "10.000000"` and `buy_price = 10.000000`
- **AND** PLAY_DEBIT amount is `-10.000000`

### Requirement: One Active Position Per Account

At most one non-terminal Index Ascent contract per account. A second placement while OPEN is rejected with `trade_in_progress`.

#### Scenario: Concurrent placement rejected

- **WHEN** an account holds an OPEN ascent contract and submits another
- **THEN** the placement is rejected with `trade_in_progress`

#### Scenario: Placement after terminal accepted

- **WHEN** the prior contract is CASHOUT or LOST and a new placement is submitted
- **THEN** it is evaluated normally

### Requirement: Backend-Owned Trading Logic

All trading logic MUST live on the backend, identically for `ACC-` and `DEMO-`:

- Contracts created only via `POST /api/index-ascent/buy` (or the portfolio-equivalent path).
- Cash-out only via backend-authenticated `POST /api/index-ascent/cashout` (or authenticated WS command that the backend alone settles).
- Bust decided only by the backend feed handler.
- Balances move only on the backend; history via contracts endpoints.

#### Scenario: No client-side bypass

- **WHEN** the frontend handles launch or cash-out gestures
- **THEN** there is no path that credits winnings or marks bust without a backend response

#### Scenario: Demo follows the same path

- **WHEN** a `DEMO-` account plays
- **THEN** survival, bust, and cash-out use the identical backend code path as `ACC-`
