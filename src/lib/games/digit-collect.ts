'use strict';

const HOUSE_EDGE = 0.03;
const TOTAL_DIGITS = 10;

export function getSurvivalProbability(drawNumber: number): number {
  if (drawNumber < 1 || drawNumber > TOTAL_DIGITS) return 0;
  return (TOTAL_DIGITS - (drawNumber - 1)) / TOTAL_DIGITS;
}

export function getCumulativeSurvival(drawNumber: number): number {
  let survival = 1;
  for (let i = 1; i <= drawNumber; i++) {
    survival *= getSurvivalProbability(i);
  }
  return survival;
}

export function getFairMultiplier(drawNumber: number): number {
  const cumSurvival = getCumulativeSurvival(drawNumber);
  if (cumSurvival === 0) return 0;
  return 1 / cumSurvival;
}

export function getActualMultiplier(drawNumber: number): number {
  return getFairMultiplier(drawNumber) * (1 - HOUSE_EDGE);
}

export function getKnockoutProbability(drawNumber: number): number {
  if (drawNumber < 1) return 0;
  return 1 - getSurvivalProbability(drawNumber);
}

export function isKnockout(digit: number, collected: Set<number>): boolean {
  return collected.has(digit);
}

export function getPayoutTable(): Array<{
  draw: number;
  survivalProb: number;
  cumulativeSurvival: number;
  fairMultiplier: number;
  actualMultiplier: number;
  knockoutProb: number;
}> {
  return Array.from({ length: TOTAL_DIGITS }, (_, i) => {
    const draw = i + 1;
    return {
      draw,
      survivalProb: getSurvivalProbability(draw),
      cumulativeSurvival: getCumulativeSurvival(draw),
      fairMultiplier: getFairMultiplier(draw),
      actualMultiplier: getActualMultiplier(draw),
      knockoutProb: getKnockoutProbability(draw),
    };
  });
}
