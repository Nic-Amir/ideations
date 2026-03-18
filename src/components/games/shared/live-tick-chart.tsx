'use client';

import { useRef, useEffect, useCallback } from 'react';
import type { ParsedTick } from '@/types';

interface LiveTickChartProps {
  ticks: ParsedTick[];
  highlightedTicks?: ParsedTick[];
  height?: number;
  className?: string;
}

const CHART_COLORS = {
  bg: '#0f0f11',
  grid: 'rgba(255,255,255,0.03)',
  line: '#a1a1aa',
  lineFill: 'rgba(161,161,170,0.06)',
  dot: '#e4e4e7',
  highlight: '#f59e0b',
  highlightFaint: 'rgba(245,158,11,0.35)',
  digitBg: 'rgba(245,158,11,0.15)',
  text: '#71717a',
  textBright: '#e4e4e7',
};

const PADDING = { top: 16, right: 64, bottom: 20, left: 8 };

export function LiveTickChart({
  ticks,
  highlightedTicks = [],
  height = 100,
  className = '',
}: LiveTickChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(600);

  const highlightEpochs = new Set(highlightedTicks.map((t) => t.epoch));

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, w * dpr, h * dpr);
      ctx.save();
      ctx.scale(dpr, dpr);

      ctx.fillStyle = CHART_COLORS.bg;
      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, 4);
      ctx.fill();

      if (ticks.length < 2) {
        ctx.fillStyle = CHART_COLORS.text;
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Waiting for tick data\u2026', w / 2, h / 2);
        ctx.restore();
        return;
      }

      const plotW = w - PADDING.left - PADDING.right;
      const plotH = h - PADDING.top - PADDING.bottom;
      const displayTicks = ticks.slice(-60);

      const quotes = displayTicks.map((t) => t.numericQuote);
      const minQ = Math.min(...quotes);
      const maxQ = Math.max(...quotes);
      const range = maxQ - minQ || 1;
      const pad = range * 0.1;
      const yMin = minQ - pad;
      const yMax = maxQ + pad;

      const xScale = (i: number) =>
        PADDING.left + (i / (displayTicks.length - 1)) * plotW;
      const yScale = (v: number) =>
        PADDING.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

      // Grid
      ctx.strokeStyle = CHART_COLORS.grid;
      ctx.lineWidth = 1;
      for (let i = 0; i <= 3; i++) {
        const y = PADDING.top + (plotH / 3) * i;
        ctx.beginPath();
        ctx.moveTo(PADDING.left, y);
        ctx.lineTo(w - PADDING.right, y);
        ctx.stroke();
      }

      // Price line
      ctx.strokeStyle = CHART_COLORS.line;
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

      // Fill under line
      ctx.save();
      ctx.fillStyle = CHART_COLORS.lineFill;
      ctx.beginPath();
      for (let i = 0; i < displayTicks.length; i++) {
        const x = xScale(i);
        const y = yScale(displayTicks[i].numericQuote);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineTo(xScale(displayTicks.length - 1), PADDING.top + plotH);
      ctx.lineTo(xScale(0), PADDING.top + plotH);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Highlighted ticks (consumed by game)
      for (let i = 0; i < displayTicks.length; i++) {
        if (highlightEpochs.has(displayTicks[i].epoch)) {
          const x = xScale(i);
          const y = yScale(displayTicks[i].numericQuote);

          // Vertical dashed line
          ctx.save();
          ctx.strokeStyle = CHART_COLORS.highlightFaint;
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 3]);
          ctx.beginPath();
          ctx.moveTo(x, PADDING.top);
          ctx.lineTo(x, PADDING.top + plotH);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();

          // Dot
          ctx.fillStyle = CHART_COLORS.highlight;
          ctx.beginPath();
          ctx.arc(x, y, 3.5, 0, Math.PI * 2);
          ctx.fill();

          // Digit label above dot
          const digit = displayTicks[i].lastDigit;
          ctx.save();
          ctx.fillStyle = CHART_COLORS.highlight;
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(String(digit), x, y - 8);
          ctx.restore();
        }
      }

      // Latest point
      const lastTick = displayTicks[displayTicks.length - 1];
      const lastX = xScale(displayTicks.length - 1);
      const lastY = yScale(lastTick.numericQuote);

      ctx.fillStyle = CHART_COLORS.dot;
      ctx.beginPath();
      ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
      ctx.fill();

      // Right-side price label
      ctx.save();
      ctx.fillStyle = CHART_COLORS.textBright;
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'left';
      const labelX = w - PADDING.right + 6;
      const pipSize = lastTick.pip_size ?? 2;
      ctx.fillText(lastTick.numericQuote.toFixed(pipSize), labelX, lastY + 4);

      // Last digit badge
      const digitStr = String(lastTick.lastDigit);
      ctx.fillStyle = CHART_COLORS.digitBg;
      const badgeW = 18;
      const badgeH = 16;
      const badgeX = labelX;
      const badgeY = lastY + 8;
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 3);
      ctx.fill();

      ctx.fillStyle = CHART_COLORS.highlight;
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(digitStr, badgeX + badgeW / 2, badgeY + 12);
      ctx.restore();

      // Y-axis scale labels
      const axisPrecision = displayTicks[0]?.pip_size ?? 2;
      ctx.fillStyle = CHART_COLORS.text;
      ctx.font = '8px monospace';
      ctx.textAlign = 'right';
      for (let i = 0; i <= 3; i++) {
        const val = yMin + ((yMax - yMin) / 3) * (3 - i);
        const y = PADDING.top + (plotH / 3) * i;
        ctx.fillText(val.toFixed(axisPrecision), w - PADDING.right + 4, y + 3);
      }

      ctx.restore();
    },
    [ticks, highlightEpochs]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        widthRef.current = entry.contentRect.width;
      }
    });
    ro.observe(container);
    widthRef.current = container.clientWidth;

    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = widthRef.current;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${height}px`;

    draw(ctx, w, height);
  }, [ticks, height, draw]);

  return (
    <div ref={containerRef} className={`w-full ${className}`}>
      <canvas ref={canvasRef} className="block w-full rounded" />
    </div>
  );
}
