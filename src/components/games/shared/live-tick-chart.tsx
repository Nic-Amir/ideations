'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { resolveTheme, withAlpha } from '@/lib/canvas-theme';
import type { ParsedTick } from '@/types';

interface LiveTickChartProps {
  ticks: ParsedTick[];
  highlightedTicks?: ParsedTick[];
  className?: string;
}

function getPaddingRight(containerWidth: number): number {
  return containerWidth < 320 ? 48 : containerWidth < 400 ? 56 : 64;
}

export function LiveTickChart({
  ticks,
  highlightedTicks = [],
  className = '',
}: LiveTickChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(56);

  const highlightEpochs = new Set(highlightedTicks.map((t) => t.epoch));

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const theme = resolveTheme();
      const padRight = getPaddingRight(w);
      const padding = { top: 8, right: padRight, bottom: 8, left: 4 };

      const colors = {
        bg: theme.subtle,
        grid: withAlpha(theme.borderSubtle, 0.5),
        line: theme.textSecondary,
        lineFill: withAlpha(theme.primary, 0.08),
        dot: theme.textPrimary,
        highlight: theme.warning,
        highlightFaint: withAlpha(theme.warning, 0.35),
        digitBg: withAlpha(theme.warning, 0.15),
        text: theme.textSecondary,
        textBright: theme.textPrimary,
      };

      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, w * dpr, h * dpr);
      ctx.save();
      ctx.scale(dpr, dpr);

      ctx.fillStyle = colors.bg;
      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, 4);
      ctx.fill();

      if (ticks.length < 2) {
        ctx.fillStyle = colors.text;
        ctx.font = `11px ${theme.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.fillText('Waiting for tick data\u2026', w / 2, h / 2);
        ctx.restore();
        return;
      }

      const plotW = w - padding.left - padding.right;
      const plotH = h - padding.top - padding.bottom;
      const displayTicks = ticks.slice(-60);

      const quotes = displayTicks.map((t) => t.numericQuote);
      const minQ = Math.min(...quotes);
      const maxQ = Math.max(...quotes);
      const range = maxQ - minQ || 1;
      const pad = range * 0.1;
      const yMin = minQ - pad;
      const yMax = maxQ + pad;

      const xScale = (i: number) =>
        padding.left + (i / (displayTicks.length - 1)) * plotW;
      const yScale = (v: number) =>
        padding.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

      ctx.strokeStyle = colors.grid;
      ctx.lineWidth = 1;
      for (let i = 0; i <= 2; i++) {
        const y = padding.top + (plotH / 2) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(w - padding.right, y);
        ctx.stroke();
      }

      ctx.strokeStyle = colors.line;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < displayTicks.length; i++) {
        const x = xScale(i);
        const y = yScale(displayTicks[i].numericQuote);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.save();
      ctx.fillStyle = colors.lineFill;
      ctx.beginPath();
      for (let i = 0; i < displayTicks.length; i++) {
        const x = xScale(i);
        const y = yScale(displayTicks[i].numericQuote);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineTo(xScale(displayTicks.length - 1), padding.top + plotH);
      ctx.lineTo(xScale(0), padding.top + plotH);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      for (let i = 0; i < displayTicks.length; i++) {
        if (highlightEpochs.has(displayTicks[i].epoch)) {
          const x = xScale(i);
          const y = yScale(displayTicks[i].numericQuote);
          ctx.fillStyle = colors.highlight;
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const lastTick = displayTicks[displayTicks.length - 1];
      const lastX = xScale(displayTicks.length - 1);
      const lastY = yScale(lastTick.numericQuote);

      ctx.fillStyle = colors.dot;
      ctx.beginPath();
      ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.fillStyle = colors.textBright;
      ctx.font = `bold 10px ${theme.fontFamily}`;
      ctx.textAlign = 'left';
      const labelX = w - padding.right + 4;
      const pipSize = lastTick.pip_size ?? 2;
      ctx.fillText(lastTick.numericQuote.toFixed(pipSize), labelX, lastY);

      ctx.fillStyle = colors.highlight;
      ctx.font = `bold 10px ${theme.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.fillText(String(lastTick.lastDigit), labelX + 9, lastY + 14);
      ctx.restore();

      ctx.restore();
    },
    [ticks, highlightEpochs],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
        setContainerHeight(entry.contentRect.height);
      }
    });
    ro.observe(container);
    setContainerWidth(container.clientWidth);
    setContainerHeight(container.clientHeight);

    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || containerWidth <= 0 || containerHeight <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = containerWidth * dpr;
    canvas.height = containerHeight * dpr;
    canvas.style.width = `${containerWidth}px`;
    canvas.style.height = `${containerHeight}px`;

    draw(ctx, containerWidth, containerHeight);
  }, [ticks, containerWidth, containerHeight, draw]);

  return (
    <div
      ref={containerRef}
      className={`w-full ${className}`}
      style={{ height: 'clamp(48px, 9dvh, 72px)' }}
    >
      <canvas ref={canvasRef} className="block w-full h-full rounded-lg" />
    </div>
  );
}
