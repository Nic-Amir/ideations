# barrier-race-pricing Specification

## Purpose

Defines how Barrier Race contracts are priced and how their live
mark-to-market value is computed while open. Covers the numerical grid
engine that produces the four first-passage probabilities, the
commission model (a house edge added to each implied probability,
producing an overround), the config-publish validation gates, and the
pricing inputs persisted on every contract for audit replay.

Barrier Race pricing differs structurally from `rise-fall-pricing` in
two ways. First, there is no closed-form probability: the discrete-time,
two-asset, correlated, first-to-touch problem has no known analytical
solution, so probabilities come from a numerical grid rather than a
Normal CDF evaluation. Second, there is no time-to-maturity anchor,
because the player chooses no duration — the probabilities are a pure
function of the race configuration, so they are computed once per config
version rather than once per placement. Lifecycle, selection, and
first-to-touch semantics are delegated to `barrier-race-contract`; money
movement to `barrier-race-settlement`.

## Requirements
### Requirement: Win Probability Engine

The four first-passage probabilities SHALL be computed by **recursive propagation of the joint probability density on a 2D grid in log-price space**. This numerical grid method is the sole pricing engine. Monte Carlo simulation MUST NOT be used to price; it is used only for verification (see "Config Validation Gates").

The engine computes, for a given race configuration:

| Outcome | Definition | Symbol |
|---|---|---|
| Asset 1 (DRIFT) wins | `τ₁ < τ₂` | `P₁` |
| Asset 2 (VOL) wins | `τ₂ < τ₁` | `P₂` |
| Tie | `τ₁ = τ₂ < ∞` | `P_tie` |
| Timeout | `τ₁ = τ₂ = ∞` | `P_∅` |

By construction `P₁ + P₂ + P_tie + P_∅ = 1`. The invariant holds on the engine's **unrounded** outputs; probabilities quoted to 4 decimal places elsewhere in this specification are display roundings and need not sum to exactly `1.0000`. Hitting times `τ_i` are the discrete first-passage times defined in `barrier-race-contract` "First-to-Touch Resolution".

**Status of the probability figures in this specification.** Every numeric probability quoted here — including the illustrative configuration's `0.6369` / `0.3535` / `0.0097` — is a **non-normative reference value**, not a spec constant. The engine's own output for a given `config_version` is the sole authority (per "Probability Computation Timing"). Reference values serve two purposes only: to let an implementer sanity-check a new engine build, and to make the worked examples in "Commission Model" concrete.

This distinction is load-bearing because **no implementation of this engine exists in the repository yet.** The legacy reference `specs/products/barrier_race/product_spec.md` §5 attributes these figures to scripts (`discrete_barrier_race.py`, `validate_pricing.py`) that are not present, so the figures are currently unreproducible and carry a visible rounding inconsistency (they sum to `1.0001`). An implementation MUST therefore treat them as expectations to be confirmed, not as values to hard-code:

- A first engine build SHOULD reproduce each reference value to within the Monte Carlo agreement tolerance in "Config Validation Gates". A material disagreement means either the build or the reference figure is wrong, and MUST be investigated before publishing the config.
- Probabilities MUST NOT be hard-coded as constants in production pricing. They are computed by the engine and cached per `config_version`.
- Once an engine build passes both gates in "Config Validation Gates", its output supersedes the reference figures quoted here, and this specification's examples SHOULD be refreshed from that build at full precision.

**Log-space setup.** From the locked config, derive:

```
drift_i = (μ_i − ½σ_i²) × Δt        # adjusted drift per tick
vol_i   = σ_i × √Δt                  # per-tick standard deviation
x_i,0   = ln(S_i,0)                  # initial log-price
log_B   = ln(H)                      # log-barrier
```

**Grid construction.** The grid covers the surviving region `Ω = {(x₁, x₂) : x₁ < log_B and x₂ < log_B}`. Cell size is bounded by the resolution requirement `dx_i_max = vol_i / min_cells_per_std`. The range extends `n_std` total standard deviations below the starting point, accounting for total drift:

```
total_std_i   = vol_i × √T
total_drift_i = drift_i × T
x_i_min_ideal = min(x_i,0, x_i,0 + total_drift_i) − n_std × total_std_i
x_i_max       = log_B
range_i       = x_i_max − x_i_min_ideal
n_i           = max(n_grid, ceil(range_i / dx_i_max))
```

If `n_i` exceeds `max_grid`, it is capped at `max_grid` and the range is reduced to `n_i × dx_i_max`. Final cell size is `dx_i = range_i / n_i`.

**Transition kernel.** The kernel is the bivariate normal PDF of the joint one-step log-return increment, discretized on the grid:

```
K(Δx₁, Δx₂) = (1 / (2π × vol₁ × vol₂ × √(1−ρ²))) × exp(−Q / (2(1−ρ²)))

Q = (Δx₁ − drift₁)²/vol₁²
    − 2ρ(Δx₁ − drift₁)(Δx₂ − drift₂)/(vol₁ × vol₂)
    + (Δx₂ − drift₂)²/vol₂²
```

The kernel extends `±ceil(n_std × vol_i / dx_i) + 1` cells in each dimension. It MUST be multiplied by `dx₁ × dx₂` to convert PDF to probability mass, then divided by its own sum so it sums to exactly 1.0. This normalisation is mandatory: without it, numerical drift accumulates over thousands of propagation steps.

**Extended grid and masks.** The working grid is extended beyond the barrier by `n_extra = max(kernel_half₁, kernel_half₂) + 5` cells to capture mass that overshoots the barrier during convolution, giving `n_tot_i = n_i + n_extra`. Four masks classify each cell:

- `only1_mask` — `x₁ ≥ log_B` AND `x₂ < log_B` (only Asset 1 crossed)
- `only2_mask` — `x₂ ≥ log_B` AND `x₁ < log_B` (only Asset 2 crossed)
- `both_mask` — `x₁ ≥ log_B` AND `x₂ ≥ log_B` (tie)
- `absorbed_mask` — `x₁ ≥ log_B` OR `x₂ ≥ log_B` (any crossing)

**Initial condition.** Unit mass is placed at `(x₁,₀, x₂,₀)` by bilinear interpolation across the four nearest cells, weighted by the fractional grid position in each dimension. Snapping to the nearest cell MUST NOT be used, as it biases the effective log-distance to the barrier.

**Time-stepping loop.** For each tick `t = 1 … T_max`:

1. **Propagate** the mass by 2D convolution with the kernel, extracting the valid window offset by the kernel half-widths.
2. **Clip negatives** to zero, removing round-off artefacts introduced by FFT-based convolution.
3. **Track leaked mass** — mass falling outside the extraction window has drifted off-grid away from the barrier and is accumulated into `p_leaked`.
4. **Absorb at the barrier** — accumulate `P₁ += sum(mass[only1_mask])`, `P₂ += sum(mass[only2_mask])`, `P_tie += sum(mass[both_mask])`.
5. **Zero the absorbed region** so absorbed mass cannot be double-counted on a later tick.
6. **Early stop** when the remaining un-absorbed mass falls below `ε`.

On termination, `P_∅ = remaining_mass + p_leaked`.

Absorption before zeroing, in that order, is what makes the result a genuine first-passage probability rather than a terminal-distribution probability.

#### Scenario: Reference probabilities are not spec constants

- **WHEN** an implementer builds the grid engine and its output for the illustrative configuration differs from the reference figures in the fourth decimal place
- **THEN** the engine output is authoritative for pricing, provided it passes both gates in "Config Validation Gates"
- **AND** the discrepancy is investigated and this specification's reference figures are refreshed from the passing build

#### Scenario: Probabilities never hard-coded

- **WHEN** a production pricing path needs `P₁` for a config
- **THEN** the value is read from the cache populated by the engine for that `config_version`
- **AND** no literal probability constant appears in the pricing code path

#### Scenario: Illustrative configuration probabilities

- **WHEN** the engine prices the illustrative configuration (`S₁,₀ = S₂,₀ = 100`, `H = 102`, `μ₁ = 0.002`, `μ₂ = 0.0007`, `σ₁ = 0.004`, `σ₂ = 0.006`, `ρ = −0.5`, `Δt = 1.0`, `T_max = 3000`)
- **THEN** the output is expected to approximate the reference values `P₁ ≈ 0.6369`, `P₂ ≈ 0.3535`, `P_tie ≈ 0.0097`, `P_∅ ≈ 0` (non-normative; see "Status of the probability figures" above)
- **AND** the engine's unrounded outputs sum to `1`, whereas the 4-dp reference values above sum to `1.0001` — a rounding artefact inherited from the legacy reference document, not a property the engine may exhibit

#### Scenario: Derived per-tick constants

- **WHEN** the engine derives log-space constants for the illustrative configuration
- **THEN** `drift₁ = 0.001992` (= `0.002 − 0.5 × 0.004²`) and `drift₂ = 0.000682` (= `0.0007 − 0.5 × 0.006²`)
- **AND** `vol₁ = 0.004` and `vol₂ = 0.006`
- **AND** `x₁,₀ = x₂,₀ = 4.60517` (= `ln(100)`) and `log_B = 4.62497` (= `ln(102)`)

#### Scenario: Log-distance to the barrier

- **WHEN** the log-distance `d = ln(H / S₀)` and the distance in per-tick standard deviations `d / vol_i` are derived for the illustrative configuration
- **THEN** `d = 0.01980` for both assets
- **AND** `d / vol₁ = 4.95` standard deviations for DRIFT and `d / vol₂ = 3.30` for VOL
- **AND** the asymmetry expresses the product's core tension: DRIFT is farther in standard deviations but has stronger drift pulling it to the barrier

#### Scenario: Early stop when all mass is classified

- **WHEN** the engine prices the illustrative configuration with `T_max = 3000`
- **THEN** the loop terminates early once remaining mass falls below `ε`, well before tick 3000
- **AND** the resulting `P_∅ ≈ 0` confirms that virtually every race resolves before the timeout bound

#### Scenario: Monte Carlo MUST NOT price

- **WHEN** offered odds are computed for a config
- **THEN** the probabilities used are the grid-engine outputs
- **AND** no Monte Carlo estimate is substituted, even when a validation run is available

### Requirement: Grid Method Parameters

The grid engine MUST use the following parameters. They are engine constants, not per-config operator settings, because they govern numerical accuracy rather than product behaviour.

| Parameter | Symbol | Value | Purpose |
|---|---|---|---|
| Min grid points | `n_grid` | 300 | Minimum resolution per dimension |
| Max grid points | `max_grid` | 800 | Memory cap per dimension |
| Std devs for range | `n_std` | 5.0 | Grid extent and kernel truncation |
| Min cells per std | `min_cells_per_std` | 4.0 | Resolution guarantee |
| Early stop threshold | `ε` | 1e-12 | Convergence criterion |
| Reference time step | `Δt` | 1.0 | One tick equals one second in the reference configuration |

The grid MUST guarantee at least `min_cells_per_std` cells per one-step standard deviation in each dimension. A configuration whose required resolution cannot be met within `max_grid` MUST be reported as a numerical-accuracy failure at config-publish time rather than priced at reduced resolution.

Changing any of these parameters changes computed probabilities and therefore offered odds. A change MUST be treated as a re-pricing event: every published config must be re-run through "Config Validation Gates" and assigned a new `config_version` before play resumes.

#### Scenario: Cell sizes from the resolution requirement

- **WHEN** cell-size bounds are derived for the illustrative configuration
- **THEN** `dx₁_max = 0.001` (= `0.004 / 4.0`) and `dx₂_max = 0.0015` (= `0.006 / 4.0`)
- **AND** each dimension carries at least 4 cells per one-step standard deviation

#### Scenario: Resolution unattainable within the memory cap

- **WHEN** a configuration requires more than `max_grid = 800` cells per dimension to satisfy the 4-cells-per-standard-deviation guarantee
- **THEN** the config is rejected at publish time as a numerical-accuracy failure
- **AND** it is NOT priced at degraded resolution

#### Scenario: Engine parameter change forces re-validation

- **WHEN** `min_cells_per_std` is raised from 4.0 to 8.0
- **THEN** every published config is re-priced and re-run through "Config Validation Gates"
- **AND** each is assigned a new `config_version` before play resumes under the new odds

### Requirement: Probability Computation Timing

The four probabilities are a **pure function of the race configuration**. They MUST be computed once per `config_version` — at config-publish time — cached against that version, and read from cache at placement. They MUST NOT be recomputed per placement.

This replaces the `rise-fall-pricing` "Time-to-Maturity Anchor" requirement. Barrier Race has no `τ` anchor and no player-chosen duration, so nothing about a placement's timing enters the probability calculation. Two placements on the same `config_version` receive identical probabilities and identical offered odds regardless of when they were made.

At `start_time` the backend locks the config, its `config_version`, the four probabilities, and the derived odds onto the contract (per `barrier-race-contract` "Race Parameter Locking" and "Recorded Pricing Inputs" below). A later config change MUST NOT re-price an existing contract.

The grid computation is expensive — thousands of FFT convolutions over an up-to-800×800 grid — which is precisely why it is a publish-time rather than request-time operation. Placement pricing is a cache read plus decimal arithmetic, so `/preview` and `/buy` stay fast.

#### Scenario: Probabilities cached per config version

- **WHEN** a config is published
- **THEN** `P₁`, `P₂`, `P_tie`, and `P_∅` are computed once and cached against its `config_version`
- **AND** every subsequent placement on that version reads the cached values without re-running the grid

#### Scenario: Two placements on the same version price identically

- **WHEN** two placements select `DRIFT` on the same `config_version` an hour apart
- **THEN** both receive the same `P₁` and the same `offered_odds`
- **AND** neither placement's timing enters the probability calculation

#### Scenario: Config change does not re-price an open contract

- **WHEN** an admin publishes a new `config_version` changing `sigma_vol` from `0.006` to `0.008` while a contract is `OPEN`
- **THEN** the `OPEN` contract retains its locked probabilities, `offered_odds`, and `potential_payout`
- **AND** any new placement is priced against the new version's freshly computed probabilities

### Requirement: Commission Model

The product SHALL charge commission by **adding the commission rate to each outcome's implied probability**, producing an overround. This is the barrier-race commission model and differs from the additive-on-payout model in `rise-fall-pricing`: here the edge is embedded in the quoted odds rather than subtracted from a gross payout.

For a race configuration with commission rate `c`:

```
fair_odds_i     = 1 / P_i
offered_odds_i  = round_half_up_2dp(1 / (P_i + c))
potential_payout = round_down_6dp(stake × offered_odds_i)
buy_price        = stake                                  (verbatim; debited at buy)
buy_commission   = round_down_6dp(stake × (fair_odds_i − offered_odds_i))
                                                          (audit / disclosure; NOT
                                                           a separate ledger row)
```

Properties:

- **`offered_odds_i` is the authoritative quote.** Unlike `rise-fall-pricing`, where the displayed multiplier is a display-only derivation of an authoritative payout, here the 2-decimal offered odds are the number quoted to the player and the number payout is derived from. The 2-dp rounding happens **before** multiplication by stake, so `potential_payout` is always exactly `stake × the odds the player saw`.
- **Round half-up on odds, round DOWN on money.** `offered_odds_i` rounds half-up to 2 dp because it is a quoted rate. `potential_payout` and `buy_commission` round DOWN to 6 dp (`decimal.Truncate(6)`), never half-up. The house never overpays.
- **`buy_commission` is disclosure only.** It measures the payout the player forgoes relative to fair odds, at their chosen stake. It is NOT deducted as a separate ledger row and NOT subtracted from `potential_payout` — the edge is already inside `offered_odds_i`.
- **Payout viability.** If `potential_payout ≤ stake`, the placement MUST be rejected (see "Offered-Odds Viability").
- The PLAY_DEBIT ledger row's amount is `−stake` (= `−buy_price`).
- The WIN_CREDIT ledger row's amount is `+potential_payout` (the value locked at placement).
- The REFUND ledger row's amount is `+stake` (= `+buy_price`), for every refund reason (`tie`, `timeout`, `operator_refund`).

Under this model the player commits the stake they typed and, on WON, receives `stake × offered_odds`. On LOST they lose the stake. On a `tie` or `timeout` refund they get the stake back — a `1.0x` return, which is why both refund outcomes appear as positive terms in the expected-value calculation below.

Arithmetic MUST go through a decimal-safe library (`shopspring/decimal` in Go, Postgres `NUMERIC` in SQL); `float64` arithmetic on money is forbidden.

#### Scenario: Worked example, DRIFT, stake 10.00

- **WHEN** a contract selects `DRIFT` with `P₁ = 0.6369`, `c = 0.03`, and `stake = "10.000000"`
- **THEN** `P₁ + c = 0.6669`
- **AND** `fair_odds = 1.570105` (= `1 / 0.6369`)
- **AND** `offered_odds = "1.50"` (= `round_half_up_2dp(1 / 0.6669)`)
- **AND** `potential_payout = "15.000000"` (= `10.000000 × 1.50`)
- **AND** `buy_commission = "0.701051"` (= `round_down_6dp(10 × (1.570105… − 1.50))`; audit)
- **AND** `buy_price = "10.000000"` (= stake)

#### Scenario: Worked example, VOL, stake 10.00

- **WHEN** a contract selects `VOL` with `P₂ = 0.3535`, `c = 0.03`, and `stake = "10.000000"`
- **THEN** `P₂ + c = 0.3835`
- **AND** `fair_odds = 2.828854` (= `1 / 0.3535`)
- **AND** `offered_odds = "2.61"` (= `round_half_up_2dp(1 / 0.3835)`)
- **AND** `potential_payout = "26.100000"` (= `10.000000 × 2.61`)
- **AND** `buy_commission = "2.188543"` (= `round_down_6dp(10 × (2.828854… − 2.61))`; audit)

#### Scenario: Round-DOWN discipline on payout

- **WHEN** `offered_odds = "2.61"` and `stake = "1.111111"`, so the exact product is `2.89999971`
- **THEN** the persisted `potential_payout` is `"2.899999"` (truncated at 6 dp)
- **AND** it MUST NOT be `"2.900000"`

#### Scenario: Binary floating point MUST NOT be used for the payout product

- **WHEN** `potential_payout` is computed for `stake = "10.000000"` and `offered_odds = "2.61"`
- **THEN** the result is exactly `"26.100000"` under decimal arithmetic
- **AND** it MUST NOT be `"26.099999"`, the value produced by evaluating `10 × 2.61` in IEEE-754 binary floating point (which yields `26.099999999999998`) and then truncating to 6 dp
- **AND** an implementation MUST NOT rely on the fact that other stakes hide the defect (for example `100 × 2.61` is exactly `261` in binary floating point), because the error appears only at particular stake and odds combinations

#### Scenario: Odds rounded before multiplication

- **WHEN** a player is quoted `offered_odds = "1.50"` and stakes `"10.000000"`
- **THEN** `potential_payout = "15.000000"`, exactly `stake × 1.50`
- **AND** the unrounded `1 / 0.6669 = 1.499475…` is NOT used to compute the payout, so the payout always reconciles with the quoted odds

#### Scenario: Commission is not a ledger row

- **WHEN** a contract with `buy_commission = "0.701051"` is placed
- **THEN** the ledger contains exactly one PLAY_DEBIT row with `amount = -10.000000`
- **AND** no ledger row corresponds to `buy_commission`

### Requirement: Overround and Expected Value

The commission model MUST produce an overround strictly greater than 1, guaranteeing a positive expected margin for the house across both selectable outcomes:

```
Overround = (P₁ + c) + (P₂ + c)
```

The player's expected value per unit of stake on selection `i` accounts for the two refund outcomes, which return `1.0x`:

```
EV_i = P_i × offered_odds_i + P_tie × 1.0 + P_∅ × 1.0 − 1.0
```

`EV_i` MUST be negative for both selections under any published config. Because a flat commission `c` is proportionally larger relative to a smaller probability, the house edge is asymmetric: the underdog carries the larger edge. This asymmetry is inherent to the model and is not a defect, but it MUST be visible to operators via the values persisted under "Recorded Pricing Inputs".

A config whose overround is at or below 1, or for which either `EV_i ≥ 0`, MUST be rejected at publish time (see "Offered-Odds Viability").

#### Scenario: Illustrative configuration overround

- **WHEN** the overround is computed for the illustrative configuration with `c = 0.03`
- **THEN** `Overround = 0.6669 + 0.3835 = 1.0504`
- **AND** the house margin across the two selectable outcomes is approximately 5.04%

#### Scenario: Expected value is negative for both selections

- **WHEN** expected value per unit stake is computed for the illustrative configuration
- **THEN** `EV_DRIFT = 0.6369 × 1.50 + 0.0097 − 1.0 = −0.035` (approximately)
- **AND** `EV_VOL = 0.3535 × 2.61 + 0.0097 − 1.0 = −0.068` (approximately)
- **AND** both are negative, confirming the house edge

#### Scenario: House edge asymmetry recorded

- **WHEN** an operator inspects the illustrative configuration's pricing record
- **THEN** the edge on the favourite (`≈ 0.035` per unit stake) and on the underdog (`≈ 0.068` per unit stake) are both readable
- **AND** the asymmetry is attributable to the flat commission applied to unequal probabilities

#### Scenario: Zero-margin config rejected

- **WHEN** an admin attempts to publish a config with `c = 0.0`, giving `Overround = P₁ + P₂ ≤ 1`
- **THEN** the config is rejected at publish time

### Requirement: Probability Clamp

Each win probability MUST be clamped to `[1e-6, 1 − 1e-6]` before use in odds arithmetic. Additionally, the commissioned probability MUST satisfy `P_i + c ≤ 1 − 1e-6`. These guards prevent division by zero or by a negative quantity, and prevent astronomical odds from a degenerate grid result.

The clamped values are the ones persisted in `locked_pricing` (see "Recorded Pricing Inputs"), so an audit reproduces exactly the arithmetic that ran.

A probability that hits the clamp indicates either a misconfigured parameter set or a numerical failure in the grid engine. Such a config will typically also fail "Offered-Odds Viability" and MUST NOT be published. The clamp is a safety net against undefined arithmetic, not a licence to price a degenerate config.

#### Scenario: Normal probabilities pass through unclamped

- **WHEN** the grid returns `P₁ = 0.6369` and `P₂ = 0.3535`
- **THEN** both are within `[1e-6, 1 − 1e-6]` and no clamp is applied
- **AND** the persisted probabilities equal the grid outputs

#### Scenario: Degenerate probability clamps to the floor

- **WHEN** the grid returns `P₂ = 1e-9` for a pathological parameter set
- **THEN** the clamped value `1e-6` is used, giving a finite but extreme `fair_odds`
- **AND** the config fails "Offered-Odds Viability" and is not published

#### Scenario: Commissioned probability at the ceiling rejected

- **WHEN** a config yields `P₁ = 0.98` with `c = 0.03`, so `P₁ + c = 1.01 > 1 − 1e-6`
- **THEN** the config is rejected before publication
- **AND** no odds are quoted from it

### Requirement: Offered-Odds Viability

Pricing MUST verify, for **both** selections, that:

- `P_i + c ≤ 1 − 1e-6` (per "Probability Clamp"),
- `offered_odds_i > 1.0`, and
- `Overround > 1` (per "Overround and Expected Value").

These checks run at **config-publish time** and reject the whole config, because the quantities involved are config-derived and cannot be salvaged by a different stake. A config offering odds at or below `1.0x` would give the player no upside on a win, and one with `P_i + c > 1` would produce non-positive or nonsensical odds.

At **placement time**, pricing MUST additionally verify `potential_payout > buy_price` for the selected asset. A placement failing this is rejected with `contract_buy_validation_error` (HTTP 422), per `barrier-race-risk` "Rejection Reason Precedence". Although a viable config makes this rare, the check is required because `potential_payout` is a round-DOWN of `stake × offered_odds`: at a small enough stake, truncation can pull the payout back to the stake.

#### Scenario: Illustrative configuration is viable

- **WHEN** viability is checked for the illustrative configuration with `c = 0.03`
- **THEN** `offered_odds_DRIFT = 1.50 > 1.0` and `offered_odds_VOL = 2.61 > 1.0`
- **AND** `Overround = 1.0504 > 1`
- **AND** the config passes the viability gate

#### Scenario: Odds at or below 1.0x rejected at publish

- **WHEN** a config yields `P₁ + c ≥ 1.0`, so `offered_odds_DRIFT ≤ 1.00`
- **THEN** the config is rejected at publish time
- **AND** no contract can be placed against it

#### Scenario: Excessive commission rejected at publish

- **WHEN** an admin sets `c = 0.40` on the illustrative configuration, giving `P₁ + c = 1.0369`
- **THEN** the config is rejected at publish time for violating `P_i + c ≤ 1 − 1e-6`

#### Scenario: Truncation-degenerate payout rejected at placement

- **WHEN** a stake and `offered_odds` combination produces `potential_payout ≤ buy_price` after round-DOWN
- **THEN** the placement is rejected with HTTP 422 `contract_buy_validation_error`

### Requirement: Config Validation Gates

A race configuration MUST pass both of the following gates before it is published for play. Both are publish-time gates; neither runs per placement.

**Gate 1 — Grid-versus-Monte-Carlo agreement.** An independent Monte Carlo simulation MUST reproduce the grid probabilities. Paths are simulated with the same discrete recursion the production path generator uses (per `barrier-race-contract` "Race Path Generation and Auditability"), with correlated shocks via Cholesky. Outcomes are classified by comparing hitting times, and the standard error of each estimate is `SE(P̂_i) = √(P̂_i × (1 − P̂_i) / N_sim)`.

- `N_sim ≥ 500,000` paths.
- Pass criterion: `|P_grid − P̂_MC| < 3 × SE(P̂_MC)` for each of `P₁`, `P₂`, `P_tie`, `P_∅`.
- Seeds MUST be recorded so a validation run is reproducible.

At `N_sim = 500,000` and `P ≈ 0.64`, `SE ≈ 0.00068`, giving better than 0.1% absolute precision — tight enough for the gate to catch a genuine grid defect rather than sampling noise.

**Gate 2 — Race duration.** The hitting-time distribution from the same Monte Carlo run MUST satisfy:

- Median race duration in `[5, 60]` seconds (target range 5–15 seconds).
- 99th percentile no greater than 5 minutes.
- Timeout probability `P_∅ < 0.1%`, so virtually every race resolves before `T_max`.

Gate 2 exists because race duration is an outcome of the parameters rather than a player input: a mathematically sound config can still be unplayable if races drag. When a config fails Gate 2, the levers are to increase drift, increase volatility, move the barrier closer to the start price, or make `ρ` more negative.

A config failing either gate MUST NOT be published. Passing both is necessary in addition to the structural bounds in `barrier-race-contract` "Race Configuration Bounds" and the viability checks above.

#### Scenario: Illustrative configuration passes the agreement gate

- **WHEN** the illustrative configuration is validated against 500,000 Monte Carlo paths
- **THEN** the Monte Carlo estimates (`≈ 0.6365`, `≈ 0.3538`, `≈ 0.0099`, `≈ 0`) each fall within `3 × SE` of the grid values (`0.6369`, `0.3535`, `0.0097`, `≈ 0`)
- **AND** the config passes Gate 1

#### Scenario: Illustrative configuration passes the duration gate

- **WHEN** the hitting-time distribution for the illustrative configuration is measured over 500,000 paths
- **THEN** the median race duration is 7 seconds and the mean is 8.10 seconds
- **AND** the maximum observed duration is 54 seconds, so the 99th percentile is far below 5 minutes
- **AND** `P_∅ ≈ 0`, below the 0.1% ceiling
- **AND** the config passes Gate 2

#### Scenario: Grid defect caught by the agreement gate

- **WHEN** a grid implementation omits the kernel normalisation step and its `P₁` drifts to `0.6600` against a Monte Carlo estimate of `0.6365`
- **THEN** the deviation exceeds `3 × SE ≈ 0.002` and Gate 1 fails
- **AND** the config is not published

#### Scenario: Slow configuration rejected

- **WHEN** a proposed config produces a median race duration of 180 seconds
- **THEN** Gate 2 fails and the config is not published, even if Gate 1 passed

#### Scenario: Non-negligible timeout probability rejected

- **WHEN** a proposed config produces `P_∅ = 0.4%`
- **THEN** Gate 2 fails, because too many players would receive a bare stake refund after waiting out `T_max`

### Requirement: Live Position Value

The backend MUST compute an indicative live value for any `OPEN` contract as the reveal progresses, for use in the mark-to-market carried by `CONTRACT_UPDATE` (see `barrier-race-api` "Server-to-Client WebSocket Envelopes"). Because there is no closed form for the remaining first-passage problem, the estimate uses **forward Monte Carlo from the currently-revealed state**.

Given the revealed log-prices `(x₁, x₂)` at the current reveal position, the estimator returns `pWin1`, `pWin2`, and `pRefund`, where `pRefund` pools ties and horizon exhaustion because both settle at `1.0x`. Deterministic short-circuits apply first:

| Revealed state | `pWin1` | `pWin2` | `pRefund` |
|---|---|---|---|
| `x₁ ≥ log_B` and `x₂ ≥ log_B` | 0 | 0 | 1 |
| `x₁ ≥ log_B` only | 1 | 0 | 0 |
| `x₂ ≥ log_B` only | 0 | 1 | 0 |
| neither at the barrier | forward MC | forward MC | forward MC |

Otherwise the estimator simulates forward paths using the contract's locked `drift_i`, `vol_i`, and `ρ`, classifying the first tick at which either path crosses `log_B`, with unresolved paths counted into `pRefund`. Estimator settings: `LIVE_MC_PATHS = 8000` and `LIVE_MC_HORIZON = 300` ticks.

The mark-to-market for the contract's selection is:

```
contract_current_value = round_down_6dp(
    stake × (pWin_selected × offered_odds + pRefund × 1.0)
)
```

Constraints:

- `contract_current_value` is **indicative**. At 8,000 paths and `p ≈ 0.6`, the standard error is approximately `0.005`, so successive quotes at the same state will differ. Any surface displaying it MUST present it as indicative, not as a firm price.
- It MUST NOT be persisted on the contract row.
- It MUST NOT be used by the settlement code path. Settlement uses the discrete first-to-touch comparison in `barrier-race-contract` "First-to-Touch Resolution".
- **It MUST be computed only from ticks already revealed to the player.** The full path exists on the backend from acceptance, so an estimator that peeked at unrevealed ticks would leak the outcome through the quoted value. The estimator's forward draws MUST be independent of the contract's own path.
- The estimator MAY use a fast non-cryptographic gaussian source, because its draws never determine money movement. The contract's own path MUST still use a CSPRNG per `barrier-race-contract` "Race Path Generation and Auditability".

There is **no cash-out**. `contract_current_value` is informational only; the product exposes no sell path and no `SOLD` status. A contract settles solely by the race resolving.

#### Scenario: Live value at the entry state is below stake

- **WHEN** the reveal is at the start state for a `DRIFT` contract with `stake = "100.000000"` and `offered_odds = "1.50"`, so `pWin1 ≈ 0.6369` and `pRefund ≈ 0.0097`
- **THEN** `contract_current_value ≈ "96.505000"` (= `100 × (0.6369 × 1.50 + 0.0097)`)
- **AND** the value is below the stake, reflecting the house edge already embedded in `offered_odds`

#### Scenario: Live value rises as the selection approaches the barrier

- **WHEN** the revealed price of the selected asset moves closer to `H` while the other asset stays put
- **THEN** `pWin_selected` increases relative to its value at the start state
- **AND** `contract_current_value` increases accordingly

#### Scenario: Live value falls when the selection falls behind

- **WHEN** the revealed price of the selected asset moves away from `H` while the other asset moves closer
- **THEN** `pWin_selected` decreases relative to its value at the start state
- **AND** `contract_current_value` decreases accordingly

#### Scenario: Selection already at the barrier alone

- **WHEN** the revealed state has the selected asset at or above `log_B` and the other asset below it
- **THEN** the short-circuit gives `pWin_selected = 1` and `pRefund = 0` with no simulation
- **AND** `contract_current_value` equals the contract's `potential_payout`

#### Scenario: Both assets already at the barrier

- **WHEN** the revealed state has both assets at or above `log_B`
- **THEN** the short-circuit gives `pWin1 = pWin2 = 0` and `pRefund = 1`
- **AND** `contract_current_value` equals the stake

#### Scenario: Estimator cannot see unrevealed ticks

- **WHEN** a live value is computed while the reveal is at tick 3 of a race resolving at tick 9
- **THEN** the estimator's inputs are the revealed prices at tick 3 only
- **AND** the quoted value is statistically indistinguishable from one computed by a party who does not know the remaining path

#### Scenario: Live value never drives settlement

- **WHEN** a contract settles
- **THEN** the outcome and `sell_price` are determined by first-to-touch resolution and the locked `potential_payout`
- **AND** no `contract_current_value` quote influences either

### Requirement: Settlement Payout Computation

The backend MUST resolve the contract's `sell_price` column at settlement from the contract's status:

- WON → `sell_price = potential_payout` (the value locked at placement). Settlement-time clipping MUST NOT be applied; the per-contract max-payout cap is enforced at placement per `barrier-race-risk` "Per-Contract Max Payout".
- REFUNDED → `sell_price = buy_price` (= stake; full restoration). This applies identically to all three refund reasons: `tie`, `timeout`, and `operator_refund`.
- LOST → `sell_price = "0.000000"`.

The corresponding ledger row carries the same amount: WIN_CREDIT = `potential_payout`, REFUND = `buy_price` (= stake), no row for LOST.

Arithmetic MUST go through a decimal-safe library (`shopspring/decimal` in Go, Postgres `NUMERIC` in SQL); `float64` arithmetic on money is forbidden.

#### Scenario: Win sell_price equals locked potential_payout

- **WHEN** a contract with `potential_payout = "15.000000"` settles WON
- **THEN** the contract row's `sell_price = "15.000000"`
- **AND** the WIN_CREDIT ledger row has `amount = +15.000000`

#### Scenario: Underdog win pays the locked odds

- **WHEN** a `VOL` contract with `stake = "10.000000"` and `offered_odds = "2.61"` settles WON
- **THEN** `sell_price = "26.100000"` and the player's net profit is `16.100000`

#### Scenario: Tie refund restores the stake

- **WHEN** a contract with `buy_price = "10.000000"` settles REFUNDED with `settle_reason = "tie"`
- **THEN** `sell_price = "10.000000"` and the REFUND ledger row has `amount = +10.000000`
- **AND** the player's net profit and loss is `0.000000`

#### Scenario: Timeout refund restores the stake

- **WHEN** a contract with `buy_price = "10.000000"` settles REFUNDED with `settle_reason = "timeout"`
- **THEN** `sell_price = "10.000000"` and the REFUND ledger row has `amount = +10.000000`

#### Scenario: Loss pays nothing

- **WHEN** a contract settles LOST
- **THEN** `sell_price = "0.000000"`
- **AND** no credit ledger row is written; the stake debited at placement remains with the house

### Requirement: Recorded Pricing Inputs

Every contract row MUST persist enough pricing inputs in the `locked_pricing` JSONB column to allow an audit to re-derive the offered odds, the payout, and the commission decomposition without consulting live configuration:

- Pricing engine identifier (`discrete-grid-fft`).
- The `config_version` the contract was priced under.
- Every locked base parameter: `s0_drift`, `s0_vol`, `barrier`, `mu_drift`, `mu_vol`, `sigma_drift`, `sigma_vol`, `rho`, `dt`, `t_max`, `commission_rate`.
- Derived per-tick constants: `drift_i`, `vol_i`, log-distance `d`, and distance in standard deviations `d / vol_i` for each asset.
- All four probabilities as used (post-clamp): `P₁`, `P₂`, `P_tie`, `P_∅`.
- The grid parameters in force: `n_grid`, `max_grid`, `n_std`, `min_cells_per_std`, `ε`.
- `fair_odds` and `offered_odds` for the contract's selection, and `overround`.
- `potential_payout` and `buy_commission`.

`locked_pricing` is admin-only data. It MUST NOT be exposed on player-facing endpoints (per `barrier-race-database` "contracts Table" — the trimmed shape used by `/api/barrier-race/contracts` and `/api/barrier-race/contracts/{id}` omits this column). It MUST NOT contain the path seed, which is a separate admin-only column with its own disclosure rule per `barrier-race-contract` "Race Path Generation and Auditability".

Persisting the probabilities and grid parameters alongside the derived odds is what makes a settled contract auditable after the config has moved on: the grid run itself is expensive and its inputs may no longer exist in live settings, so the record must be self-contained.

#### Scenario: Audit re-derives the offered odds

- **WHEN** an auditor reads the persisted `locked_pricing` for a settled `DRIFT` contract
- **THEN** the auditor recomputes `offered_odds` as `round_half_up_2dp(1 / (P₁ + commission_rate))`
- **AND** the recomputed value matches the persisted `offered_odds`

#### Scenario: Audit re-derives the payout and commission

- **WHEN** an auditor reads `locked_pricing` together with the row's `buy_price`
- **THEN** the auditor recomputes `potential_payout` as `round_down_6dp(buy_price × offered_odds)` and `buy_commission` as `round_down_6dp(buy_price × (fair_odds − offered_odds))`
- **AND** both recomputed values match the persisted values

#### Scenario: Record is self-contained after a config change

- **WHEN** an auditor inspects a contract priced under a `config_version` that has since been superseded
- **THEN** every parameter and probability needed to reproduce the pricing is present in `locked_pricing`
- **AND** the audit does not depend on live configuration settings

#### Scenario: locked_pricing not exposed on player endpoints

- **WHEN** a player reads `/api/barrier-race/contracts/{id}` for one of their own contracts
- **THEN** the response object does NOT include a `locked_pricing` field
- **AND** the player cannot reconstruct the pricing maths from the trimmed response

#### Scenario: Seed is not part of locked_pricing

- **WHEN** an operator reads a contract's `locked_pricing`
- **THEN** the path seed is not among its fields
- **AND** the seed is read from its own admin-only column, which stays admin-only even after the contract is terminal
