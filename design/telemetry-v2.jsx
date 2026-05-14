// Direction — refined Telemetry, light + dark, wide + compact.
// Now mirrors the lap-editor source layout:
//   - left column: chart (top) + change summary + export (bottom)
//   - right column: lap table (full height) with Reset button in its header
// Plus: activity metrics collapsed into a single inline color-coded line.

(function () {
  const D = window.LAP_DATA;

  /** Palettes ------------------------------------------------------------ */

  function darkPalette() {
    return {
      paceLine: "#b4a4ff",
      powerLine: "#ffaa48",
      hrLine: "#ff5a4a",
      cadence: "#5fd29a",
      elevStroke: "#7a7d80",
      elevFillTop: "#3a3d40",
      elevFillBot: "#3a3d40",
      elevGradientId: "telv2-dark-elev",
      lapLine: "#857653",
      axis: "#3a3f44",
      axisText: "#7a7d80",
      hoverLine: "#ece7d7",
      grid: "#1f2327",
      plotBg: "#0c0f12",
    };
  }
  function lightPalette() {
    return {
      paceLine: "#4f3bcc",
      powerLine: "#c5701b",
      hrLine: "#b8321f",
      cadence: "#2e7a4e",
      elevStroke: "#9d9a90",
      elevFillTop: "#d8d5cb",
      elevFillBot: "#e6e3d9",
      elevGradientId: "telv2-light-elev",
      lapLine: "#2f2c25",
      axis: "#aeaba0",
      axisText: "#6e6b62",
      hoverLine: "#1a1a18",
      grid: "#e0ddd3",
      plotBg: "#fcfbf6",
    };
  }

  /** Inline icons -------------------------------------------------------- */

  const IconCrosshair = () =>
    React.createElement(
      "svg",
      { width: 12, height: 12, viewBox: "0 0 12 12", fill: "none", stroke: "currentColor", strokeWidth: 1.3, strokeLinecap: "round" },
      React.createElement("circle", { cx: 6, cy: 6, r: 2.4 }),
      React.createElement("path", { d: "M6 0.5 L6 3" }),
      React.createElement("path", { d: "M6 9 L6 11.5" }),
      React.createElement("path", { d: "M0.5 6 L3 6" }),
      React.createElement("path", { d: "M9 6 L11.5 6" })
    );

  const IconMerge = () =>
    React.createElement(
      "svg",
      { width: 11, height: 11, viewBox: "0 0 11 11", fill: "none", strokeWidth: 1.6, stroke: "currentColor", strokeLinecap: "round" },
      React.createElement("path", { d: "M2 2 L9 9" }),
      React.createElement("path", { d: "M9 2 L2 9" })
    );

  const IconUpload = () =>
    React.createElement(
      "svg",
      { width: 13, height: 13, viewBox: "0 0 13 13", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" },
      React.createElement("path", { d: "M6.5 9.5 L6.5 1.5" }),
      React.createElement("path", { d: "M3 5 L6.5 1.5 L10 5" }),
      React.createElement("path", { d: "M1.5 11.5 L11.5 11.5" })
    );

  const IconDownload = () =>
    React.createElement(
      "svg",
      { width: 13, height: 13, viewBox: "0 0 13 13", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" },
      React.createElement("path", { d: "M6.5 1.5 L6.5 9.5" }),
      React.createElement("path", { d: "M3 6 L6.5 9.5 L10 6" }),
      React.createElement("path", { d: "M1.5 11.5 L11.5 11.5" })
    );

  const IconSun = () =>
    React.createElement(
      "svg",
      { width: 13, height: 13, viewBox: "0 0 13 13", fill: "none", stroke: "currentColor", strokeWidth: 1.3, strokeLinecap: "round" },
      React.createElement("circle", { cx: 6.5, cy: 6.5, r: 2.4 }),
      ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const a = (i * Math.PI) / 4;
        const x1 = 6.5 + Math.cos(a) * 3.9;
        const y1 = 6.5 + Math.sin(a) * 3.9;
        const x2 = 6.5 + Math.cos(a) * 5.3;
        const y2 = 6.5 + Math.sin(a) * 5.3;
        return React.createElement("path", { key: i, d: `M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}` });
      })
    );

  const IconMoon = () =>
    React.createElement(
      "svg",
      { width: 13, height: 13, viewBox: "0 0 13 13", fill: "currentColor" },
      React.createElement("path", { d: "M10.5 8.2 A5 5 0 1 1 4.8 2.5 A4 4 0 0 0 10.5 8.2 Z" })
    );

  // System / auto: half-filled circle suggests "both modes"
  const IconSystem = () =>
    React.createElement(
      "svg",
      { width: 13, height: 13, viewBox: "0 0 13 13", fill: "none", stroke: "currentColor", strokeWidth: 1.2 },
      React.createElement("circle", { cx: 6.5, cy: 6.5, r: 4.4 }),
      // right half filled
      React.createElement("path", { d: "M6.5 2.1 A4.4 4.4 0 0 1 6.5 10.9 Z", fill: "currentColor", stroke: "none" })
    );

  /** Cell helpers -------------------------------------------------------- */

  function ColUnit({ children }) {
    return React.createElement("span", { className: "tv2-unit" }, children);
  }

  function LapRow({ row, isLast }) {
    return React.createElement(
      "tr",
      null,
      React.createElement(
        "td",
        { className: "lap-num" },
        React.createElement("span", { className: "lap-num-text" }, "L" + String(row.n).padStart(2, "0")),
        !isLast &&
          React.createElement(
            "button",
            { type: "button", className: "merge-btn", title: "Merge" },
            React.createElement(IconMerge, null)
          )
      ),
      React.createElement("td", null, window.fmtDur(row.start)),
      React.createElement("td", null, window.fmtDur(row.dur)),
      React.createElement("td", null, row.dist.toLocaleString(), React.createElement(ColUnit, null, "m")),
      React.createElement("td", { className: "cell-pace" }, window.fmtPace(row.pace), React.createElement(ColUnit, null, "/km")),
      React.createElement("td", { className: "cell-power" }, row.power, React.createElement(ColUnit, null, "W")),
      React.createElement("td", { className: "cell-hr" }, row.hr, React.createElement(ColUnit, null, "bpm")),
      React.createElement("td", { className: "cell-cad" }, row.cad, React.createElement(ColUnit, null, "spm"))
    );
  }

  function Toggle({ label, active, color }) {
    return React.createElement(
      "button",
      {
        type: "button",
        className: `tv2-toggle ${active ? "is-on" : ""}`,
        style: active ? { color, borderColor: color } : null,
      },
      React.createElement("span", {
        className: "tv2-toggle__led",
        style: active ? { background: color, boxShadow: `0 0 6px ${color}` } : null,
      }),
      label
    );
  }

  /**
   * Inline metric: small key + value + unit. Series classes color the value
   * to match the chart line.
   */
  function Metric({ label, value, unit, klass }) {
    return React.createElement(
      "span",
      { className: `metric ${klass || ""}` },
      React.createElement("span", { className: "m-k" }, label),
      React.createElement("span", { className: "m-v" }, value),
      unit && React.createElement("span", { className: "m-u" }, unit)
    );
  }

  /** Main view ----------------------------------------------------------- */

  // Resolve a theme setting (light | dark | system) to an actual mode for CSS.
  function resolveTheme(theme) {
    if (theme === "system") {
      try {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      } catch (e) {
        return "light";
      }
    }
    return theme;
  }

  const THEME_CYCLE = { light: "dark", dark: "system", system: "light" };
  const THEME_NEXT_LABEL = { light: "dark", dark: "system", system: "light" };

  window.TelemetryV2View = function TelemetryV2View({ theme = "dark", layout = "wide", onThemeChange }) {
    const resolved = resolveTheme(theme);
    const palette = resolved === "dark" ? darkPalette() : lightPalette();
    const chartW = layout === "compact" ? 640 : 700;
    const chartH = layout === "compact" ? 300 : 320;

    const chartChips = React.createElement(
      "div",
      { className: "chips" },
      React.createElement(Toggle, { label: "ELEV", active: true, color: palette.elevStroke }),
      React.createElement(Toggle, { label: "PACE", active: true, color: palette.paceLine }),
      React.createElement(Toggle, { label: "PWR", active: true, color: palette.powerLine }),
      React.createElement(Toggle, { label: "HR", active: true, color: palette.hrLine }),
      React.createElement(Toggle, { label: "CAD", active: false, color: palette.cadence })
    );

    const chartFigure = React.createElement(
      "div",
      { className: "plot" },
      React.createElement(
        "div",
        { className: "plot__corner plot__corner--tl" },
        React.createElement("span", null, "T 00:00"),
        React.createElement("span", null, "0.000 km")
      ),
      React.createElement(
        "div",
        { className: "plot__corner plot__corner--tr" },
        React.createElement("span", null, "T 53:02"),
        React.createElement("span", null, "10.034 km")
      ),
      React.createElement(window.ChartMock, {
        width: chartW,
        height: chartH,
        palette: palette,
        theme: "telemetry",
        hoverPct: 0.18,
        fonts: { num: "'JetBrains Mono', monospace", label: "'JetBrains Mono', monospace" },
      })
    );

    const chartFoot = React.createElement(
      "div",
      { className: "plot-foot" },
      React.createElement(
        "span",
        { className: "muted" },
        "drag chart to zoom · double-click to add marker · drag marker to adjust · drop on neighbour to delete"
      )
    );

    // ----- Right side: lap table (LAPS reads as a sub-heading of EDIT) -----

    const tableBlock = React.createElement(
      "div",
      { className: "table-side" },
      React.createElement(
        "div",
        { className: "table-head" },
        React.createElement(
          "div",
          { className: "table-head__title" },
          React.createElement("h2", null, "LAPS"),
          React.createElement("span", { className: "table-head__count" }, "10")
        ),
        React.createElement(
          "div",
          { className: "table-head__right" },
          React.createElement(
            "button",
            { type: "button", className: "reset-btn" },
            "Reset"
          )
        )
      ),
      React.createElement(
        "table",
        { className: "lap-table" },
        React.createElement(
          "thead",
          null,
          React.createElement(
            "tr",
            null,
            React.createElement("th", null, "ID"),
            React.createElement("th", null, "START"),
            React.createElement("th", null, "DUR"),
            React.createElement("th", null, "DIST"),
            React.createElement("th", { className: "th-pace" }, "PACE"),
            React.createElement("th", { className: "th-power" }, "PWR"),
            React.createElement("th", { className: "th-hr" }, "HR"),
            React.createElement("th", { className: "th-cad" }, "CAD")
          )
        ),
        React.createElement(
          "tbody",
          null,
          D.rows.map((r, i) =>
            React.createElement(LapRow, { key: r.n, row: r, isLast: i === D.rows.length - 1 })
          )
        ),
        React.createElement(
          "tfoot",
          null,
          React.createElement(
            "tr",
            null,
            React.createElement("td", { colSpan: 2 }, "Σ TOTAL / AVG"),
            React.createElement("td", null, window.fmtDur(D.total.dur)),
            React.createElement("td", null, D.total.dist.toLocaleString(), React.createElement(ColUnit, null, "m")),
            React.createElement("td", { className: "cell-pace" }, window.fmtPace(D.total.pace), React.createElement(ColUnit, null, "/km")),
            React.createElement("td", { className: "cell-power" }, D.total.power, React.createElement(ColUnit, null, "W")),
            React.createElement("td", { className: "cell-hr" }, D.total.hr, React.createElement(ColUnit, null, "bpm")),
            React.createElement("td", { className: "cell-cad" }, D.total.cad, React.createElement(ColUnit, null, "spm"))
          )
        )
      )
    );

    return React.createElement(
      "div",
      { className: `tv2 is-${resolved} layout-${layout} theme-setting-${theme}` },
      React.createElement("link", { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&family=Newsreader:ital,opsz,wght@1,6..72,400;1,6..72,500&display=swap" }),

      // Status bar
      React.createElement(
        "div",
        { className: "status-bar" },
        React.createElement(
          "span",
          { className: "status-bar__brand" },
          React.createElement("span", { className: "brand-mark" }, "◐"),
          "BUTTERLAPS"
        ),
        React.createElement("span", { className: "status-bar__cell status-bar__cell--quiet" }, "VER. ", React.createElement("b", null, "0.1.0.14")),
        React.createElement("span", { className: "status-bar__spacer" }),
        React.createElement(
          "button",
          {
            type: "button",
            className: "theme-toggle",
            onClick: () => onThemeChange && onThemeChange(THEME_CYCLE[theme]),
            title: `Theme: ${theme}${theme === "system" ? ` (→ ${resolved})` : ""}. Click for ${THEME_NEXT_LABEL[theme]}.`,
          },
          theme === "light"
            ? React.createElement(IconSun, null)
            : theme === "dark"
              ? React.createElement(IconMoon, null)
              : React.createElement(IconSystem, null)
        )
      ),

      React.createElement(
        "div",
        { className: "page" },

        // Header
        React.createElement(
          "header",
          { className: "head" },
          React.createElement(
            "h1",
            { className: "head-title" },
            "Edit lap boundaries ",
            React.createElement("span", { className: "head-title__em" }, "without"),
            " damaging FIT data."
          ),
          React.createElement(
            "p",
            { className: "head-lede" },
            "Upload a ",
            React.createElement("code", null, ".fit"),
            " activity. Inspect lap boundaries on an interactive chart. Export a corrected file that preserves every byte of original FIT structure outside the laps you actually touched."
          )
        ),

        // Card
        React.createElement(
          "section",
          { className: "card" },

          // -------- Section 01 — Upload --------
          React.createElement(
            "div",
            { className: "section section--input" },
            React.createElement(
              "div",
              { className: "section-head" },
              React.createElement("span", { className: "section-head__num" }, "01"),
              React.createElement("span", { className: "section-head__label" }, "UPLOAD"),
              React.createElement("span", { className: "section-head__rule" })
            ),

            // Upload frame
            React.createElement(
              "div",
              { className: "upload-frame" },
              React.createElement(
                "button",
                { type: "button", className: "upload-btn" },
                React.createElement(IconUpload, null),
                "Load .FIT file"
              ),
              React.createElement(
                "span",
                { className: "upload-hint" },
                "or drag and drop a file here"
              ),
              React.createElement(
                "span",
                { className: "upload-spec" },
                "ACCEPT  *.fit",
                React.createElement("span", { className: "upload-spec__sep" }, "·"),
                "MAX  50 MB",
                React.createElement("span", { className: "upload-spec__sep" }, "·"),
                "I/O  client-side"
              )
            ),

            // Loaded-file readout: filename row + metrics row.
            // Both are intentionally light visual weight — secondary info.
            React.createElement(
              "div",
              { className: "loaded" },
              React.createElement(
                "div",
                { className: "loaded__file" },
                React.createElement("span", { className: "loaded__icon" }, "▤"),
                React.createElement("span", { className: "loaded__name" }, D.filename),
                React.createElement("span", { className: "loaded__sep" }, "·"),
                React.createElement("span", null, D.size),
                React.createElement("span", { className: "loaded__sep" }, "·"),
                React.createElement("span", null, D.when),
                React.createElement("span", { className: "loaded__sep" }, "·"),
                React.createElement(
                  "span",
                  { className: "loaded__sport" },
                  React.createElement("span", { className: "loaded__k" }, "SPORT"),
                  "Run"
                ),
                React.createElement("span", { className: "loaded__spacer" }),
                React.createElement(
                  "button",
                  { type: "button", className: "reset-btn", title: "Discard file and start over" },
                  "Clear"
                )
              ),
              React.createElement(
                "div",
                { className: "metric-line" },
                React.createElement(Metric, { label: "DIST", value: "10.034", unit: "km" }),
                React.createElement("span", { className: "metric-sep" }, "·"),
                React.createElement(Metric, { label: "TIME", value: "53:02" }),
                React.createElement("span", { className: "metric-sep" }, "·"),
                React.createElement(Metric, { label: "PACE", value: "5:17", unit: "/km", klass: "metric--pace" }),
                React.createElement("span", { className: "metric-sep" }, "·"),
                React.createElement(Metric, { label: "PWR", value: "272", unit: "W", klass: "metric--power" }),
                React.createElement("span", { className: "metric-sep" }, "·"),
                React.createElement(Metric, { label: "HR", value: "147", unit: "bpm", klass: "metric--hr" }),
                React.createElement("span", { className: "metric-sep" }, "·"),
                React.createElement(Metric, { label: "CAD", value: "170", unit: "spm", klass: "metric--cad" })
              )
            )
          ),

          // -------- Section 02 — Edit --------
          React.createElement(
            "div",
            { className: "section section--edit" },
            React.createElement(
              "div",
              { className: "section-head" },
              React.createElement("span", { className: "section-head__num" }, "02"),
              React.createElement("span", { className: "section-head__label" }, "EDIT"),
              React.createElement("span", { className: "section-head__rule" })
            ),
            React.createElement(
              "div",
              { className: "two-col" },
              React.createElement(
                "div",
                { className: "left-col" },
                chartChips,
                chartFigure,
                chartFoot
              ),
              tableBlock
            )
          ),

          // -------- Section 03 — Review --------
          React.createElement(
            "div",
            { className: "section section--review" },
            React.createElement(
              "div",
              { className: "section-head" },
              React.createElement("span", { className: "section-head__num" }, "03"),
              React.createElement("span", { className: "section-head__label" }, "REVIEW"),
              React.createElement("span", { className: "section-head__rule" })
            ),
            React.createElement(
              "div",
              { className: "review" },
              React.createElement(
                "div",
                { className: "review__delta" },
                React.createElement(
                  "span",
                  { className: "delta delta--rm" },
                  React.createElement("span", { className: "delta-sign" }, "−"),
                  "3"
                ),
                React.createElement(
                  "span",
                  { className: "delta delta--add" },
                  React.createElement("span", { className: "delta-sign" }, "+"),
                  "1"
                ),
                React.createElement(
                  "span",
                  { className: "delta__count" },
                  React.createElement("code", null, "12"),
                  React.createElement("span", { className: "arrow" }, "→"),
                  React.createElement("code", { className: "after" }, "10"),
                  React.createElement("span", { className: "lbl" }, "laps")
                )
              ),
              React.createElement(
                "div",
                { className: "review__lines" },
                React.createElement(
                  "div",
                  { className: "boundary-line" },
                  React.createElement("span", { className: "tag rm" }, "−"),
                  React.createElement("span", { className: "boundary-label" }, "REMOVED @"),
                  React.createElement(
                    "span",
                    { className: "boundary-times" },
                    D.removedBoundaries.map((t) =>
                      React.createElement(
                        "span",
                        { key: t, className: "boundary-time" },
                        React.createElement("code", null, t)
                      )
                    )
                  )
                ),
                React.createElement(
                  "div",
                  { className: "boundary-line" },
                  React.createElement("span", { className: "tag add" }, "+"),
                  React.createElement("span", { className: "boundary-label" }, "ADDED @"),
                  React.createElement(
                    "span",
                    { className: "boundary-times" },
                    D.addedBoundaries.map((t) =>
                      React.createElement(
                        "span",
                        { key: t, className: "boundary-time" },
                        React.createElement("code", null, t)
                      )
                    )
                  )
                )
              )
            )
          ),

          // -------- Section 04 — Download --------
          React.createElement(
            "div",
            { className: "section section--download" },
            React.createElement(
              "div",
              { className: "section-head" },
              React.createElement("span", { className: "section-head__num" }, "04"),
              React.createElement("span", { className: "section-head__label" }, "DOWNLOAD"),
              React.createElement("span", { className: "section-head__rule" })
            ),
            React.createElement(
              "div",
              { className: "download" },
              React.createElement(
                "button",
                { type: "button", className: "export-btn" },
                React.createElement(IconDownload, null),
                "Export edited FIT"
              ),
              React.createElement(
                "div",
                { className: "filename-preview" },
                React.createElement("span", { className: "k" }, "OUTPUT:"),
                "1776949031-GIR",
                React.createElement("span", { className: "tag-suffix" }, "-butterlaps"),
                ".fit"
              )
            )
          )
        )
      )
    );
  };
})();
