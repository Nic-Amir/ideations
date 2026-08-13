# barrier-touch-pricing Specification

## Purpose

Defines how Barrier Touch contracts are priced for both `count` and
`sequence` modes. Covers the state-augmented discrete grids that produce
exclusive-outcome probabilities, the commission model
`offered_odds = (1 − c) / p` with `c = 0.03`, sequence offset
calibration to ~25% completion per direction, Monte Carlo validation
gates, settlement payout computation, and `locked_pricing` audit inputs.

This product MUST NOT use `barrier-predictor-pricing`'s refund-aware
formula `(P_touch − c) / P_fair`. Barrier Touch has no no-touch refund:
every count round has exactly one winning bucket, and an incomplete
sequence is a loss. The simple exclusive-outcome multiplier keeps
per-pick EV ≈ `−c`.

## Requirements
### Requirement: Count Probability Engine

Count-mode probabilities SHALL be computed by a **state-augmented 1D transition-density grid** over `(side ∈ {below, above}, count ∈ {0..3}) × log-price cell`, with `COUNT_GRID_CELLS = 400` (even, so the entry line sits on a cell edge). Domain width scales as `R = 6 √T` in per-tick-σ units. Per-tick mean `μ_σ = −½ σ √dt`. Transitions use an exact Gaussian kernel via the standard Normal CDF.

A crossing flips side and increments count (saturated at 3). Tick 1 establishes side without counting a crossing. Output is `probabilities[4]` for buckets 0/1/2/3+ with `sum = 1`. Monte Carlo MUST NOT price.

#### Scenario: Count probabilities sum to one

- **WHEN** count pricing runs for `T ∈ {10, 15, 20}` on V_100
- **THEN** the four bucket probabilities sum to `1` within numerical tolerance

#### Scenario: Longer T shifts mass to 3+

- **WHEN** count probs at `T = 10` and `T = 20` are compared
- **THEN** `P(3+)` is higher at `T = 20` and `P(0)` is lower

#### Scenario: Worked count mults at T = 15

- **WHEN** count pricing runs for `T = 15`, `c = 0.03`
- **THEN** approximate probabilities are `[0.289, 0.229, 0.185, 0.297]`
- **AND** offered multipliers are `[3.35, 4.24, 5.23, 3.27]`

#### Scenario: Worked count mults at T = 10

- **WHEN** count pricing runs for `T = 10`, `c = 0.03`
- **THEN** offered multipliers are approximately `[2.75, 3.68, 5.10, 5.01]`

### Requirement: Sequence Probability Engine

Sequence completion probabilities SHALL be computed by a **stage-augmented grid**: virgin corridor density plus densities after Upper-first and after Lower-first; barrier cells absorb into the next stage or into completion. Barriers at `±offsetSigma` per-tick σ from entry. Grid step chosen so barriers sit on cell edges (`h` divides `offsetSigma`).

Outputs: `P(upper_lower)` and `P(lower_upper)`. Residual mass (never completing either trip) is incompletes — priced as losses for both picks, not as a refund outcome.

Monte Carlo MUST NOT price.

#### Scenario: Sides nearly symmetric

- **WHEN** Standard sequence pricing runs for `T = 15`
- **THEN** `|P(upper_lower) − P(lower_upper)| < 0.005`

#### Scenario: Residual mass is incompletes

- **WHEN** `P(upper_lower) + P(lower_upper) ≈ 0.50` at Standard calibration
- **THEN** the residual ≈ 0.50 is incomplete / non-completion probability
- **AND** that residual is NOT paid as a refund on either pick

### Requirement: Default Sequence Offset Calibration

Standard `offsetSigma` is found by bisection so `P(complete one direction) ≈ SEQUENCE_TARGET_P = 0.25` (hence multiplier ≈ `0.97/0.25 = 3.88` at 3% margin). Distance factors Near `0.75` / Standard `1.0` / Far `1.4` scale the calibrated offset. `offsetLog = offsetSigma × σ √dt`.

Calibration may use a coarser grid step than live pricing; Standard live `P` MUST fall near 0.25 (acceptance band approximately `[0.23, 0.27]` as in prototype tests).

#### Scenario: Standard T = 15 → ~3.88×

- **WHEN** sequence pricing runs for `T = 15`, Standard factor, `c = 0.03`
- **THEN** `P(upper_lower) ≈ 0.25` and offered odds ≈ `3.88`

#### Scenario: Near raises completion probability

- **WHEN** Near vs Standard at the same `T`
- **THEN** Near `P(complete)` is higher and offered odds are lower (richer chance, leaner payout than Far)

#### Scenario: Far lowers completion probability

- **WHEN** Far vs Standard at the same `T`
- **THEN** Far `P(complete)` is lower and offered odds are higher

### Requirement: Commission Model

For any exclusive pick with win probability `p` and commission `c = 0.03`:

```
offered_odds     = max(1.01, round_half_up_2dp((1 − c) / p))
potential_payout = round_down_6dp(stake × offered_odds)
buy_price        = stake
```

Per-pick EV before rounding:

```
EV = p × ((1 − c) / p) − 1 = −c
```

After 2-dp rounding, EV remains approximately `−c`.

**Forbidden:** the predictor refund-aware formula `(P_touch − c) / (P_touch / 2)` MUST NOT be used for Barrier Touch.

Count mode applies the formula to each of the four bucket probabilities. Sequence mode applies it to `P(upper_lower)` and `P(lower_upper)` separately.

#### Scenario: Count EV ≈ −3%

- **WHEN** EV is computed as `p_bucket × mult_bucket − 1` for each bucket at `T = 15`
- **THEN** each EV is within 0.01 of `−0.03`

#### Scenario: Sequence EV ≈ −3%

- **WHEN** EV is computed for Standard `upper_lower` at `T = 15` with mult `3.88`
- **THEN** `EV ≈ 0.25 × 3.88 − 1 = −0.03`

#### Scenario: Predictor formula rejected

- **WHEN** an implementer ports `(P_touch − c) / P_fair` into Barrier Touch
- **THEN** that implementation violates this requirement

#### Scenario: Odds before multiplication

- **WHEN** `offered_odds = "3.88"` and `stake = "100.000000"`
- **THEN** `potential_payout = "388.000000"` under decimal arithmetic

#### Scenario: Round-DOWN discipline

- **WHEN** `stake = "1.111111"` and `offered_odds = "3.88"`
- **THEN** `potential_payout` truncates at 6 dp (never rounds up)

### Requirement: Probability Computation Timing

Probabilities and odds are a pure function of `(mode, σ, T, distance_factor or d, c)`. Cache by that key; lock onto the contract at `start_time`. Admin changes MUST NOT re-price OPEN contracts.

#### Scenario: Identical inputs price identically

- **WHEN** two count placements with `T = 15` on the same settings an hour apart
- **THEN** both receive the same bucket probabilities and multipliers

### Requirement: Config Validation Gates

Before publishing a settings set:

**Gate 1 — Grid vs MC.** Independent Monte Carlo using the production path generator:

- Count: `N_sim ≥ 200,000` at representative `T` (e.g. 15); `|grid − MC| < 3 × SE` per bucket.
- Sequence: `N_sim ≥ 150,000`; same 3σ gate on each completion probability.

**Gate 2 — EV discipline.** Every offered pick has `EV ≈ −c` within 0.01 and `EV < 0`.

#### Scenario: Count MC gate

- **WHEN** count grid at `T = 15` is checked against 200k MC paths
- **THEN** each bucket probability falls within `3 × SE` of MC

#### Scenario: Sequence MC gate

- **WHEN** Standard sequence at `T = 15` is checked against 150k MC paths
- **THEN** each completion probability falls within `3 × SE` of MC

### Requirement: Offered-Odds Viability

Require `p > 0`, `offered_odds > 1.0`, and `potential_payout > buy_price` at placement. Degenerate near-zero `p` rejected rather than quoting astronomical odds (clamp / reject per `barrier-touch-risk`).

#### Scenario: Degenerate p rejected

- **WHEN** a proposed offset yields `p < 1e-6` for a pick
- **THEN** the setting or placement is rejected before quoting

### Requirement: Settlement Payout Computation

- WON → `sell_price = potential_payout`
- LOST → `sell_price = "0.000000"`
- REFUNDED (`operator_refund`) → `sell_price = buy_price`

Decimal-safe only.

#### Scenario: Sequence win pays locked odds

- **WHEN** a sequence contract with `stake = "100.000000"` and `offered_odds = "3.88"` settles WON
- **THEN** `sell_price = "388.000000"`

#### Scenario: Incomplete sequence pays nothing

- **WHEN** a sequence contract settles LOST due to incompleteness
- **THEN** `sell_price = "0.000000"`

#### Scenario: Count wrong bucket pays nothing

- **WHEN** a count contract settles LOST
- **THEN** `sell_price = "0.000000"`

### Requirement: Recorded Pricing Inputs

`locked_pricing` (admin-only) MUST include:

- Engine id: `discrete-count-grid` or `discrete-sequence-stage-grid`
- `mode`, selection, `σ`, `T`, `c`, `dt_years`, `entry_spot`
- Count: four probabilities and four multipliers; `COUNT_GRID_CELLS`
- Sequence: `offsetSigma`, `offsetLog`, `distance_factor`, both completion probs and mults; calibration target `0.25`
- `potential_payout`, `config_version`

MUST NOT include the path seed. MUST NOT appear on player endpoints.

#### Scenario: Audit re-derives count odds

- **WHEN** an auditor reads count `locked_pricing`
- **THEN** they recompute `offered_odds = max(1.01, round_half_up_2dp((1−c)/p_bucket))` for the selected bucket
- **AND** it matches the persisted odds

#### Scenario: Audit re-derives sequence odds

- **WHEN** an auditor reads sequence `locked_pricing`
- **THEN** they recompute odds from the stored completion probability and `c`
- **AND** it matches the persisted odds

#### Scenario: locked_pricing hidden from players

- **WHEN** a player GETs their contract
- **THEN** `locked_pricing` is omitted
