# Digit Delta — Product Specification

**Version:** 1.1 · **Date:** August 2026  
**Read `platform_standard.md` first** (trading-game-specs). This document defines only product-specific behavior. Everything in the platform standard applies unchanged when this product is ported to the Deriv Product Mesh.

**Ideations note:** The playable POC in this repo is client-side. Engine types, money (integer cents), round status, `locked_pricing`, and `settlement_data` mirror platform_standard §6.2 / §8.1 / §23.7 so a Go backend can lift them without reshaping the product.

**Arcade name:** Digit Delta · **Mechanic subtitle:** Hold · Beat the dealer · Δ payout · **Slug:** `digit-delta`

---

## 1. Glossary of Terms

**Face Digit:** Current comparison digit at the end of a hand (player or dealer).

**Collect:** A successful Higher/Lower call that appends a digit to the hand and increases length by 1.

**Hold:** Player action that ends collecting and starts the dealer phase. Allowed when `playerLen ≥ 2`.

**Length:** Count of digits in a hand including the starting face.

**Δ (Delta):** Settlement length edge used for payout.
- On **dealer stand:** `playerLen − dealerLen` (only positive Δ pays).
- On **dealer bust:** `playerLen` (dealer treated as length 0).

**House dealer rules:** Deterministic policy — face 0–3 must call Higher; face 4–6 **Stand** (settle immediately); face 7–9 must call Lower.

**Dealer stop reason:** `stand` or `bust` (wrong/equal call).

**Locked Pricing:** Snapshot of pay table version + stake at open. Required by platform_standard §6.2.

**Settlement Data:** Self-contained proof (digits, picks, lengths, Δ, outcome, dealer_stop_reason).

---

## 2. Product Concept

Digit Delta turns live last digits into a Hold-and-compare streak game. The player free-draws a face, stakes once, collects with Higher/Lower, Holds, then the house dealer must follow a strict call table until Stand or bust. Payout is a fixed total-return multiple of stake based on settlement Δ.

**Why this product exists:** Digit Ladder is climb-and-parlay. Digit Delta is beat-the-market-continuation — trading language (Hold, Δ) with a gamified dealer phase.

**Core loop:** (1) Free-draw face; (2) stake; (3) Higher/Lower collect; (4) Hold; (5) dealer runs house rules; (6) settle by bust / length Δ / tie refund / loss.

---

## 3. Feed Requirements

- **Feed type:** Continuous tick stream (local mock ~1 Hz in ideations POC)
- **Settlement input:** Last digit of the price
- **No client RNG for settlement** — tick stream only
- **POC note:** Feed is always local; no live/demo user distinction

---

## 4. Product Mechanics

### 4.1 Round parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `contract_type` | String | Always `DIGIT_DELTA` |
| `instrument` | String | e.g. `1HZ100V` |
| `initial_stake` | USDT / cents | Debited once at open |
| `player_digits` | int[] | Player hand |
| `dealer_digits` | int[] | Dealer hand |

### 4.2 Player phase

| Condition | Result |
| --- | --- |
| Higher and `D′ > D` | Collect — append D′, continue |
| Lower and `D′ < D` | Collect — append D′, continue |
| Else (incl. equal) | Round `LOST` (player bust) |
| Hold with `playerLen ≥ 2` | Enter dealer phase |
| Hold with `playerLen < 2` | Disallowed |

### 4.3 House dealer rules

| Face D | Action |
| --- | --- |
| 0–3 | Must call **Higher** |
| 4–6 | **Stand** — settle immediately |
| 7–9 | Must call **Lower** |

After a successful Higher/Lower, re-evaluate the new face. Stand on 4–6 can occur on the opening face or mid-run.

### 4.4 Settlement

| Condition | Status | Payout | `settle_reason` |
| --- | --- | --- | --- |
| Dealer bust | `WON` | `floor(stake_cents × payTable[playerLen])` | `dealer_bust` |
| Stand and `playerLen > dealerLen` | `WON` | `floor(stake_cents × payTable[Δ])` | `length_win` |
| Stand and `playerLen === dealerLen` | `REFUNDED` | stake back | `length_tie` |
| Stand and `playerLen < dealerLen` | `LOST` | 0 | `length_loss` |
| Player bust before Hold | `LOST` | 0 | `player_bust` |

---

## 5. Pricing Model

### 5.1 Fixed pay table (`digit_delta_length_v2`)

Total return including stake:

| Δ | Multiplier |
| --- | --- |
| 1 | 1.50 |
| 2 | 2.30 |
| 3 | 3.30 |
| 4 | 4.75 |
| ≥5 | 6.75 |

### 5.2 RTP (Monte Carlo, uniform digits, optimal player picks)

| Hold strategy | Approx RTP |
| --- | --- |
| Hold at 3 (recommended) | ~97% |
| Hold at 4 | ~96% |
| Hold at 2 | ~95% |

### 5.3 `locked_pricing`

```json
{
  "pricing_model": "digit_delta_length_v2",
  "pay_table_version": "v2",
  "pay_table": [0, 1.5, 2.3, 3.3, 4.75, 6.75],
  "instrument": "1HZ100V",
  "stake_cents": 10000
}
```

---

## 6. Money & Contracts (platform_standard)

- Integer cents internally.
- Statuses: `OPEN` → `WON` | `LOST` | `REFUNDED`.
- `settlement_data` MUST include: outcome, stake, payout, player/dealer lengths, Δ, settle_reason, dealer_stop_reason, digit trails, pick/step records.
- Server authority when ported — client POC is non-authoritative demo.

---

## 7. Risk & Limits

| Limit | Default |
| --- | --- |
| Min stake | Ideations UI: 10 credits |
| Max stake | Ideations UI: 5000 credits |
| Min Hold length | 2 |
| Split | Not in v1 |

---

## 8. Frontend

- Mobile-first; sentence case
- Free draw before stake
- Show player hand trail + dealer hand during dealer phase
- Actions: Higher / Lower / Hold
- Dealer action chip: Higher / Lower / Stand
- Δ pay table legend
- Design tokens only

---

## 9. Ideations ↔ Mesh mapping

| Mesh deliverable | Ideations POC |
| --- | --- |
| Go backend + DB contracts | Pure TS round object |
| Authoritative feed | Deriv / demo tick stream |
| Balance / ledger | Demo `balance-store` |
| Arcade registry | `game-registry.ts` track `other` |
