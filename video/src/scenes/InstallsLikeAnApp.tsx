import {
  AbsoluteFill,
  Easing,
  Img,
  Interactive,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";

const points = [
  "No app store.",
  "No account, no password.",
  "Offline, it says so plainly.",
];

export const InstallsLikeAnApp: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Installs like an app"
      style={{
        backgroundColor: "#F4EFEB",
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
          color: "#4A2A1A",
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
        It installs like an app.
      </Interactive.Div>

      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 110,
        }}
      >
        <Interactive.Div
          name="Phone"
          style={{
            width: 300,
            height: 540,
            borderRadius: 46,
            backgroundColor: "#2C1E18",
            padding: 20,
            boxSizing: "border-box",
            opacity: interpolate(frame, [20, 42], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          <div
            style={{
              width: 260,
              height: 500,
              borderRadius: 30,
              backgroundColor: "#EAE2DB",
              display: "flex",
              flexDirection: "row",
              flexWrap: "wrap",
              alignContent: "flex-start",
              gap: 22,
              padding: "44px 22px",
              boxSizing: "border-box",
            }}
          >
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 14,
                  backgroundColor: "#D9CCC1",
                }}
              />
            ))}
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                overflow: "hidden",
                scale: interpolate(frame, [50, 72], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.spring({ damping: 12 }),
                  output: "perceptual-scale",
                }),
              }}
            >
              <Img
                name="App icon"
                src={staticFile("icons/icon-512.png")}
                style={{ width: 56, height: 56 }}
              />
            </div>
          </div>
        </Interactive.Div>

        <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
          {points.map((p, i) => (
            <div
              key={p}
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                gap: 30,
                opacity: interpolate(
                  frame,
                  [66 + i * 16, 88 + i * 16],
                  [0, 1],
                  {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: Easing.bezier(0.16, 1, 0.3, 1),
                  },
                ),
                translate: interpolate(
                  frame,
                  [66 + i * 16, 92 + i * 16],
                  ["-26px 0px", "0px 0px"],
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
                  width: 44,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: "#BE8146",
                }}
              />
              <div
                style={{
                  fontFamily: "Inter",
                  fontSize: 70,
                  color: "#4A2A1A",
                }}
              >
                {p}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
