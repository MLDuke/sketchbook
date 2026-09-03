// Isolated so the dialkit package + its stylesheet only enter the bundle when
// __DIALKIT_ENABLED__ is true (see src/devtools.tsx).
import { DialRoot } from "dialkit";
import "dialkit/styles.css";

export default DialRoot;
