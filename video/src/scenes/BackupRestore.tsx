import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

export const BackupRestore: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Backup and restore"
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
        Everything in one file.
      </Interactive.Div>

      <Interactive.Div
        name="Backup file"
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 30,
          padding: "26px 40px",
          borderRadius: 14,
          backgroundColor: "#F4EFEB",
          opacity: interpolate(frame, [24, 46], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [24, 52], ["0px 30px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <div
          style={{
            width: 60,
            height: 76,
            borderRadius: 8,
            backgroundColor: "#BE8146",
          }}
        />
        <div
          style={{
            fontFamily: "Inter",
            fontSize: 46,
            color: "#2C1E18",
          }}
        >
          backup_2026-09-11_dinner-by-derek.json
        </div>
      </Interactive.Div>

      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 30,
          marginTop: 36,
        }}
      >
        <Interactive.Div
          name="Download button"
          style={{
            fontFamily: "Inter",
            fontSize: 44,
            fontWeight: 600,
            color: "#2C1E18",
            backgroundColor: "#BE8146",
            padding: "22px 40px",
            borderRadius: 12,
            opacity: interpolate(frame, [48, 68], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          Download everything
        </Interactive.Div>
        <Interactive.Div
          name="Restore box"
          style={{
            fontFamily: "Inter",
            fontSize: 44,
            color: "#F4EFEB",
            border: "3px solid rgba(244, 239, 235, 0.5)",
            padding: "19px 40px",
            borderRadius: 12,
            letterSpacing: 6,
            opacity: interpolate(frame, [60, 80], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          Type RESTORE
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
          opacity: interpolate(frame, [96, 122], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Weeks, orders, dishes and standing items. Restore is the one button that
        can&apos;t be undone, so it makes you type the word.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
