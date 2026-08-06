# Digit Ladder — Product Specification

**Version:** 1.0 · **Date:** August 2026  
**Read `platform_standard.md` first** (trading-game-specs). This document defines only product-specific behavior. Everything in the platform standard applies unchanged when this product is ported to the Deriv Product Mesh.

**Ideations note:** The playable POC in this repo is client-side. Engine types, money (integer cents), round status, `locked_pricing`, and `settlement_data` mirror platform_standard §6.2 / §8.1 / §23.7 so a Go backend can lift them without reshaping the product.

**Arcade name:** Digit Ladder · **Mechanic subtitle:** Higher / Lower · Parlay · **Slug:** `digit-ladder`

---

## 1. Glossary of Terms

**Face Digit / Entry Digit (D):** The last digit locked as the comparison base for a ladder step. Before the first stake, D is dealt by a **free draw** (next tick, no debit) and stays frozen while the player decides. On continue, D is the previous settlement digit.

**Free Draw:** A no-stake tick that locks the table face. Odds do not track the live stream until the player places or redraws.

**Settlement Digit (D′):** The last digit of the next tick after a step is locked.

**Higher:** Side that wins if `D′ > D` (strict).

**Lower:** Side that wins if `D′ < D` (strict).

**Tie:** `D′ === D`. Always a loss for the active pick; busts the pot.

**Pot:** Escrowed amount at risk for the round. Starts as the initial stake. On a winning step, `pot = floor(pot × step_multiplier)`.

**Parlay / Continue:** After a win, risk the entire pot on another Higher/Lower step without an additional debit.

**Cash Out:** Terminal action that credits the current pot to the player balance and closes the round as `WON`.

**Step:** One Higher/Lower pick + one settlement tick within a round.

**Round:** One escrowed stake lifecycle from place until cash-out or bust.

**Locked Pricing:** Per-step immutable snapshot (`pricing_model`, commission, entry digit, pick, base/implied prob, multiplier). Required by platform_standard §6.2.

**Settlement Data:** Self-contained proof of the round (steps, digits, pot path, cash_out flag). Required for audit replay.

---

## 2. Product Concept

Digit Ladder is a casino-style Higher/Lower arcade on live last digits. The player draws a free face digit, stakes once, taps Higher or Lower, and waits for the next tick. On a win they may cash out the pot or climb the ladder (parlay). On a loss the pot is gone.

**Why this product exists:** Digits already offers Over/Under with a keypad threshold. Digit Ladder is the comparative High/Low framing with a parlay continue loop — trading last digits with a gamified climb.

**Core loop:** (1) Free-draw face D; (2) set stake, tap Higher/Lower — lock step; (3) next tick settles; (4) cash out or continue; (5) bust or bank → draw again.

---

## 3. Feed Requirements

- **Feed type:** Continuous tick stream (local mock ~1 Hz in ideations POC)
- **Settlement input:** Last digit of the price at the instrument’s pip precision
- **Tick frequency:** ~1 Hz
- **No client RNG for settlement** — tick stream only
- **POC note:** Feed is always local; no live/demo user distinction

---

## 4. Product Mechanics

### 4.1 Round Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `contract_type` | String | Always `DIGIT_LADDER` |
| `instrument` | String | e.g. `1HZ100V` |
| `initial_stake` | USDT | Debited once at place |
| `pot` | USDT / cents | Current escrow |
| `steps` | Array | Ordered ladder rungs |
| `ticks_per_step` | Integer | Always `1` |

### 4.2 Step Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `entry_digit` | Integer 0–9 | Face digit D |
| `pick` | String | `higher` \| `lower` |
| `settlement_digit` | Integer 0–9 | D′ after next tick |
| `step_multiplier` | Decimal | Locked at pick |

### 4.3 Settlement (per step)

| Condition | Result |
| --- | --- |
| Higher and `D′ > D` | Step win — pot × locked mult |
| Lower and `D′ < D` | Step win — pot × locked mult |
| Otherwise (incl. tie) | Round `LOST`, pot = 0 |
| Cash out after a step win | Round `WON`, credit pot |
| Urgent shutdown void | `VOID`, remaining pot/stake refunded (platform_standard §7) |

### 4.4 Offerability

| Entry D | Higher | Lower |
| --- | --- | --- |
| 0 | offered | **disabled** (base_prob = 0) |
| 1–8 | offered | offered |
| 9 | **disabled** | offered |

---

## 5. Pricing Model

### 5.1 Fair probabilities (uniform digits)

```
base_prob_higher(D) = (9 - D) / 10
base_prob_lower(D)  = D / 10
```

### 5.2 Commission (Digits formula)

Default `commission_rate = 0.02`:

```
implied_prob = base_prob + commission_rate
step_multiplier = round(1 / implied_prob, 2)
payout_cents = floor(pot_cents × step_multiplier)   // on step win
```

### 5.3 Worked examples (commission 2%)

| D | Side | base | implied | mult |
| --- | --- | --- | --- | --- |
| 5 | Higher | 0.40 | 0.42 | 2.38 |
| 5 | Lower | 0.50 | 0.52 | 1.92 |
| 0 | Higher | 0.90 | 0.92 | 1.09 |
| 9 | Lower | 0.90 | 0.92 | 1.09 |

### 5.4 `locked_pricing` (required fields)

```json
{
  "pricing_model": "digit_ladder_vs_current_v1",
  "commission_rate": 0.02,
  "instrument": "1HZ100V",
  "steps": [
    {
      "entry_digit": 5,
      "pick": "higher",
      "base_prob": 0.4,
      "implied_prob": 0.42,
      "multiplier": 2.38
    }
  ]
}
```

---

## 6. Money & Contracts (platform_standard)

- All money in **integer cents** internally; USDT float only at API boundary.
- Round statuses: `OPEN` → `WON` | `LOST` (| `VOID` on shutdown).
- `currency`: `"USDT"`.
- Stake debited at place (escrow). Cash-out is the only credit path. Bust credits nothing.
- `settlement_data` MUST include: `outcome`, `initial_stake_cents`, `final_pot_cents`, `cash_out`, `steps[]` with entry/settlement digits, pick, step_mult, pot_after, result.
- `feed_snapshot`: per-step instrument + quote/epoch used for settlement.
- Server authority when ported — client POC is non-authoritative demo.

### 6.1 Activity

On terminal settle, emit `CONTRACT_SETTLED` with `outcome` `WON`/`LOST`, stake/payout in USDT (platform_standard §22).

---

## 7. Risk & Limits (product-specific defaults)

| Limit | Default |
| --- | --- |
| Min stake | 0.10 USDT (10¢) — ideations UI: 10 credits |
| Max stake | Product settings (ideations UI: 5000 credits) |
| Commission | 2% additive on base_prob |
| Max ladder depth | None in POC (edge compounds) |
| Mid-step cash-out while awaiting tick | Disallowed |

---

## 8. Frontend (platform_standard §25 + product)

- Mobile-first column; sentence case
- **Free draw before stake** — face is locked from a no-bet tick; live stream shown separately so odds do not flicker
- Hero: large face digit + quote→digit extraction + secondary live strip
- Settle compare cue (`D → D′`) and rung trail during a climb
- Equal pick cards — Higher / Lower with multipliers vs locked face
- Ready dock order: stake, then Higher / Lower; optional Draw again
- After win: Cash out + Higher / Lower continue; show pot and rung count
- Design tokens only (no hardcoded hex)

---

## 9. Ideations ↔ Mesh mapping

| Mesh deliverable | Ideations POC |
| --- | --- |
| Go backend + DB contracts | Pure TS round + in-memory object |
| Authoritative feed | Deriv / demo tick stream |
| Balance / ledger | Demo `balance-store` |
| Arcade registry | `game-registry.ts` track `other` |
| Provably fair | Short `/provably-fair` section |
