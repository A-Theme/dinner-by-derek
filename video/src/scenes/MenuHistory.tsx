import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

const weeks = [
  {
    label: "Week of Sep 6",
    dishes: [
      "Roast pork loin",
      "Shepherd's pie",
      "Butter chicken",
      "Braised beef",
    ],
  },
  {
    label: "Week of Aug 30",
    dishes: ["Lamb curry", "Beef stroganoff", "Closed", "Lasagna"],
  },
  {
    label: "Week of Aug 23",
    dishes: ["Pot roast", "Aloo gobi", "Chicken pot pie", "Beef stew"],
  },
];

export const MenuHistory: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Menu history"
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
          fontSize: 108,
          fontWeight: 700,
          color: "#F4EFEB",
          lineHeight: 1.1,
          marginBottom: 52,
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
        A record nobody can edit.
      </Interactive.Div>

      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {weeks.map((w, i) => (
          <div
            key={w.label}
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: 20,
              opacity: interpolate(frame, [28 + i * 14, 50 + i * 14], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              translate: interpolate(
                frame,
                [28 + i * 14, 56 + i * 14],
                ["-30px 0px", "0px 0px"],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                },
              ),
            }}
          >
            <div
              style={{
                width: 300,
                fontFamily: "Inter",
                fontSize: 38,
                fontWeight: 600,
                color: "#EBC08C",
              }}
            >
              {w.label}
            </div>
            {w.dishes.map((d) => (
              <div
                key={d}
                style={{
                  width: 308,
                  boxSizing: "border-box",
                  fontFamily: "Inter",
                  fontSize: 34,
                  color: d === "Closed" ? "#F4EFEB" : "#2C1E18",
                  backgroundColor:
                    d === "Closed" ? "transparent" : "rgba(244, 239, 235, 0.9)",
                  border:
                    d === "Closed"
                      ? "3px dashed rgba(244, 239, 235, 0.5)"
                      : "3px solid transparent",
                  padding: "16px 20px",
                  borderRadius: 10,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {d}
              </div>
            ))}
          </div>
        ))}
      </div>

      <Interactive.Div
        name="Footnote"
        style={{
          fontFamily: "Inter",
          fontSize: 50,
          color: "#F4EFEB",
          marginTop: 52,
          maxWidth: 1620,
          lineHeight: 1.36,
          opacity: interpolate(frame, [96, 122], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Every service day ever written down, grouped by week. A record you can
        change is not one.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
