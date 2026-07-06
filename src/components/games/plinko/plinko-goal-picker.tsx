'use client';

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@trading-game/design-intelligence-layer';
import { formatSessionGoal, pickRandomSessionGoal, type SessionGoal } from '@/lib/games/plinko-session-goals';
import type { PlinkoModeId } from '@/lib/games/plinko-modes';

export function PlinkoGoalPicker({
  total,
  modeId,
  goals,
  onPick,
  onCancel,
}: {
  total: number;
  modeId: PlinkoModeId;
  goals: SessionGoal[];
  onPick: (goal: SessionGoal) => void;
  onCancel: () => void;
}) {
  return (
    <Card className="border-border-subtle bg-card shadow-none py-0 gap-0">
      <CardHeader className="px-3 pt-3 pb-0">
        <CardDescription className="body-sm text-on-subtle">
          Pick a goal for your {total}-path run
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 px-3 pb-3 pt-2">
        <div className="grid gap-2">
          {goals.map((goal, i) => (
            <Button
              key={`${goal.kind}-${i}`}
              variant="secondary"
              size="sm"
              className="min-h-[40px] justify-center body-sm font-display"
              onClick={() => onPick(goal)}
            >
              {formatSessionGoal(goal)}
            </Button>
          ))}
          <Button
            variant="primary"
            size="sm"
            className="min-h-[40px] body-sm font-display"
            onClick={() => onPick(pickRandomSessionGoal(modeId, total))}
          >
            Surprise me
          </Button>
        </div>
        <Button
          type="button"
          variant="tertiary"
          size="sm"
          className="w-full body-xs"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </CardContent>
    </Card>
  );
}
