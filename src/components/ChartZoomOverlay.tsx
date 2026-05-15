import { useRef, useState, useEffect, type ReactNode } from 'react';

const DRAG_THRESHOLD_PX = 5;
const MIN_ZOOM_SECONDS = 10;
const SNAP_TOLERANCE_SECONDS = 10;
const CLICK_DELAY_MS = 200;
const MARKER_HOVER_PX = 8;
const MERGE_TOLERANCE_SECONDS = 10;
const CURSOR_SNAP_PULL_PX = 30; // attraction radius: cursor starts drifting toward nearest data point

export interface HoverSeriesInfo {
  name: string;
  color: string;
  unit: string;
  values: Array<{ timeOffsetSeconds: number; value: number | null }>;
}

interface Props {
  plotWidth: number;
  plotHeight: number;
  marginLeft: number;
  marginTop: number;
  domain: [number, number];
  onZoom: (start: number, end: number) => void;
  onZoomReset: () => void;
  hoverSeries: HoverSeriesInfo[];
  recordTimestamps: number[];
  markerTimes: number[];
  draggableMarkerTimes: number[];
  onAddMarker: (t: number) => void;
  onMoveMarker: (originalTime: number, newTime: number) => void;
  onMergeMarker: (draggedTime: number) => void;
}

function findNearestTimestamp(timestamps: number[], t: number): number | null {
  if (!timestamps.length) return null;
  let lo = 0, hi = timestamps.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (timestamps[mid] < t) lo = mid + 1; else hi = mid;
  }
  if (lo > 0 && Math.abs(timestamps[lo - 1] - t) < Math.abs(timestamps[lo] - t)) return timestamps[lo - 1];
  return timestamps[lo];
}

function applySnapPull(rawPx: number, domain: [number, number], plotWidth: number, timestamps: number[]): number {
  const span = domain[1] - domain[0];
  if (plotWidth <= 0 || span <= 0) return rawPx;
  const rawTime = domain[0] + (rawPx / plotWidth) * span;
  const nearestTs = findNearestTimestamp(timestamps, rawTime);
  if (nearestTs === null) return rawPx;
  const nearestPx = ((nearestTs - domain[0]) / span) * plotWidth;
  const distPx = Math.abs(rawPx - nearestPx);
  const normalized = Math.max(0, 1 - distPx / CURSOR_SNAP_PULL_PX);
  return rawPx + normalized * normalized * (nearestPx - rawPx);
}

interface DragState {
  startPx: number;
  currentPx: number;
  startDisplayPx: number;
  currentDisplayPx: number;
  hasMoved: boolean;
}

interface MarkerDragState {
  originalTime: number;
  originalPx: number;
  currentPx: number;
  currentDisplayPx: number;
  hasMoved: boolean;
  mergeTarget: number | null;
}

function interpolateAt(
  values: Array<{ timeOffsetSeconds: number; value: number | null }>,
  time: number,
): number | null {
  if (!values.length) return null;
  if (time <= values[0].timeOffsetSeconds) return values[0].value;
  const last = values[values.length - 1];
  if (time >= last.timeOffsetSeconds) {
    // Clamp up to 10 s past last data point; beyond that treat as no data.
    return time - last.timeOffsetSeconds <= 10 ? last.value : null;
  }
  let lo = 0, hi = values.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (values[mid].timeOffsetSeconds <= time) lo = mid;
    else hi = mid;
  }
  const a = values[lo], b = values[hi];
  if (a.value === null || b.value === null) return null; // inside a gap
  const t = (time - a.timeOffsetSeconds) / (b.timeOffsetSeconds - a.timeOffsetSeconds);
  return a.value + t * (b.value - a.value);
}

function fmtTime(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function fmtDistance(meters: number): string {
  return `${Math.round(meters)} m`;
}

function fmtValue(value: number, name: string, unit: string): string {
  if (name === 'Pace') {
    const t = Math.round(value);
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')} ${unit}`;
  }
  return `${Math.round(value)} ${unit}`;
}

const LABEL_HALF_WIDTH_PX = 60;

function tooltipAnchor(px: number, plotWidth: number): 'start' | 'middle' | 'end' {
  if (px < LABEL_HALF_WIDTH_PX) return 'start';
  if (px > plotWidth - LABEL_HALF_WIDTH_PX) return 'end';
  return 'middle';
}

function TooltipText({ x, y, anchor, children }: { x: number; y: number; anchor?: 'start' | 'middle' | 'end'; children: ReactNode }) {
  return (
    <text
      x={x} y={y}
      textAnchor={anchor ?? 'middle'}
      fontSize={10}
      fontFamily="inherit"
      style={{ fill: 'var(--ink)', stroke: 'var(--plot-bg)', strokeWidth: 2.5, paintOrder: 'stroke' }}
    >
      {children}
    </text>
  );
}

export function ChartZoomOverlay({
  plotWidth,
  plotHeight,
  marginLeft,
  marginTop,
  domain,
  onZoom,
  onZoomReset,
  hoverSeries,
  recordTimestamps,
  markerTimes,
  draggableMarkerTimes,
  onAddMarker,
  onMoveMarker,
  onMergeMarker,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const markerDragRef = useRef<MarkerDragState | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [markerDrag, setMarkerDrag] = useState<MarkerDragState | null>(null);
  const [hoveredMarkerTime, setHoveredMarkerTime] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const isHoveringRef = useRef(false);
  const lastClientPosRef = useRef<{ x: number; y: number } | null>(null);
  const pendingResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flashState, setFlashState] = useState<{ cursorTime: number; closestTime: number } | null>(null);

  const plotWidthRef = useRef(plotWidth);
  const plotHeightRef = useRef(plotHeight);
  const marginLeftRef = useRef(marginLeft);
  const marginTopRef = useRef(marginTop);
  const domainRef = useRef(domain);
  const onZoomRef = useRef(onZoom);
  const onZoomResetRef = useRef(onZoomReset);
  const recordTimestampsRef = useRef(recordTimestamps);
  const markerTimesRef = useRef(markerTimes);
  const draggableMarkerTimesRef = useRef(draggableMarkerTimes);
  const onAddMarkerRef = useRef(onAddMarker);
  const onMoveMarkerRef = useRef(onMoveMarker);
  const onMergeMarkerRef = useRef(onMergeMarker);
  plotWidthRef.current = plotWidth;
  plotHeightRef.current = plotHeight;
  marginLeftRef.current = marginLeft;
  marginTopRef.current = marginTop;
  domainRef.current = domain;
  onZoomRef.current = onZoom;
  onZoomResetRef.current = onZoomReset;
  recordTimestampsRef.current = recordTimestamps;
  markerTimesRef.current = markerTimes;
  draggableMarkerTimesRef.current = draggableMarkerTimes;
  onAddMarkerRef.current = onAddMarker;
  onMoveMarkerRef.current = onMoveMarker;
  onMergeMarkerRef.current = onMergeMarker;

  useEffect(() => {
    const getPlotX = (clientX: number): number => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return 0;
      return Math.max(0, Math.min(clientX - rect.left - marginLeftRef.current, plotWidthRef.current));
    };

    const handleMove = (e: MouseEvent) => {
      lastClientPosRef.current = { x: e.clientX, y: e.clientY };
      const plotX = getPlotX(e.clientX);

      // Zoom drag
      const d = dragRef.current;
      if (d) {
        const currentDisplayPx = applySnapPull(plotX, domainRef.current, plotWidthRef.current, recordTimestampsRef.current);
        const updated: DragState = {
          startPx: d.startPx,
          currentPx: plotX,
          startDisplayPx: d.startDisplayPx,
          currentDisplayPx,
          hasMoved: d.hasMoved || Math.abs(plotX - d.startPx) >= DRAG_THRESHOLD_PX,
        };
        dragRef.current = updated;
        if (updated.hasMoved) {
          if (!d.hasMoved) setHoveredMarkerTime(null);
          setDrag({ ...updated });
        }
      }

      // Marker drag
      const md = markerDragRef.current;
      if (md) {
        const dom = domainRef.current;
        const pw = plotWidthRef.current;
        const allMarkers = markerTimesRef.current;
        const idx = allMarkers.indexOf(md.originalTime);

        let currentTime = dom[0] + (plotX / pw) * (dom[1] - dom[0]);
        if (idx > 0 && currentTime <= allMarkers[idx - 1]) currentTime = allMarkers[idx - 1] + 1;
        if (idx < allMarkers.length - 1 && currentTime >= allMarkers[idx + 1]) currentTime = allMarkers[idx + 1] - 1;
        const clampedPx = ((currentTime - dom[0]) / (dom[1] - dom[0])) * pw;
        const currentDisplayPx = applySnapPull(clampedPx, dom, pw, recordTimestampsRef.current);

        let mergeTarget: number | null = null;
        for (const t of allMarkers) {
          if (t === md.originalTime) continue;
          if (Math.abs(currentTime - t) < MERGE_TOLERANCE_SECONDS) { mergeTarget = t; break; }
        }
        const updated: MarkerDragState = {
          ...md,
          currentPx: clampedPx,
          currentDisplayPx,
          hasMoved: md.hasMoved || Math.abs(clampedPx - md.originalPx) >= DRAG_THRESHOLD_PX,
          mergeTarget,
        };
        markerDragRef.current = updated;
        setMarkerDrag({ ...updated });
        return; // suppress hover pos + detection during marker drag
      }

      if (isHoveringRef.current && !d) {
        const rect = svgRef.current?.getBoundingClientRect();
        if (rect) {
          const y = Math.max(0, Math.min(e.clientY - rect.top - marginTopRef.current, plotHeightRef.current));
          const dom = domainRef.current;
          const pw = plotWidthRef.current;
          const displayX = applySnapPull(plotX, dom, pw, recordTimestampsRef.current);
          setHoverPos({ x: displayX, y });

          let nearest: number | null = null;
          let nearestDist = MARKER_HOVER_PX;
          for (const t of draggableMarkerTimesRef.current) {
            const markerPx = ((t - dom[0]) / (dom[1] - dom[0])) * pw;
            const dist = Math.abs(plotX - markerPx);
            if (dist < nearestDist) { nearestDist = dist; nearest = t; }
          }
          setHoveredMarkerTime(nearest);
        }
      }
    };

    const handleUp = () => {
      // Commit marker drag
      const md = markerDragRef.current;
      if (md) {
        if (md.hasMoved) {
          if (md.mergeTarget !== null) {
            onMergeMarkerRef.current(md.originalTime);
          } else {
            const dom = domainRef.current;
            const pw = plotWidthRef.current;
            const newTime = Math.round(dom[0] + (md.currentDisplayPx / pw) * (dom[1] - dom[0]));
            if (newTime !== md.originalTime) onMoveMarkerRef.current(md.originalTime, newTime);
          }
        }
        markerDragRef.current = null;
        setMarkerDrag(null);
        setHoveredMarkerTime(null);
        const last = lastClientPosRef.current;
        if (last && isHoveringRef.current) {
          const rect = svgRef.current?.getBoundingClientRect();
          if (rect) {
            const plotX = Math.max(0, Math.min(last.x - rect.left - marginLeftRef.current, plotWidthRef.current));
            const y = Math.max(0, Math.min(last.y - rect.top - marginTopRef.current, plotHeightRef.current));
            setHoverPos({ x: applySnapPull(plotX, domainRef.current, plotWidthRef.current, recordTimestampsRef.current), y });
          }
        } else {
          setHoverPos(null);
        }
        return;
      }

      const d = dragRef.current;
      if (!d) return;
      const dom = domainRef.current;
      const pw = plotWidthRef.current;

      if (d.hasMoved) {
        const minPx = Math.min(d.startDisplayPx, d.currentDisplayPx);
        const maxPx = Math.max(d.startDisplayPx, d.currentDisplayPx);
        const t1 = Math.round(dom[0] + (minPx / pw) * (dom[1] - dom[0]));
        const t2 = Math.round(dom[0] + (maxPx / pw) * (dom[1] - dom[0]));
        if (t2 - t1 >= MIN_ZOOM_SECONDS) onZoomRef.current(t1, t2);
      } else {
        if (pendingResetRef.current) clearTimeout(pendingResetRef.current);
        pendingResetRef.current = setTimeout(() => {
          pendingResetRef.current = null;
          onZoomResetRef.current();
        }, CLICK_DELAY_MS);
      }

      dragRef.current = null;
      setDrag(null);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      if (pendingResetRef.current) clearTimeout(pendingResetRef.current);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = Math.max(0, Math.min(e.clientX - rect.left - marginLeft, plotWidth));

    // Check if near a draggable marker → marker drag takes priority
    let nearestMarker: number | null = null;
    let nearestDist = MARKER_HOVER_PX;
    for (const t of draggableMarkerTimes) {
      const markerPx = domSpan > 0 ? ((t - domain[0]) / domSpan) * plotWidth : 0;
      const dist = Math.abs(px - markerPx);
      if (dist < nearestDist) { nearestDist = dist; nearestMarker = t; }
    }

    if (nearestMarker !== null) {
      const markerPx = domSpan > 0 ? ((nearestMarker - domain[0]) / domSpan) * plotWidth : 0;
      const state: MarkerDragState = {
        originalTime: nearestMarker,
        originalPx: markerPx,
        currentPx: markerPx,
        currentDisplayPx: markerPx,
        hasMoved: false,
        mergeTarget: null,
      };
      markerDragRef.current = state;
      setMarkerDrag(state);
    } else {
      const startDisplayPx = applySnapPull(px, domain, plotWidth, recordTimestamps);
      dragRef.current = { startPx: px, currentPx: px, startDisplayPx, currentDisplayPx: startDisplayPx, hasMoved: false };
    }
  };

  const handleDblClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (pendingResetRef.current) {
      clearTimeout(pendingResetRef.current);
      pendingResetRef.current = null;
    }

    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = Math.max(0, Math.min(e.clientX - rect.left - marginLeft, plotWidth));
    const t = Math.round(domain[0] + (px / plotWidth) * (domain[1] - domain[0]));

    const mts = markerTimesRef.current;
    const closest = mts.length > 0
      ? mts.reduce((best, mt) => Math.abs(mt - t) < Math.abs(best - t) ? mt : best)
      : null;
    const dist = closest != null ? Math.abs(t - closest) : Infinity;

    if (dist < SNAP_TOLERANCE_SECONDS) {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      setFlashState({ cursorTime: t, closestTime: closest! });
      flashTimerRef.current = setTimeout(() => setFlashState(null), 650);
    } else {
      onAddMarkerRef.current(t);
    }
  };

  const selX = drag ? Math.min(drag.startDisplayPx, drag.currentDisplayPx) : 0;
  const selW = drag ? Math.abs(drag.currentDisplayPx - drag.startDisplayPx) : 0;

  const hoverTime = hoverPos ? domain[0] + (hoverPos.x / plotWidth) * (domain[1] - domain[0]) : null;
  const labelOnLeft = hoverPos ? hoverPos.x > plotWidth * 0.65 : false;
  const labelX = hoverPos ? (labelOnLeft ? hoverPos.x - 6 : hoverPos.x + 6) : 0;

  const allHoverLabels =
    hoverPos && hoverTime != null
      ? hoverSeries
          .map((s) => {
            const value = interpolateAt(s.values, hoverTime);
            if (value == null) return null;
            return { name: s.name, color: s.color, unit: s.unit, value };
          })
          .filter((x): x is NonNullable<typeof x> => x != null)
      : [];
  const primaryLabels = allHoverLabels.filter((l) => l.name !== 'Elevation' && l.name !== 'Distance');
  const elevationLabel = allHoverLabels.find((l) => l.name === 'Elevation') ?? null;
  const distanceLabel = allHoverLabels.find((l) => l.name === 'Distance') ?? null;

  const domSpan = domain[1] - domain[0];

  const toPx = (t: number) => domSpan > 0 ? ((t - domain[0]) / domSpan) * plotWidth : 0;

  // Drag marker derived values
  const dragCurrentTime = markerDrag && plotWidth > 0
    ? domain[0] + (markerDrag.currentDisplayPx / plotWidth) * domSpan
    : null;
  const dragIsMerging = markerDrag?.mergeTarget != null;

  const allDragLabels = dragCurrentTime != null
    ? hoverSeries
        .map((s) => {
          const value = interpolateAt(s.values, dragCurrentTime);
          if (value == null) return null;
          return { name: s.name, color: s.color, unit: s.unit, value };
        })
        .filter((x): x is NonNullable<typeof x> => x != null)
    : [];
  const dragPrimaryLabels = allDragLabels.filter((l) => l.name !== 'Elevation' && l.name !== 'Distance');
  const dragElevationLabel = allDragLabels.find((l) => l.name === 'Elevation') ?? null;
  const dragDistanceLabel = allDragLabels.find((l) => l.name === 'Distance') ?? null;
  const dragLabelOnLeft = markerDrag ? markerDrag.currentDisplayPx > plotWidth * 0.65 : false;
  const dragLabelX = markerDrag ? (dragLabelOnLeft ? markerDrag.currentDisplayPx - 6 : markerDrag.currentDisplayPx + 6) : 0;

  const cursor = markerDrag ? 'grabbing' : hoveredMarkerTime != null ? 'grab' : 'crosshair';

  return (
    <svg
      ref={svgRef}
      className="chart-overlay"
      style={{ cursor }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDblClick}
      onMouseEnter={() => { isHoveringRef.current = true; }}
      onMouseLeave={() => { isHoveringRef.current = false; setHoverPos(null); setHoveredMarkerTime(null); }}
    >
      <g transform={`translate(${marginLeft}, ${marginTop})`}>

        {/* Static markers */}
        {markerTimes.map((t) => {
          const px = toPx(t);
          if (px < -4 || px > plotWidth + 4) return null;
          const isDragging = markerDrag?.originalTime === t;
          if (isDragging) return null;
          const isMergeTarget = markerDrag?.mergeTarget === t;
          const isHovered = hoveredMarkerTime === t;
          const red = isMergeTarget;
          const amber = isHovered && !red;
          const stroke = red ? '#b8321f' : amber ? '#b85a18' : '#a8a59a';
          const sw = red || amber ? 1.5 : 0.75;
          return (
            <g key={t}>
              {(red || amber) && (
                <line x1={px} y1={0} x2={px} y2={plotHeight}
                  stroke={stroke} strokeWidth={9} strokeOpacity={0.18} />
              )}
              <line x1={px} y1={0} x2={px} y2={plotHeight} stroke={stroke} strokeWidth={sw} />
            </g>
          );
        })}

        {/* Zoom selection */}
        {drag?.hasMoved && selW > 0 && (
          <>
            <rect x={selX} y={0} width={selW} height={plotHeight} className="zoom-selection" />
            <TooltipText x={selX} y={-4}>
              {fmtTime(domain[0] + (selX / plotWidth) * (domain[1] - domain[0]))}
            </TooltipText>
            <TooltipText x={selX + selW} y={-4}>
              {fmtTime(domain[0] + ((selX + selW) / plotWidth) * (domain[1] - domain[0]))}
            </TooltipText>
          </>
        )}

        {/* Dragged marker */}
        {markerDrag && dragCurrentTime != null && (
          <>
            <line
              x1={markerDrag.currentDisplayPx} y1={0} x2={markerDrag.currentDisplayPx} y2={plotHeight}
              stroke={dragIsMerging ? '#b8321f' : '#b85a18'}
              strokeWidth={9} strokeOpacity={0.2}
            />
            <line
              x1={markerDrag.currentDisplayPx} y1={0} x2={markerDrag.currentDisplayPx} y2={plotHeight}
              stroke={dragIsMerging ? '#b8321f' : '#b85a18'}
              strokeWidth={1.5}
            />
            <TooltipText x={markerDrag.currentDisplayPx} y={-4} anchor={tooltipAnchor(markerDrag.currentDisplayPx, plotWidth)}>
              {fmtTime(dragCurrentTime)}{dragDistanceLabel != null ? ` · ${fmtDistance(dragDistanceLabel.value)}` : ''}
            </TooltipText>
            {dragPrimaryLabels.map((label, i) => (
              <text
                key={label.name}
                x={dragLabelX}
                y={10 + i * 13}
                textAnchor={dragLabelOnLeft ? 'end' : 'start'}
                fontSize={10}
                fontFamily="inherit"
                style={{ fill: label.color, stroke: 'var(--plot-bg)', strokeWidth: 2.5, paintOrder: 'stroke' }}
              >
                {fmtValue(label.value, label.name, label.unit)}
              </text>
            ))}
            {dragElevationLabel && (
              <text
                x={dragLabelX}
                y={plotHeight - 8}
                textAnchor={dragLabelOnLeft ? 'end' : 'start'}
                fontSize={10}
                fontFamily="inherit"
                style={{ fill: dragElevationLabel.color, stroke: 'var(--plot-bg)', strokeWidth: 2.5, paintOrder: 'stroke' }}
              >
                {fmtValue(dragElevationLabel.value, dragElevationLabel.name, dragElevationLabel.unit)}
              </text>
            )}
          </>
        )}

        {/* Hover cursor (suppressed during marker drag) */}
        {hoverPos && !drag && !markerDrag && (
          <>
            <line
              x1={hoverPos.x} y1={0} x2={hoverPos.x} y2={plotHeight}
              stroke="#4a9068" strokeWidth={0.5} strokeOpacity={0.9}
            />
            <TooltipText x={hoverPos.x} y={-4} anchor={tooltipAnchor(hoverPos.x, plotWidth)}>
              {fmtTime(hoverTime!)}{distanceLabel ? ` · ${fmtDistance(distanceLabel.value)}` : ''}
            </TooltipText>
            {primaryLabels.map((label, i) => (
              <text
                key={label.name}
                x={labelX}
                y={10 + i * 13}
                textAnchor={labelOnLeft ? 'end' : 'start'}
                fontSize={10}
                fontFamily="inherit"
                style={{ fill: label.color, stroke: 'var(--plot-bg)', strokeWidth: 2.5, paintOrder: 'stroke' }}
              >
                {fmtValue(label.value, label.name, label.unit)}
              </text>
            ))}
            {elevationLabel && (
              <text
                x={labelX}
                y={plotHeight - 8}
                textAnchor={labelOnLeft ? 'end' : 'start'}
                fontSize={10}
                fontFamily="inherit"
                style={{ fill: elevationLabel.color, stroke: 'var(--plot-bg)', strokeWidth: 2.5, paintOrder: 'stroke' }}
              >
                {fmtValue(elevationLabel.value, elevationLabel.name, elevationLabel.unit)}
              </text>
            )}
          </>
        )}

        {/* Flash lines (double-click blocked) */}
        {flashState && domSpan > 0 && (() => {
          const cursorPx = toPx(flashState.cursorTime);
          const closestPx = toPx(flashState.closestTime);
          return (
            <>
              <line x1={cursorPx} y1={0} x2={cursorPx} y2={plotHeight}
                stroke="#b8321f" strokeWidth={2} className="chart-flash-line" />
              {Math.abs(closestPx - cursorPx) > 1 && (
                <line x1={closestPx} y1={0} x2={closestPx} y2={plotHeight}
                  stroke="#b8321f" strokeWidth={2} className="chart-flash-line" />
              )}
            </>
          );
        })()}
      </g>
    </svg>
  );
}
