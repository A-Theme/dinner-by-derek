import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

// The 15 Kitchener-Waterloo forward sortation areas the app seeds with.
const seededAreas = [
  "N2A",
  "N2B",
  "N2C",
  "N2E",
  "N2G",
  "N2H",
  "N2J",
  "N2K",
  "N2L",
  "N2M",
  "N2N",
  "N2P",
  "N2R",
  "N2T",
  "N2V",
];

export const DeliveryArea: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Delivery area"
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
          maxWidth: 1400,
          marginBottom: 66,
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
        Delivery is decided by postal code.
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
        {seededAreas.map((area, i) => (
          <div
            key={area}
            style={{
              fontFamily: "Fraunces",
              fontSize: 52,
              fontWeight: 700,
              color: "#4A2A1A",
              backgroundColor: "#F4EFEB",
              padding: "16px 30px",
              borderRadius: 12,
              opacity: interpolate(frame, [28 + i * 4, 46 + i * 4], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              scale: interpolate(frame, [28 + i * 4, 50 + i * 4], [0.72, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.spring({ damping: 200 }),
                output: "perceptual-scale",
              }),
            }}
          >
            {area}
          </div>
        ))}
      </div>

      <Interactive.Div
        name="Footnote"
        style={{
          fontFamily: "Inter",
          fontSize: 74,
          color: "#EBC08C",
          marginTop: 60,
          maxWidth: 1620,
          lineHeight: 1.3,
          opacity: interpolate(frame, [124, 150], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Checked as it&apos;s typed. Edited from a phone.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
