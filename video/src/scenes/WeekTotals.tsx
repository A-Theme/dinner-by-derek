import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

// Biggest earner first, as the screen orders it. "on 2 days" and "mixed" are
// the screen's own words; the zero row is the day the menu opened and nobody
// ordered, which the screen prints rather than leaves out.
const rows = [
  {
    dish: "Butter chicken",
    note: "on 2 days",
    sold: "31",
    price: "$16",
    made: "$496",
  },
  { dish: "Braised beef", note: "", sold: "22", price: "mixed", made: "$402" },
  { dish: "Chili", note: "", sold: "14", price: "$12", made: "$168" },
  {
    dish: "Sunday",
    note: "opened, nobody ordered",
    sold: "0",
    price: "—",
    made: "$0",
  },
];

export const WeekTotals: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Week totals"
      style={{
        backgroundColor: "#5A6643",
        justifyContent: "center",
        alignItems: "flex-start",
        padding: 150,
      }}
    >
      <Interactive.Div
        name="Headline"
        style={{
          fontFamily: "Fraunces",
          fontSize: 116,
          fontWeight: 700,
          color: "#F4EFEB",
          lineHeight: 1.1,
          marginBottom: 48,
          opacity: interpolate(frame, [0, 22], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [0, 26], ["0px 30px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        The week, added up.
      </Interactive.Div>

      <Interactive.Div
        name="Totals table"
        style={{
          width: 1620,
          boxSizing: "border-box",
          padding: "26px 44px",
          borderRadius: 16,
          backgroundColor: "#F4EFEB",
          opacity: interpolate(frame, [24, 46], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            fontFamily: "Inter",
            fontSize: 32,
            fontWeight: 600,
            letterSpacing: 3,
            color: "#8A5A2B",
            paddingBottom: 12,
          }}
        >
          <div style={{ width: 820 }}>DISH</div>
          <div style={{ width: 220, textAlign: "right" }}>SOLD</div>
          <div style={{ width: 240, textAlign: "right" }}>PRICE</div>
          <div style={{ width: 252, textAlign: "right" }}>MADE</div>
        </div>
        {rows.map((r, i) => (
          <div
            key={r.dish}
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "baseline",
              padding: "12px 0",
              borderTop: "2px solid rgba(90, 102, 67, 0.25)",
              fontFamily: "Inter",
              fontSize: 42,
              color: r.sold === "0" ? "#6B4630" : "#2C1E18",
              opacity: interpolate(frame, [40 + i * 12, 60 + i * 12], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
            }}
          >
            <div style={{ width: 820 }}>
              {r.dish}
              <span style={{ fontSize: 32, color: "#8A5A2B", marginLeft: 18 }}>
                {r.note}
              </span>
            </div>
            <div style={{ width: 220, textAlign: "right" }}>{r.sold}</div>
            <div style={{ width: 240, textAlign: "right" }}>{r.price}</div>
            <div style={{ width: 252, textAlign: "right", fontWeight: 600 }}>
              {r.made}
            </div>
          </div>
        ))}
      </Interactive.Div>

      <Interactive.Div
        name="Footnote"
        style={{
          fontFamily: "Inter",
          fontSize: 48,
          color: "#EBC08C",
          marginTop: 40,
          maxWidth: 1620,
          lineHeight: 1.36,
          opacity: interpolate(frame, [104, 130], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Print it for the folder, or take the CSV into a spreadsheet.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
