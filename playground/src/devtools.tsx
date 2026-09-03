import { Suspense, lazy } from "react";

// __DIALKIT_ENABLED__ / __AGENTATION_ENABLED__ are compile-time booleans set in
// vite.config.ts: true under `npm run dev`, false in a build unless
// ENABLE_DIALKIT / ENABLE_AGENTATION is set for that deploy. When false, the
// ternary folds to `null` and the wrapper module (and its package) is dropped.
const DialRoot = __DIALKIT_ENABLED__
  ? lazy(() => import("./overlays/dialkit"))
  : null;

const Agentation = __AGENTATION_ENABLED__
  ? lazy(() => import("./overlays/agentation"))
  : null;

/** Dev overlays, mounted once by <App>. Renders nothing in a default deploy. */
export function DevOverlays() {
  if (!DialRoot && !Agentation) return null;
  return (
    <Suspense fallback={null}>
      {DialRoot && <DialRoot />}
      {Agentation && <Agentation />}
    </Suspense>
  );
}
