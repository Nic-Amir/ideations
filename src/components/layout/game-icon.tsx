"use client";

import type { LucideProps } from "lucide-react";
import { Activity, Dice3, Flag, Spade, Target } from "lucide-react";
import type { GameIconKey } from "@/types";

const ICONS: Record<GameIconKey, React.ComponentType<LucideProps>> = {
  "digit-collect": Target,
  "digit-poker": Spade,
  "digit-slots": Dice3,
  "volatility-run": Activity,
  "barrier-race": Flag,
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
