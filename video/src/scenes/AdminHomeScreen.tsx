import {
  AbsoluteFill,
  Easing,
  Img,
  Interactive,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";

export const AdminHomeScreen: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Admin home screen"
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
        The dashboard gets its own icon.
      </Interactive.Div>

      <div style={{ display: "flex", flexDirection: "row", gap: 100 }}>
        <Interactive.Div
          name="Customer icon"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 20,
            opacity: interpolate(frame, [26, 48], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          <Img
            name="Customer app icon"
            src={staticFile("icons/icon-512.png")}
            style={{ width: 240, height: 240, borderRadius: 52 }}
          />
          <div
            style={{
              fontFamily: "Inter",
              fontSize: 38,
              color: "#F4EFEB",
            }}
          >
            For customers
          </div>
        </Interactive.Div>

        <Interactive.Div
          name="Admin icon"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 20,
            opacity: interpolate(frame, [42, 64], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            scale: interpolate(frame, [42, 70], [0.8, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.spring({ damping: 14 }),
              output: "perceptual-scale",
            }),
          }}
        >
          <Img
            name="Admin app icon"
            src={staticFile("icons/admin-icon-512.png")}
            style={{ width: 240, height: 240, borderRadius: 52 }}
          />
          <div
            style={{
              fontFamily: "Inter",
              fontSize: 38,
              fontWeight: 600,
              color: "#EBC08C",
            }}
          >
            For you
          </div>
        </Interactive.Div>
      </div>

      <Interactive.Div
        name="Footnote"
        style={{
          fontFamily: "Inter",
          fontSize: 48,
          color: "#EBC08C",
          marginTop: 50,
          maxWidth: 1620,
          lineHeight: 1.36,
          opacity: interpolate(frame, [90, 116], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        It sits on the home screen beside the customer app — and offers the
        install, rather than hiding it in a menu.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
