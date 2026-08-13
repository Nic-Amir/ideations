# barrier-predictor-pricing Specification

## Purpose

Defines how Barrier Predictor contracts are priced and how their live
mark-to-market value is computed while open. Covers the discrete
first-passage grid that produces touch / no-touch probabilities under
tick-by-tick barrier monitoring, the refund-aware commission model
that keeps expected value at approximately `−commission` of stake, the
default barrier-offset calibration, validation gates, and the pricing
inputs persisted on every contract for audit replay.

Barrier Predictor pricing differs from `rise-fall-pricing` (Normal CDF
at a fixed expiry) and from `barrier-race-pricing` (2D FFT first-to-touch
across two assets). Here a single driftless GBM walks inside a
log-symmetric corridor; the fair probability of winning on a chosen side
is half the probability of touching either barrier before maturity.
Because no-touch refunds the stake in full, the commercial multiplier
MUST account for that refund mass — the legacy product_spec §5.2 formula
`(1 / P_fair) × (1 − margin)` does not, and is superseded by this
specification.

Lifecycle, selection, and first-to-touch semantics are delegated to
`barrier-predictor-contract`; money movement to
`barrier-predictor-settlement`.

## Requirements
### Requirement: Win Probability Engine

The no-touch and first-touch probabilities SHALL be computed by **iterating a surviving probability density on a 1D grid in per-tick-σ units**, with absorbing barriers at `±xSigma`. This discrete first-passage method is the sole pricing engine. Monte Carlo simulation MUST NOT be used to price; it is used only for verification (see "Config Validation Gates").

Working in units of one per-tick standard deviation (`s = σ √dt`), a walk starts at 0 with per-tick mean `μ_σ = −½ σ √dt` (the Itô correction expressed in σ-units) and absorbing barriers at `±xSigma`, where `xSigma = d / s` and `d` is the log barrier offset. After `T` ticks the surviving mass inside `(−xSigma, +xSigma)` is `P_notouch`. Then:

```
P_touch       = 1 − P_notouch
P_fair        = P_touch / 2          # UPPER or LOWER, by log-symmetry + driftless GBM
```

By construction `P_fair_upper + P_fair_lower + P_notouch = 1`.

**Grid construction.** Use `GRID_CELLS = 200` equal-width cells spanning `(−xSigma, +xSigma)`. Cell width `h = 2 × xSigma / GRID_CELLS`.

**Initial step.** The walk starts as a point mass at 0. The first-step mass in each cell is the exact Gaussian probability of landing in that cell:

```
cur[i] = Φ(lo_i + h − μ_σ) − Φ(lo_i − μ_σ)
```

where `lo_i` is the lower edge of cell `i` and `Φ` is the standard normal CDF.

**Transition kernel.** For subsequent ticks, mass propagates via a Toeplitz Gaussian kernel between cell centres: the probability of moving from source cell `u` to destination cell `v` depends only on the index offset and is the exact Gaussian mass of the destination cell relative to the source centre. Absorbed mass (any transition that would land at or beyond `±xSigma`) is discarded from the surviving density — matching the settlement loop, which evaluates barriers once per generated tick.

**Termination.** After `T` steps, `P_notouch = min(1, sum(cur))`. Early degenerate inputs: `xSigma ≤ 0` yields `P_notouch = 0`; `T ≤ 0` yields `P_notouch = 1`.

**Rejected alternative.** The maturity-window approximation

```
P_notouch ≈ Φ(d / (σ √τ)) − Φ(−d / (σ √τ))
```

(with `τ = T × dt`) is the probability that the *terminal* price sits inside the corridor, not the probability that the path never left it under tick-by-tick monitoring. It MUST NOT be used as the pricing engine. For `T = 1` the two coincide (and the calibrated offset recovers the 0.6745 quantile); for `T > 1` discrete monitoring requires a wider corridor to hold the same `P_touch`, which the grid captures and the maturity CDF does not.

#### Scenario: Single-tick no-touch matches the Normal CDF

- **WHEN** `noTouchProbability` is evaluated at `xSigma ∈ {0.5, 1, 2}` with `T = 1`
- **THEN** the result equals `Φ(x) − Φ(−x)` within 1e-4
- **AND** the maturity-window formula and the discrete grid agree

#### Scenario: Default calibration yields P_touch ≈ 0.5

- **WHEN** the engine prices `V_100` (σ = 1.0) at `T ∈ {5, 10, 15, 20}` with the auto-calibrated Standard offset
- **THEN** `P_touch ≈ 0.5` and `P_fair ≈ 0.25` for each duration (within 1e-3)
- **AND** `P_fair_upper + P_fair_lower + P_notouch = 1`

#### Scenario: Longer duration requires a wider calibrated corridor

- **WHEN** calibrated offsets are compared across durations
- **THEN** `calibratedOffsetSigma(10) > calibratedOffsetSigma(5)`
- **AND** `calibratedOffsetSigma(20) > calibratedOffsetSigma(10)`

#### Scenario: Maturity CDF MUST NOT price

- **WHEN** offered odds are computed for a contract with `T > 1`
- **THEN** the probabilities used are the discrete-grid outputs
- **AND** the maturity-window formula `Φ(d/(σ√τ)) − Φ(−d/(σ√τ))` is not substituted

#### Scenario: Monte Carlo MUST NOT price

- **WHEN** offered odds are computed for a config
- **THEN** the probabilities used are the grid-engine outputs
- **AND** no Monte Carlo estimate is substituted, even when a validation run is available

### Requirement: Default Offset Calibration

The default barrier offset for a given `(σ, T)` SHALL be the unique positive `xSigma` such that the discrete `P(touch) ≈ 0.5` (equivalently `P_notouch ≈ 0.5`). It is found by bisection on `noTouchProbability` (approximately 26 iterations over a bracket such as `[0.2, 12]`).

```
offset_sigma_default = calibratedOffsetSigma(T, μ_σ)
offset_log           = offset_sigma_default × σ × √dt
```

A player-selected **distance factor** `f` (Near `0.75`, Standard `1.0`, Far `1.4`) scales the calibrated offset:

```
offset_sigma = offset_sigma_default × f
offset_log   = offset_sigma × σ × √dt
```

Near barriers raise `P_touch` and enrich the decisive multiplier; Far barriers lower `P_touch` and lean the multiplier. Calibration results SHOULD be cached per `(T, μ_σ)` key.

For `T = 1`, the calibrated `xSigma` recovers the Normal 75th-percentile constant `≈ 0.6745` (the product_spec §5.4 quantile), because single-tick monitoring coincides with the terminal-inside probability.

#### Scenario: Single-tick calibration recovers 0.6745

- **WHEN** `calibratedOffsetSigma(1)` is computed under the default driftless Itô correction
- **THEN** the result is approximately `0.6745` (within 1e-3)

#### Scenario: Standard distance at T = 10

- **WHEN** pricing runs for `V_100`, `T = 10`, distance factor `1.0`
- **THEN** `P_touch ≈ 0.5` and `P_fair ≈ 0.25`
- **AND** `offered_odds ≈ 1.88` (per "Commission Model")

#### Scenario: Near raises touch probability

- **WHEN** pricing runs for `T = 10` with distance factor `0.75` (Near) versus `1.0` (Standard)
- **THEN** Near `P_touch` is greater than Standard `P_touch`
- **AND** Near `offered_odds` is greater than Far `offered_odds` at the same `T`

#### Scenario: Far lowers touch probability

- **WHEN** pricing runs for `T = 10` with distance factor `1.4` (Far) versus `1.0` (Standard)
- **THEN** Far `P_touch` is less than Standard `P_touch`

### Requirement: Probability Computation Timing

The probabilities and offered odds are a **pure function of** `(σ, d, T, c)` (equivalently `(σ, T, distance_factor, c)` when `d` is auto-calibrated). They MUST be computed (or read from cache) at pricing / preview / buy time and locked onto the contract at `start_time`.

Two placements with identical locked inputs receive identical probabilities and identical offered odds. A later admin change to instrument volatility or commission MUST NOT re-price an existing `OPEN` contract; the locked values in `locked_pricing` are authoritative.

Unlike `rise-fall-pricing`, there is no separate time-to-maturity re-anchoring mid-contract for the *locked* multiplier — the multiplier is fixed at buy. Remaining time enters only the informational live mark-to-market (see "Live Position Value").

#### Scenario: Identical inputs price identically

- **WHEN** two placements on `V_100` select `UPPER`, `T = 10`, Standard distance, an hour apart, under the same live settings
- **THEN** both receive the same `P_fair` and the same `offered_odds`

#### Scenario: Settings change does not re-price an open contract

- **WHEN** an admin lowers `V_100` volatility while a contract is `OPEN`
- **THEN** the `OPEN` contract retains its locked probabilities, `offered_odds`, and `potential_payout`
- **AND** any new placement is priced against the new volatility

### Requirement: Commission Model

The product SHALL charge commission by a **refund-aware** multiplier that keeps the player's expected value at approximately `−c` times the stake for every calibrated setting. This supersedes the legacy product_spec §5.2 formula.

For commission rate `c` and grid outputs `P_touch`, `P_notouch`, `P_fair = P_touch / 2`:

```
raw_mult         = (P_touch − c) / P_fair          # = 2 × (1 − c / P_touch) when P_fair > 0
offered_odds     = max(1.01, round_half_up_2dp(raw_mult))
potential_payout = round_down_6dp(stake × offered_odds)
buy_price        = stake                            (verbatim; debited at buy)
```

Derivation of the EV identity (before 2-dp rounding):

```
EV = P_fair × raw_mult + P_notouch × 1 − 1
   = P_fair × (P_touch − c) / P_fair + (1 − P_touch) − 1
   = (P_touch − c) + 1 − P_touch − 1
   = −c
```

So the house edge is exactly the commission fraction of stake when `raw_mult` is used without rounding. After 2-dp rounding of `offered_odds`, EV remains approximately `−c`.

Properties:

- **`offered_odds` is the authoritative quote.** The 2-decimal multiplier is the number quoted to the player and the number payout is derived from. Rounding happens **before** multiplication by stake.
- **Floor at 1.01.** If raw arithmetic would produce a multiplier at or below 1.00 (degenerate deep-no-touch or excessive commission), the quote is floored at `1.01` and the placement MUST still pass "Offered-Odds Viability" (typically it will fail EV or payout checks and be rejected).
- **Round half-up on odds, round DOWN on money.** `offered_odds` rounds half-up to 2 dp. `potential_payout` rounds DOWN to 6 dp. The house never overpays.
- The PLAY_DEBIT ledger row's amount is `−stake` (= `−buy_price`).
- The WIN_CREDIT ledger row's amount is `+potential_payout`.
- The REFUND ledger row's amount is `+stake` (= `+buy_price`), for both `no_touch` and `operator_refund`.

**Superseded formula (non-normative).** The legacy product_spec §5.2 formula

```
displayed_multiplier = (1 / P_fair) × (1 − c)
```

with default `P_fair = 0.25` yields `3.88×`. That formula ignores the `P_notouch` refund mass: paying `3.88×` on a 25% win while refunding half of all rounds hands the player approximately **+47% EV**. It MUST NOT be used for production pricing. The §5.3 note quoting ~1.94× already gestured at the conditional/refund-aware view; this specification makes that view normative at **1.88×** for the default (`(0.5 − 0.03) / 0.25 = 1.88`).

Arithmetic MUST go through a decimal-safe library (`shopspring/decimal` in Go, Postgres `NUMERIC` in SQL); `float64` arithmetic on money is forbidden.

#### Scenario: Worked default, V_100, T = 10, Standard, stake 100

- **WHEN** a contract is priced with `P_touch ≈ 0.5`, `P_fair ≈ 0.25`, `c = 0.03`, and `stake = "100.000000"`
- **THEN** `raw_mult = (0.5 − 0.03) / 0.25 = 1.88`
- **AND** `offered_odds = "1.88"`
- **AND** `potential_payout = "188.000000"`
- **AND** `buy_price = "100.000000"`

#### Scenario: Worked default, stake 10

- **WHEN** the same pricing is applied with `stake = "10.000000"` and `offered_odds = "1.88"`
- **THEN** `potential_payout = "18.800000"` under decimal arithmetic
- **AND** it MUST NOT be a binary-float truncation artefact of evaluating `10 × 1.88` in IEEE-754

#### Scenario: Refund-aware EV ≈ −commission

- **WHEN** expected value per unit stake is computed as `P_fair × offered_odds + P_notouch − 1` at every `(T, distance_factor)` pair in `{5,10,15,20} × {Near, Standard, Far}`
- **THEN** EV is negative
- **AND** EV is within 0.01 of `−0.03`

#### Scenario: Legacy 3.88× formula is non-normative

- **WHEN** an implementer compares this specification to product_spec §5.2 / §5.4
- **THEN** the normative default multiplier is approximately `1.88`, not `3.88`
- **AND** hard-coding `3.88` as the offered odds violates this requirement

#### Scenario: Odds rounded before multiplication

- **WHEN** a player is quoted `offered_odds = "1.88"` and stakes `"10.000000"`
- **THEN** `potential_payout = "18.800000"`, exactly `stake × 1.88` under decimal arithmetic

#### Scenario: Round-DOWN discipline on payout

- **WHEN** `offered_odds = "1.88"` and `stake = "1.111111"`, so the exact product is `2.08888868`
- **THEN** the persisted `potential_payout` is `"2.088888"` (truncated at 6 dp)
- **AND** it MUST NOT be `"2.088889"`

### Requirement: Expected Value

For every published combination of instrument, `tick_duration`, and distance factor, the player's expected value per unit stake

```
EV = P_fair × offered_odds + P_notouch × 1.0 − 1.0
```

MUST be strictly negative and SHOULD approximate `−c`. A setting whose EV is at or above zero MUST be rejected at publish / validation time and MUST NOT be offered on `/preview` or `/buy`.

The refund term `P_notouch × 1.0` is load-bearing: omitting it is exactly how the superseded 3.88× formula produces a player edge.

#### Scenario: Default settings have house edge ≈ 3%

- **WHEN** EV is evaluated for `V_100`, `T = 10`, Standard distance, `c = 0.03`
- **THEN** EV is approximately `−0.03`

#### Scenario: Positive-EV setting rejected

- **WHEN** a proposed setting would yield `EV ≥ 0` after applying the commission model
- **THEN** the setting is rejected and is not offered to players

### Requirement: Probability Clamp and Offered-Odds Viability

Each of `P_notouch`, `P_touch`, and `P_fair` MUST be clamped to `[0, 1]` with `P_fair` further guarded away from zero before division: if `P_fair < 1e-6`, the placement or config MUST be rejected rather than producing astronomical odds.

Pricing MUST verify:

- `offered_odds > 1.0` (after the 1.01 floor, still require genuine upside vs stake at the chosen stake via the payout check),
- `potential_payout > buy_price` at placement,
- `P_touch > c` so that `raw_mult` is positive and meaningful.

A placement failing these checks is rejected with `contract_buy_validation_error` (HTTP 422) per `barrier-predictor-risk` "Rejection Reason Precedence". Degenerate deep-no-touch corridors (Far barriers + very short `T` with miscalibration) and excessive commission are rejected at publish time when the failure is config-derived.

#### Scenario: Default setting is viable

- **WHEN** viability is checked for `V_100`, `T = 10`, Standard, `c = 0.03`
- **THEN** `offered_odds = 1.88 > 1.0`
- **AND** `P_touch ≈ 0.5 > c`
- **AND** the setting passes

#### Scenario: Truncation-degenerate payout rejected at placement

- **WHEN** a stake and `offered_odds` combination produces `potential_payout ≤ buy_price` after round-DOWN
- **THEN** the placement is rejected with HTTP 422 `contract_buy_validation_error`

#### Scenario: Vanishing P_fair rejected

- **WHEN** a proposed offset yields `P_touch ≈ 0` so `P_fair < 1e-6`
- **THEN** the setting or placement is rejected before quoting odds

### Requirement: Config Validation Gates

A pricing configuration (instrument σ, commission, allowed durations and distance factors) MUST pass both of the following gates before it is published for play.

**Gate 1 — Grid-versus-Monte-Carlo agreement.** An independent Monte Carlo simulation MUST reproduce the grid probabilities. Paths use the same discrete GBM recursion as the production path generator (per `barrier-predictor-contract` "Path Generation and Auditability"), classifying each path as upper-first, lower-first, or no-touch.

- `N_sim ≥ 200,000` paths.
- Pass criterion: `|P_grid − P̂_MC| < 3 × SE(P̂_MC)` for `P_upper`, `P_lower`, and `P_notouch` (and thus for `P_touch` and `P_fair`).
- Seeds MUST be recorded so a validation run is reproducible.

**Gate 2 — Expected-value discipline.** For every offered `(T, distance_factor)` pair, `EV ≈ −c` within a tolerance of `0.01` (absolute), and `EV < 0`.

A config failing either gate MUST NOT be published.

#### Scenario: Default V_100 passes the agreement gate

- **WHEN** the default Standard calibration at `T = 10` is validated against 200,000 Monte Carlo paths
- **THEN** each of `P_upper`, `P_lower`, and `P_notouch` falls within `3 × SE` of the grid values
- **AND** the empirical EV is approximately `−0.03`

#### Scenario: Grid defect caught by the agreement gate

- **WHEN** a grid implementation silently switches to the maturity-window CDF for `T = 10` and its `P_notouch` disagrees with Monte Carlo by more than `3 × SE`
- **THEN** Gate 1 fails and the config is not published

#### Scenario: Positive-EV configuration rejected by Gate 2

- **WHEN** a config accidentally uses the superseded `(1/P_fair)×(1−c)` multiplier at `P_fair = 0.25`
- **THEN** EV is approximately `+0.47` and Gate 2 fails

### Requirement: Live Position Value

The backend MUST compute an indicative live value for any `OPEN` contract as the reveal progresses, for use in the mark-to-market carried by `CONTRACT_UPDATE` (see `barrier-predictor-api` "Server-to-Client WebSocket Envelopes").

Given the currently revealed price `S_t`, remaining ticks `T_rem = T − t`, and the locked barriers, the estimator returns `pWin` (probability the selected barrier is touched first in the remaining window), `pLose`, and `pRefund` (no-touch through maturity). Deterministic short-circuits apply first:

| Revealed state | Result |
|---|---|
| `S_t ≥ U` | upper already touched — settle path owns the outcome; live value equals terminal payout for that outcome |
| `S_t ≤ L` | lower already touched — same |
| interior, `T_rem = 0` | should not occur for OPEN; treat as refund |

Otherwise the estimator MAY use a forward discrete-grid evaluation from the current log-position (re-centred corridor distances to `U` and `L`) or a forward Monte Carlo with a modest path count. Either method MUST match the discrete-monitoring semantics of settlement.

```
contract_current_value = round_down_6dp(
    stake × (pWin × offered_odds + pRefund × 1.0)
)
```

Constraints:

- `contract_current_value` is **indicative** and MUST be labelled as such on any player surface.
- It MUST NOT be persisted on the contract row.
- It MUST NOT be used by the settlement code path.
- **It MUST be computed only from ticks already revealed to the player.** The full path exists on the backend from acceptance; peeking at unrevealed ticks would leak the outcome through the quoted value.
- There is **no cash-out**. `contract_current_value` is informational only; the product exposes no sell path and no `SOLD` status.

#### Scenario: Live value at entry is below stake

- **WHEN** the reveal is at the entry state for an `UPPER` contract with `stake = "100.000000"`, `offered_odds = "1.88"`, `P_fair ≈ 0.25`, `P_notouch ≈ 0.5`
- **THEN** `contract_current_value ≈ "97.000000"` (= `100 × (0.25 × 1.88 + 0.5)`)
- **AND** the value is below the stake, reflecting the house edge

#### Scenario: Live value rises as price approaches the selected barrier

- **WHEN** the revealed price moves toward the selected barrier while remaining inside the corridor
- **THEN** `pWin` increases relative to its value at entry
- **AND** `contract_current_value` increases accordingly

#### Scenario: Estimator cannot see unrevealed ticks

- **WHEN** a live value is computed while the reveal is at tick 3 of a round resolving at tick 9
- **THEN** the estimator's inputs are the revealed price at tick 3 and `T_rem = 7` only
- **AND** the quoted value is statistically indistinguishable from one computed by a party who does not know the remaining path

#### Scenario: Live value never drives settlement

- **WHEN** a contract settles
- **THEN** the outcome and `sell_price` are determined by first-to-touch resolution and the locked `potential_payout`
- **AND** no `contract_current_value` quote influences either

### Requirement: Settlement Payout Computation

The backend MUST resolve the contract's `sell_price` column at settlement from the contract's status:

- WON → `sell_price = potential_payout` (the value locked at placement). Settlement-time clipping MUST NOT be applied; the per-contract max-payout cap is enforced at placement per `barrier-predictor-risk` "Per-Contract Max Payout".
- REFUNDED → `sell_price = buy_price` (= stake; full restoration). This applies identically to `no_touch` and `operator_refund`.
- LOST → `sell_price = "0.000000"`.

The corresponding ledger row carries the same amount: WIN_CREDIT = `potential_payout`, REFUND = `buy_price` (= stake), no row for LOST.

Arithmetic MUST go through a decimal-safe library; `float64` arithmetic on money is forbidden.

#### Scenario: Win sell_price equals locked potential_payout

- **WHEN** a contract with `potential_payout = "188.000000"` settles WON
- **THEN** the contract row's `sell_price = "188.000000"`
- **AND** the WIN_CREDIT ledger row has `amount = +188.000000`

#### Scenario: Binary floating point MUST NOT be used for the payout product

- **WHEN** `potential_payout` is computed for `stake = "10.000000"` and `offered_odds = "1.88"`
- **THEN** the result is exactly `"18.800000"` under decimal arithmetic
- **AND** an implementation MUST NOT rely on IEEE-754 binary floating point for this product

#### Scenario: No-touch refund restores the stake

- **WHEN** a contract with `buy_price = "50.000000"` settles REFUNDED with `settle_reason = "no_touch"`
- **THEN** `sell_price = "50.000000"` and the REFUND ledger row has `amount = +50.000000`
- **AND** the player's net profit and loss is `0.000000`

#### Scenario: Loss pays nothing

- **WHEN** a contract settles LOST
- **THEN** `sell_price = "0.000000"`
- **AND** no credit ledger row is written; the stake debited at placement remains with the house

### Requirement: Recorded Pricing Inputs

Every contract row MUST persist enough pricing inputs in the `locked_pricing` JSONB column to allow an audit to re-derive the offered odds and the payout without consulting live configuration:

- Pricing engine identifier (`discrete-first-passage-grid`).
- The `config_version` / instrument settings version the contract was priced under.
- Locked inputs: `instrument`, `volatility` (σ), `tick_duration` (T), `barrier_offset` (d), `distance_factor`, `commission_rate` (c), `entry_spot`, `upper_barrier`, `lower_barrier`.
- Derived: `offset_sigma`, `dt_years`, `P_notouch`, `P_touch`, `P_fair`, `raw_mult`, `offered_odds`.
- Grid parameters in force: `GRID_CELLS` (200), bisection settings if relevant.
- `potential_payout` (also stored as a top-level column; duplicated here for self-contained audit).

`locked_pricing` is admin-only data. It MUST NOT be exposed on player-facing endpoints (per `barrier-predictor-database` "contracts Table"). It MUST NOT contain the path seed, which is a separate admin-only column per `barrier-predictor-contract` "Path Generation and Auditability".

#### Scenario: Audit re-derives the offered odds

- **WHEN** an auditor reads the persisted `locked_pricing` for a settled contract
- **THEN** the auditor recomputes `raw_mult = (P_touch − c) / P_fair` and `offered_odds = max(1.01, round_half_up_2dp(raw_mult))`
- **AND** the recomputed value matches the persisted `offered_odds`

#### Scenario: Audit re-derives the payout

- **WHEN** an auditor reads `locked_pricing` together with the row's `buy_price`
- **THEN** the auditor recomputes `potential_payout` as `round_down_6dp(buy_price × offered_odds)`
- **AND** the recomputed value matches the persisted `potential_payout`

#### Scenario: locked_pricing not exposed on player endpoints

- **WHEN** a player reads `/api/barrier-predictor/contracts/{id}` for one of their own contracts
- **THEN** the response object does NOT include a `locked_pricing` field
- **AND** the player cannot reconstruct the pricing maths from the trimmed response

#### Scenario: Seed is not part of locked_pricing

- **WHEN** an operator reads a contract's `locked_pricing`
- **THEN** the path seed is not among its fields
- **AND** the seed is read from its own admin-only column
