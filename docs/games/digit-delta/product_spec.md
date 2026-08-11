# Digit Delta — Product Specification

**Version:** 1.3 · **Date:** August 2026  
**Read `platform_standard.md` first** (trading-game-specs). This document defines only product-specific behavior. Everything in the platform standard applies unchanged when this product is ported to the Deriv Product Mesh.

**Ideations note:** The playable POC in this repo is client-side. Engine types, money (integer cents), round status, `locked_pricing`, and `settlement_data` mirror platform_standard §6.2 / §8.1 / §23.7 so a Go backend can lift them without reshaping the product.

**Arcade name:** Digit Delta · **Mechanic subtitle:** Hold · Beat the dealer · Δ payout · **Slug:** `digit-delta`

---

## 1. Glossary of Terms

**Face Digit:** Current comparison digit at the end of a hand (player or dealer).

**Collect:** A successful Higher/Lower call that appends a digit to the hand and increases length by 1.

**Hold:** Player action that ends collecting and starts the dealer phase. Allowed when `playerLen ≥ 2`. Recommended Hold length **3**.

**Length:** Count of digits in a hand including the starting face.

**Stop floor:** Shared rule — neither side may stop on the opening digit alone (`MIN_STOP_LENGTH = 2`). House edge is second-move only.

**Δ (Delta):** Settlement length edge used for payout: `playerLen − dealerLen` on both stand and dealer bust (dealer digits always count). On bust, Δ is floored to at least 1.

**Auto-win cap:** Reaching `AUTO_WIN_LENGTH` (6) wins immediately with fixed jackpot mult `AUTO_WIN_PAYOUT_MULT` (dealer skipped).

**House dealer rules:** Deterministic policy.
- Length 1: must call — Higher if face ≤ 5, Lower if face ≥ 6 (never Stand).
- Length ≥ 2: face 0–3 Higher; face 4–6 **Stand**; face 7–9 Lower.

**Dealer stop reason:** `stand` or `bust` (wrong-direction call; equal rerolls).

**Locked Pricing:** Snapshot of pay table version, auto-win mult, and stake at open. Required by platform_standard §6.2.

**Settlement Data:** Self-contained proof (digits, picks, lengths, Δ, outcome, dealer_stop_reason).

---

## 2. Product Concept

Digit Delta turns live last digits into a Hold-and-compare streak game. The player free-draws a face, stakes once, collects with Higher/Lower (equal rerolls), Holds, then the house dealer must follow the same stop floor and a strict call table until Stand or bust. Payout uses a tapered Δ table; length 6 is a fixed jackpot climax.

**Why this product exists:** Digit Ladder is climb-and-parlay. Digit Delta is beat-the-market-continuation — trading language (Hold, Δ) with a gamified dealer phase whose only structural edge is playing after the player.

**Core loop:** (1) Free-draw face; (2) stake; (3) Higher/Lower collect; (4) Hold or ride to 6; (5) dealer runs house rules; (6) settle by bust / length Δ / tie refund / loss / auto-win.

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
| Else (wrong direction) | Round `LOST` (player bust) |
| Equal digit | **Reroll** — not collected; keep pending call |
| `playerLen ≥ 6` | Instant `WON` (`auto_win_cap`) |
| Hold with `playerLen ≥ 2` | Enter dealer phase |
| Hold with `playerLen < 2` | Disallowed |

### 4.3 House dealer rules

| Face D | Length 1 | Length ≥ 2 |
| --- | --- | --- |
| 0–3 | Must call **Higher** | Must call **Higher** |
| 4–5 | Must call **Higher** | **Stand** |
| 6 | Must call **Lower** | **Stand** |
| 7–9 | Must call **Lower** | Must call **Lower** |

After a successful Higher/Lower, re-evaluate the new face with the updated length. Stand on 4–6 is only legal once length ≥ 2.

### 4.4 Settlement

| Condition | Status | Payout | `settle_reason` |
| --- | --- | --- | --- |
| Auto-win at length 6 | `WON` | `floor(stake_cents × auto_win_mult)` | `auto_win_cap` |
| Dealer bust | `WON` | `floor(stake_cents × payTable[max(playerLen − dealerLen, 1)])` | `dealer_bust` |
| Stand and `playerLen > dealerLen` | `WON` | `floor(stake_cents × payTable[Δ])` | `length_win` |
| Stand and `playerLen === dealerLen` | `REFUNDED` | stake back | `length_tie` |
| Stand and `playerLen < dealerLen` | `LOST` | 0 | `length_loss` |
| Player bust before Hold | `LOST` | 0 | `player_bust` |

---

## 5. Pricing Model

### 5.1 Tapered pay table (`digit_delta_taper_v1`)

Total return including stake:

| Δ | Multiplier |
| --- | --- |
| 1 | 2.25 |
| 2 | 2.55 |
| 3 | 2.80 |
| 4 | 3.00 |
| ≥5 | 3.15 |

**Auto-win jackpot** (length 6): **3.60×** (`AUTO_WIN_PAYOUT_MULT`) — not `payTable[6]`.

### 5.2 RTP (Monte Carlo, uniform digits, optimal player picks, equal=reroll)

| Hold strategy | Approx RTP |
| --- | --- |
| Hold at 2 | ~89% |
| Hold at 3 (recommended) | ~98.5–99% |
| Hold at 4 | ~91% |
| Hold at 5 | ~78% |
| Hold at 6 (jackpot ride) | ~81% |

Constraints: max strategy RTP ≤ 99%; Hold-at-3 is the peak.

### 5.3 `locked_pricing`

```json
{
  "pricing_model": "digit_delta_taper_v1",
  "pay_table_version": "v5",
  "pay_table": [0, 2.25, 2.55, 2.8, 3.0, 3.15],
  "auto_win_mult": 3.6,
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
| Min stop length | 2 (player Hold and dealer Stand) |
| Auto-win length | 6 (fixed jackpot mult) |
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
