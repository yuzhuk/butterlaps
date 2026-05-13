import { useRef, useState, useEffect } from 'react';

const DRAG_THRESHOLD_PX = 5;
const MIN_ZOOM_SECONDS = 10;

export interface HoverSeriesInfo {
  name: string;
  color: string;
  unit: string;
  values: Array<{ timeOffsetSeconds: number; value: number }>;
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
}

interface DragState {
  startPx: number;
  currentPx: number;
  hasMoved: boolean;
}

function interpolateAt(
  values: Array<{ timeOffsetSeconds: number; value: number }>,
  time: number,
): number | null {
  if (!values.length) return null;
  if (time <= values[0].timeOffsetSeconds) return values[0].value;
  const last = values[values.length - 1];
  if (time >= last.timeOffsetSeconds) return last.value;
  let lo = 0, hi = values.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (values[mid].timeOffsetSeconds <= time) lo = mid;
    else hi = mid;
  }
  const a = values[lo], b = values[hi];
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

function fmtValue(value: number, name: string, unit: string): string {
  if (name === 'Pace') {
    const t = Math.round(value);
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')} ${unit}`;
  }
  return `${Math.round(value)} ${unit}`;
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
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const isHoveringRef = useRef(false);

  const plotWidthRef = useRef(plotWidth);
  const plotHeightRef = useRef(plotHeight);
  const marginLeftRef = useRef(marginLeft);
  const marginTopRef = useRef(marginTop);
  const domainRef = useRef(domain);
  const onZoomRef = useRef(onZoom);
  const onZoomResetRef = useRef(onZoomReset);
  plotWidthRef.current = plotWidth;
  plotHeightRef.current = plotHeight;
  marginLeftRef.current = marginLeft;
  marginTopRef.current = marginTop;
  domainRef.current = domain;
  onZoomRef.current = onZoom;
  onZoomResetRef.current = onZoomReset;

  useEffect(() => {
    const getPlotX = (clientX: number): number => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return 0;
      return Math.max(0, Math.min(clientX - rect.left - marginLeftRef.current, plotWidthRef.current));
    };

    const handleMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (d) {
        const px = getPlotX(e.clientX);
        const updated: DragState = {
          startPx: d.startPx,
          currentPx: px,
          hasMoved: d.hasMoved || Math.abs(px - d.startPx) >= DRAG_THRESHOLD_PX,
        };
        dragRef.current = updated;
        setDrag({ ...updated });
      }

      if (isHoveringRef.current) {
        const rect = svgRef.current?.getBoundingClientRect();
        if (rect) {
          const x = Math.max(0, Math.min(e.clientX - rect.left - marginLeftRef.current, plotWidthRef.current));
          const y = Math.max(0, Math.min(e.clientY - rect.top - marginTopRef.current, plotHeightRef.current));
          setHoverPos({ x, y });
        }
      }
    };

    const handleUp = () => {
      const d = dragRef.current;
      if (!d) return;
      const dom = domainRef.current;
      const pw = plotWidthRef.current;

      if (d.hasMoved) {
        const minPx = Math.min(d.startPx, d.currentPx);
        const maxPx = Math.max(d.startPx, d.currentPx);
        const t1 = Math.round(dom[0] + (minPx / pw) * (dom[1] - dom[0]));
        const t2 = Math.round(dom[0] + (maxPx / pw) * (dom[1] - dom[0]));
        if (t2 - t1 >= MIN_ZOOM_SECONDS) onZoomRef.current(t1, t2);
      } else {
        onZoomResetRef.current();
      }

      dragRef.current = null;
      setDrag(null);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = Math.max(0, Math.min(e.clientX - rect.left - marginLeft, plotWidth));
    const state: DragState = { startPx: px, currentPx: px, hasMoved: false };
    dragRef.current = state;
    setDrag(state);
  };

  const selX = drag ? Math.min(drag.startPx, drag.currentPx) : 0;
  const selW = drag ? Math.abs(drag.currentPx - drag.startPx) : 0;

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
  const primaryLabels = allHoverLabels.filter((l) => l.name !== 'Elevation');
  const elevationLabel = allHoverLabels.find((l) => l.name === 'Elevation') ?? null;

  return (
    <svg
      ref={svgRef}
      className="chart-overlay"
      onMouseDown={handleMouseDown}
      onMouseEnter={() => { isHoveringRef.current = true; }}
      onMouseLeave={() => { isHoveringRef.current = false; setHoverPos(null); }}
    >
      <g transform={`translate(${marginLeft}, ${marginTop})`}>
        {drag?.hasMoved && selW > 0 && (
          <>
            <rect x={selX} y={0} width={selW} height={plotHeight} className="zoom-selection" />
            <text
              x={selX}
              y={-4}
              textAnchor="middle"
              fontSize={10}
              fontFamily="inherit"
              fill="#374151"
              stroke="white"
              strokeWidth={2.5}
              paintOrder="stroke"
            >
              {fmtTime(domain[0] + (selX / plotWidth) * (domain[1] - domain[0]))}
            </text>
            <text
              x={selX + selW}
              y={-4}
              textAnchor="middle"
              fontSize={10}
              fontFamily="inherit"
              fill="#374151"
              stroke="white"
              strokeWidth={2.5}
              paintOrder="stroke"
            >
              {fmtTime(domain[0] + ((selX + selW) / plotWidth) * (domain[1] - domain[0]))}
            </text>
          </>
        )}

        {hoverPos && !drag && (
          <>
            <line
              x1={hoverPos.x} y1={0}
              x2={hoverPos.x} y2={plotHeight}
              stroke="#22c55e"
              strokeWidth={0.5}
              strokeOpacity={0.85}
            />
            <text
              x={hoverPos.x}
              y={-4}
              textAnchor="middle"
              fontSize={10}
              fontFamily="inherit"
              fill="#374151"
              stroke="white"
              strokeWidth={2.5}
              paintOrder="stroke"
            >
              {fmtTime(hoverTime!)}
            </text>
            {primaryLabels.map((label, i) => (
              <text
                key={label.name}
                x={labelX}
                y={10 + i * 13}
                textAnchor={labelOnLeft ? 'end' : 'start'}
                fontSize={10}
                fontFamily="inherit"
                fill={label.color}
                stroke="white"
                strokeWidth={2.5}
                paintOrder="stroke"
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
                fill={elevationLabel.color}
                stroke="white"
                strokeWidth={2.5}
                paintOrder="stroke"
              >
                {fmtValue(elevationLabel.value, elevationLabel.name, elevationLabel.unit)}
              </text>
            )}
          </>
        )}
      </g>
    </svg>
  );
}
