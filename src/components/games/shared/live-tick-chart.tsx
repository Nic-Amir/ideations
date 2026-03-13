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
  bg: '#131325',
  grid: 'rgba(255,255,255,0.04)',
  line: '#00D4AA',
  lineGlow: 'rgba(0,212,170,0.3)',
  dot: '#00D4AA',
  dotGlow: 'rgba(0,212,170,0.6)',
  highlight: '#FF6B35',
  highlightGlow: 'rgba(255,107,53,0.4)',
  text: '#8B8BA3',
  textBright: '#F0F0F0',
  digitBg: 'rgba(0,212,170,0.15)',
};

const PADDING = { top: 24, right: 64, bottom: 28, left: 12 };

export function LiveTickChart({
  ticks,
  highlightedTicks = [],
  height = 200,
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

      // Background
      ctx.fillStyle = CHART_COLORS.bg;
      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, 12);
      ctx.fill();

      if (ticks.length < 2) {
        ctx.fillStyle = CHART_COLORS.text;
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Waiting for tick data...', w / 2, h / 2);
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
      const padding = range * 0.1;
      const yMin = minQ - padding;
      const yMax = maxQ + padding;

      const xScale = (i: number) => PADDING.left + (i / (displayTicks.length - 1)) * plotW;
      const yScale = (v: number) => PADDING.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

      // Grid lines
      ctx.strokeStyle = CHART_COLORS.grid;
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = PADDING.top + (plotH / 4) * i;
        ctx.beginPath();
        ctx.moveTo(PADDING.left, y);
        ctx.lineTo(w - PADDING.right, y);
        ctx.stroke();
      }

      // Price line with glow
      ctx.save();
      ctx.shadowColor = CHART_COLORS.lineGlow;
      ctx.shadowBlur = 8;
      ctx.strokeStyle = CHART_COLORS.line;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < displayTicks.length; i++) {
        const x = xScale(i);
        const y = yScale(displayTicks[i].numericQuote);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();

      // Fill under the line
      ctx.save();
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = CHART_COLORS.line;
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
          ctx.strokeStyle = CHART_COLORS.highlight;
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.globalAlpha = 0.5;
          ctx.beginPath();
          ctx.moveTo(x, PADDING.top);
          ctx.lineTo(x, PADDING.top + plotH);
          ctx.stroke();
          ctx.restore();

          // Glow dot
          ctx.save();
          ctx.shadowColor = CHART_COLORS.highlightGlow;
          ctx.shadowBlur = 10;
          ctx.fillStyle = CHART_COLORS.highlight;
          ctx.beginPath();
          ctx.arc(x, y, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          // Digit label above dot
          const digit = displayTicks[i].lastDigit;
          ctx.save();
          ctx.fillStyle = CHART_COLORS.highlight;
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(String(digit), x, y - 10);
          ctx.restore();
        }
      }

      // Latest point glow
      const lastTick = displayTicks[displayTicks.length - 1];
      const lastX = xScale(displayTicks.length - 1);
      const lastY = yScale(lastTick.numericQuote);

      ctx.save();
      ctx.shadowColor = CHART_COLORS.dotGlow;
      ctx.shadowBlur = 12;
      ctx.fillStyle = CHART_COLORS.dot;
      ctx.beginPath();
      ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Right-side labels: price + last digit
      ctx.save();
      ctx.fillStyle = CHART_COLORS.textBright;
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'left';
      const priceLabel = lastTick.numericQuote.toFixed(2);
      const labelX = w - PADDING.right + 8;
      ctx.fillText(priceLabel, labelX, lastY + 4);

      // Last digit badge
      const digitStr = String(lastTick.lastDigit);
      ctx.fillStyle = CHART_COLORS.digitBg;
      const badgeW = 22;
      const badgeH = 18;
      const badgeX = labelX;
      const badgeY = lastY + 10;
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
      ctx.fill();

      ctx.fillStyle = CHART_COLORS.dot;
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(digitStr, badgeX + badgeW / 2, badgeY + 13);
      ctx.restore();

      // Y-axis scale labels
      ctx.fillStyle = CHART_COLORS.text;
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      for (let i = 0; i <= 4; i++) {
        const val = yMin + ((yMax - yMin) / 4) * (4 - i);
        const y = PADDING.top + (plotH / 4) * i;
        ctx.fillText(val.toFixed(1), w - PADDING.right + 4, y + 3);
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
      <canvas ref={canvasRef} className="block w-full rounded-xl" />
    </div>
  );
}
