import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

// The five files the Graphics screen writes, drawn at their true aspect
// ratios on one shared scale so the row reads as the real set.
const images = [
  { name: "Cover", size: "1640×624", w: 394, h: 150 },
  { name: "Profile", size: "1080×1080", w: 220, h: 220 },
  { name: "Menu post", size: "1080×1350", w: 220, h: 275 },
  { name: "Last call", size: "1080×1080", w: 220, h: 220 },
  { name: "Link preview", size: "1200×630", w: 286, h: 150 },
];

export const SocialGraphics: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Social graphics"
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
        Graphics, from a phone.
      </Interactive.Div>

      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "flex-end",
          gap: 40,
        }}
      >
        {images.map((img, i) => (
          <div
            key={img.name}
            style={{
              display: "flex",
              flexDirection: "column",
              opacity: interpolate(frame, [26 + i * 10, 48 + i * 10], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              translate: interpolate(
                frame,
                [26 + i * 10, 54 + i * 10],
                ["0px 40px", "0px 0px"],
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
                width: img.w,
                height: img.h,
                borderRadius: 8,
                backgroundColor: "#F4EFEB",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
              }}
            >
              <div
                style={{
                  fontFamily: "Fraunces",
                  fontSize: 19,
                  fontWeight: 700,
                  color: "#4A2A1A",
                  textAlign: "center",
                  lineHeight: 1.1,
                }}
              >
                Dinner By Derek
              </div>
              <div
                style={{
                  width: 60,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: "#BE8146",
                }}
              />
            </div>
            <div
              style={{
                fontFamily: "Inter",
                fontSize: 34,
                fontWeight: 600,
                color: "#F4EFEB",
                marginTop: 16,
              }}
            >
              {img.name}
            </div>
            <div
              style={{
                fontFamily: "Inter",
                fontSize: 28,
                color: "rgba(244, 239, 235, 0.7)",
              }}
            >
              {img.size}
            </div>
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
          opacity: interpolate(frame, [96, 122], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Drawn from the logo and your Settings. Remake the menu post the moment a
        week goes live.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
