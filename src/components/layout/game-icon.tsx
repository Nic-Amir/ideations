"use client";

import type { LucideProps } from "lucide-react";
import { Activity, ChevronsUpDown, Dice3, Flag, Repeat, Spade, Target, Trophy } from "lucide-react";
import type { GameIconKey } from "@/types";

const ICONS: Record<GameIconKey, React.ComponentType<LucideProps>> = {
  "digit-collect": Target,
  "digit-poker": Spade,
  "digit-slots": Dice3,
  "volatility-run": Activity,
  "barrier-race": Flag,
  "barrier-predictor": ChevronsUpDown,
  "barrier-touch": Repeat,
  "synthetic-derby": Trophy,
};

export function GameIcon({
  iconKey,
  className,
}: {
  iconKey: GameIconKey;
  className?: string;
}) {
  const Icon = ICONS[iconKey];
  return <Icon className={className} />;
}
