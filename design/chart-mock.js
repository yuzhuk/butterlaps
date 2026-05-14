// Shared chart renderer — takes a palette and a font config, renders the chart SVG.
// Used by all 3 direction mocks so they're structurally identical.

(function () {
  const { useMemo } = React;

  // Generate elevation profile + series once, deterministically.
  // Roughly matches the shape visible in the source screenshot.
  const SAMPLES = 320;

  // Elevation: rolling hills, dip then rise
  function elevAt(t) {
    return (
      40 +
      18 * Math.sin(t * Math.PI * 1.7) +
      10 * Math.sin(t * Math.PI * 4.3 + 1.2) +
      -25 * Math.exp(-Math.pow((t - 0.18) / 0.08, 2)) + // early dip
      14 * Math.exp(-Math.pow((t - 0.55) / 0.12, 2)) +  // mid hill
      -8 * t
    );
  }
  // Pace (s/km): faster (lower) on flats, slower on dips. Range ~260–420.
  function paceAt(t) {
    if (t < 0.08) return 360 + 80 * Math.sin(t * 40);
    if (t < 0.22) return 410 + 30 * Math.sin(t * 50); // slow recovery
    return 290 + 35 * Math.sin(t * 18 + 0.5) + 15 * Math.sin(t * 70);
  }
  // Power (W): tracks effort; bursts during fast laps.
  function powerAt(t) {
    if (t < 0.12) return 240 + 20 * Math.sin(t * 25);
    if (t < 0.22) return 290 + 40 * Math.sin(t * 35);
    return 295 + 30 * Math.sin(t * 22 + 0.8) + 15 * Math.sin(t * 90);
  }
  // HR (bpm): drifts upward over the run.
  function hrAt(t) {
    if (t < 0.05) return 100 + t * 200;
    if (t < 0.2) return 125 + t * 40;
    return 145 + (t - 0.2) * 30 + 5 * Math.sin(t * 12);
  }

  const elev = window.genSeries(11, SAMPLES, elevAt);
  const pace = window.genSeries(23, SAMPLES, paceAt);
  const power = window.genSeries(41, SAMPLES, powerAt);
  const hr = window.genSeries(67, SAMPLES, hrAt);

  // Time ticks for x-axis
  const TICKS = [
    { t: 600, label: "10:00" },
    { t: 1200, label: "20:00" },
    { t: 1800, label: "30:00" },
    { t: 2400, label: "40:00" },
    { t: 3182, label: "53:02" },
  ];

  // Lap boundary x-positions as ratios (cumulative from row.start / total)
  const LAP_BOUNDS = (() => {
    const total = window.LAP_DATA.totalDurationSec;
    // skip 0 (start) and end; show internal boundaries
    return window.LAP_DATA.rows.slice(1).map((r) => r.start / total);
  })();

  function fmtPace(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  /**
   * Props:
   *   width, height            chart wrapper px
   *   palette                  { paceLine, powerLine, hrLine, elevStroke, elevFillTop, elevFillBot, lapLine, axis, axisText, hairline, plotBg, hover }
   *   theme                    "almanac" | "studio" | "telemetry"
   *   showHover                bool — render hover crosshair + value chip
   *   hoverPct                 0..1
   *   fonts                    { num, label }  CSS font-family strings
   *   yPadding                 axis label inset
   */
  window.ChartMock = function ChartMock({
    width = 760,
    height = 300,
    palette,
    theme = "almanac",
    showHover = true,
    hoverPct = 0.14,
    fonts = { num: "monospace", label: "monospace" },
    showElevation = true,
    showPace = true,
    showPower = true,
    showHR = true,
  }) {
    const padL = 8;
    const padR = 8;
    const padT = 18;
    const padB = 28;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    // y-domains per series
    const elevYMin = Math.min(...elev.map((p) => p.y)) - 8;
    const elevYMax = Math.max(...elev.map((p) => p.y)) + 8;
    const paceYMin = Math.min(...pace.map((p) => p.y)) - 20;
    const paceYMax = Math.max(...pace.map((p) => p.y)) + 20;
    const powerYMin = Math.min(...power.map((p) => p.y)) - 25;
    const powerYMax = Math.max(...power.map((p) => p.y)) + 25;
    const hrYMin = Math.min(...hr.map((p) => p.y)) - 5;
    const hrYMax = Math.max(...hr.map((p) => p.y)) + 10;

    // hover values
    const hoverIdx = Math.round(hoverPct * (SAMPLES - 1));
    const hoverPaceV = pace[hoverIdx].y;
    const hoverPowerV = power[hoverIdx].y;
    const hoverHRV = hr[hoverIdx].y;
    const hoverElevV = elev[hoverIdx].y;
    const hoverTimeSec = Math.round(hoverPct * window.LAP_DATA.totalDurationSec);

    // y-coord of each series at hover
    const yAt = (series, yMin, yMax, inverted = false) => {
      let yNorm = (series[hoverIdx].y - yMin) / (yMax - yMin);
      if (inverted) yNorm = 1 - yNorm;
      return (1 - yNorm) * plotH + padT;
    };

    return React.createElement(
      "svg",
      {
        viewBox: `0 0 ${width} ${height}`,
        width: width,
        height: height,
        style: { display: "block", overflow: "visible" },
      },
      // plot bg
      palette.plotBg &&
        React.createElement("rect", {
          x: padL,
          y: padT,
          width: plotW,
          height: plotH,
          fill: palette.plotBg,
        }),
      // gridlines (light, theme dependent)
      palette.grid &&
        [0.25, 0.5, 0.75].map((p, i) =>
          React.createElement("line", {
            key: `gl${i}`,
            x1: padL,
            x2: padL + plotW,
            y1: padT + p * plotH,
            y2: padT + p * plotH,
            stroke: palette.grid,
            strokeWidth: 0.5,
            strokeDasharray: theme === "telemetry" ? "2 4" : null,
          })
        ),
      // elevation area
      showElevation &&
        React.createElement(
          "g",
          { key: "elev" },
          palette.elevGradientId &&
            React.createElement(
              "defs",
              null,
              React.createElement(
                "linearGradient",
                { id: palette.elevGradientId, x1: 0, y1: 0, x2: 0, y2: 1 },
                React.createElement("stop", { offset: "0%", stopColor: palette.elevFillTop, stopOpacity: 1 }),
                React.createElement("stop", { offset: "100%", stopColor: palette.elevFillBot, stopOpacity: theme === "telemetry" ? 0.05 : 0.15 })
              )
            ),
          React.createElement("path", {
            d: window.toAreaPath(
              elev.map((p) => ({ x: p.x, y: p.y })),
              plotW,
              plotH,
              elevYMin,
              elevYMax
            ),
            transform: `translate(${padL}, ${padT})`,
            fill: palette.elevGradientId ? `url(#${palette.elevGradientId})` : palette.elevFillTop,
            stroke: palette.elevStroke,
            strokeWidth: 1,
            opacity: 1,
          })
        ),
      // lap boundary lines
      React.createElement(
        "g",
        { key: "lapbounds" },
        LAP_BOUNDS.map((p, i) =>
          React.createElement("line", {
            key: `lb${i}`,
            x1: padL + p * plotW,
            x2: padL + p * plotW,
            y1: padT,
            y2: padT + plotH,
            stroke: palette.lapLine,
            strokeWidth: 1,
            opacity: theme === "telemetry" ? 0.55 : 0.65,
          })
        )
      ),
      // pace
      showPace &&
        React.createElement("path", {
          d: window.toPolyPath(pace, plotW, plotH, paceYMin, paceYMax, true),
          transform: `translate(${padL}, ${padT})`,
          fill: "none",
          stroke: palette.paceLine,
          strokeWidth: theme === "telemetry" ? 1.25 : 1.5,
          strokeLinejoin: "round",
        }),
      // power
      showPower &&
        React.createElement("path", {
          d: window.toPolyPath(power, plotW, plotH, powerYMin, powerYMax),
          transform: `translate(${padL}, ${padT})`,
          fill: "none",
          stroke: palette.powerLine,
          strokeWidth: theme === "telemetry" ? 1.25 : 1.5,
          strokeLinejoin: "round",
          opacity: 0.95,
        }),
      // hr
      showHR &&
        React.createElement("path", {
          d: window.toPolyPath(hr, plotW, plotH, hrYMin, hrYMax),
          transform: `translate(${padL}, ${padT})`,
          fill: "none",
          stroke: palette.hrLine,
          strokeWidth: theme === "telemetry" ? 1.25 : 1.5,
          strokeLinejoin: "round",
        }),

      // hover crosshair + dots + chip
      showHover &&
        React.createElement(
          "g",
          { key: "hover" },
          React.createElement("line", {
            x1: padL + hoverPct * plotW,
            x2: padL + hoverPct * plotW,
            y1: padT,
            y2: padT + plotH,
            stroke: palette.hoverLine || palette.axis,
            strokeWidth: 0.75,
            strokeDasharray: theme === "almanac" ? null : "2 3",
            opacity: 0.7,
          }),
          showPace &&
            React.createElement("circle", {
              cx: padL + hoverPct * plotW,
              cy: yAt(pace, paceYMin, paceYMax, true),
              r: 3,
              fill: palette.paceLine,
            }),
          showPower &&
            React.createElement("circle", {
              cx: padL + hoverPct * plotW,
              cy: yAt(power, powerYMin, powerYMax),
              r: 3,
              fill: palette.powerLine,
            }),
          showHR &&
            React.createElement("circle", {
              cx: padL + hoverPct * plotW,
              cy: yAt(hr, hrYMin, hrYMax),
              r: 3,
              fill: palette.hrLine,
            }),

          // hover label cluster, top-left of cursor
          React.createElement(
            "g",
            {
              transform: `translate(${padL + hoverPct * plotW + 8}, ${padT + 8})`,
              fontFamily: fonts.num,
              fontSize: 11,
            },
            // time · elevation
            React.createElement(
              "text",
              { x: 0, y: 0, fill: palette.elevStroke, fontWeight: 500 },
              `${window.fmtDur(hoverTimeSec)} · ${Math.round(hoverElevV * 12)} m`
            ),
            // pace
            showPace &&
              React.createElement(
                "text",
                { x: 0, y: 14, fill: palette.paceLine, fontWeight: 600 },
                `${fmtPace(hoverPaceV)} /km`
              ),
            showPower &&
              React.createElement(
                "text",
                { x: 0, y: 28, fill: palette.powerLine, fontWeight: 600 },
                `${Math.round(hoverPowerV)} W`
              ),
            showHR &&
              React.createElement(
                "text",
                { x: 0, y: 42, fill: palette.hrLine, fontWeight: 600 },
                `${Math.round(hoverHRV)} bpm`
              )
          )
        ),

      // x-axis line
      React.createElement("line", {
        x1: padL,
        x2: padL + plotW,
        y1: padT + plotH + 0.5,
        y2: padT + plotH + 0.5,
        stroke: palette.axis,
        strokeWidth: 1,
      }),
      // x-axis ticks + labels
      TICKS.map((tk, i) => {
        const px = padL + (tk.t / 3182) * plotW;
        return React.createElement(
          "g",
          { key: `t${i}` },
          React.createElement("line", {
            x1: px,
            x2: px,
            y1: padT + plotH,
            y2: padT + plotH + 4,
            stroke: palette.axis,
          }),
          React.createElement(
            "text",
            {
              x: px,
              y: padT + plotH + 16,
              fill: palette.axisText,
              fontSize: 11,
              fontFamily: fonts.num,
              textAnchor: "middle",
            },
            tk.label
          )
        );
      })
    );
  };
})();
