import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

// The six standing items the app ships with, by their seeded names.
const standing = [
  "Chili",
  "Pork Schnitzel",
  "Breaded Chicken Cutlets",
  "Pulled Pork (Reheat Bag)",
  "BBQ Brisket (Reheat Bag)",
  "Pulled Chicken (Reheat Bag)",
];

export const OtherOptions: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Other options"
      style={{
        backgroundColor: "#2C1E18",
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
          maxWidth: 1300,
          marginBottom: 56,
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
        Standing items go live on save.
      </Interactive.Div>

      <div
        style={{
          display: "flex",
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 22,
          width: 1620,
        }}
      >
        {standing.map((item, i) => (
          <div
            key={item}
            style={{
              width: 788,
              boxSizing: "border-box",
              fontFamily: "Inter",
              fontSize: 46,
              color: "#2C1E18",
              backgroundColor: "#F4EFEB",
              padding: "14px 30px",
              borderRadius: 12,
              opacity: interpolate(frame, [28 + i * 8, 48 + i * 8], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              translate: interpolate(
                frame,
                [28 + i * 8, 54 + i * 8],
                ["0px 24px", "0px 0px"],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                },
              ),
            }}
          >
            {item}
          </div>
        ))}
      </div>

      <Interactive.Div
        name="Footnote"
        style={{
          fontFamily: "Inter",
          fontSize: 48,
          color: "#EBC08C",
          marginTop: 48,
          maxWidth: 1620,
          lineHeight: 1.36,
          opacity: interpolate(frame, [102, 128], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        No draft. Hide one and every order that had it stays as it was.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
