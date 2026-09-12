import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

// Monday to Sunday, as the editor lays them out. Blank days are undecided,
// which is the ordinary state of three of them in a Sunday-to-Wednesday week.
const days = [
  { day: "Mon", dish: "Shepherd's pie" },
  { day: "Tue", dish: "Butter chicken" },
  { day: "Wed", dish: "Braised beef" },
  { day: "Thu", dish: "" },
  { day: "Fri", dish: "" },
  { day: "Sat", dish: "" },
  { day: "Sun", dish: "Roast pork loin" },
];

export const ThisWeek: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="This week"
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
          marginBottom: 60,
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
        A box for every day.
      </Interactive.Div>

      <div style={{ display: "flex", flexDirection: "row", gap: 16 }}>
        {days.map((d, i) => (
          <div
            key={d.day}
            style={{
              width: 217,
              height: 240,
              boxSizing: "border-box",
              padding: 20,
              borderRadius: 14,
              backgroundColor: d.dish ? "#F4EFEB" : "transparent",
              border: d.dish
                ? "3px solid #BE8146"
                : "3px dashed rgba(244, 239, 235, 0.3)",
              opacity: interpolate(frame, [24 + i * 6, 44 + i * 6], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              translate: interpolate(
                frame,
                [24 + i * 6, 50 + i * 6],
                ["0px 30px", "0px 0px"],
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
                fontFamily: "Inter",
                fontSize: 36,
                fontWeight: 600,
                letterSpacing: 3,
                color: d.dish ? "#8A5A2B" : "rgba(244, 239, 235, 0.5)",
                marginBottom: 16,
              }}
            >
              {d.day.toUpperCase()}
            </div>
            <div
              style={{
                fontFamily: "Inter",
                fontSize: 30,
                fontWeight: 600,
                color: "#2C1E18",
                lineHeight: 1.2,
              }}
            >
              {d.dish}
            </div>
          </div>
        ))}
      </div>

      <Interactive.Div
        name="What a box holds"
        style={{
          fontFamily: "Inter",
          fontSize: 50,
          color: "rgba(244, 239, 235, 0.85)",
          marginTop: 56,
          maxWidth: 1620,
          lineHeight: 1.38,
          opacity: interpolate(frame, [86, 112], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Name, description, photo, halal and the allergen review — and two sizes,
        each with its own label, price and count.
      </Interactive.Div>
      <Interactive.Div
        name="Second photo"
        style={{
          fontFamily: "Inter",
          fontSize: 50,
          color: "#EBC08C",
          marginTop: 18,
          opacity: interpolate(frame, [118, 142], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        A second photo, if the meal for one looks different.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
