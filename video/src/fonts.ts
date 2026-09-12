import { loadFont as loadDisplay } from "@remotion/google-fonts/Fraunces";
import { loadFont as loadBody } from "@remotion/google-fonts/Inter";

// Loaded for the side effect only. Both register under their plain family name,
// so scenes can write fontFamily: "Fraunces" as a literal and stay editable in
// the Studio — a constant in the style object would grey the property out.
loadDisplay("normal", { weights: ["600", "700"], subsets: ["latin"] });
loadBody("normal", { weights: ["400", "600"], subsets: ["latin"] });
