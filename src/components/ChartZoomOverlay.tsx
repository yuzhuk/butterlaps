import { useRef, useState, useEffect } from 'react';

const DRAG_THRESHOLD_PX = 5;
const MIN_ZOOM_SECONDS = 10;

interface Props {
  plotWidth: number;
  plotHeight: number;
  marginLeft: number;
  marginTop: number;
  domain: [number, number];
  onZoom: (start: number, end: number) => void;
  onZoomReset: () => void;
}

interface DragState {
  startPx: number;
  currentPx: number;
  hasMoved: boolean;
}

export function ChartZoomOverlay({
  plotWidth,
  plotHeight,
  marginLeft,
  marginTop,
  domain,
  onZoom,
  onZoomReset,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  // Keep mutable refs current on every render so the stable effect closure
  // always reads the latest values without needing to re-register listeners.
  const plotWidthRef = useRef(plotWidth);
  const marginLeftRef = useRef(marginLeft);
  const domainRef = useRef(domain);
  const onZoomRef = useRef(onZoom);
  const onZoomResetRef = useRef(onZoomReset);
  plotWidthRef.current = plotWidth;
  marginLeftRef.current = marginLeft;
  domainRef.current = domain;
  onZoomRef.current = onZoom;
  onZoomResetRef.current = onZoomReset;

  useEffect(() => {
    const getPlotPx = (clientX: number): number => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return 0;
      return Math.max(0, Math.min(clientX - rect.left - marginLeftRef.current, plotWidthRef.current));
    };

    const handleMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const px = getPlotPx(e.clientX);
      const updated: DragState = {
        startPx: d.startPx,
        currentPx: px,
        hasMoved: d.hasMoved || Math.abs(px - d.startPx) >= DRAG_THRESHOLD_PX,
      };
      dragRef.current = updated;
      setDrag({ ...updated });
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

  return (
    <svg ref={svgRef} className="chart-overlay" onMouseDown={handleMouseDown}>
      <g transform={`translate(${marginLeft}, ${marginTop})`}>
        {drag?.hasMoved && selW > 0 && (
          <rect x={selX} y={0} width={selW} height={plotHeight} className="zoom-selection" />
        )}
      </g>
    </svg>
  );
}
