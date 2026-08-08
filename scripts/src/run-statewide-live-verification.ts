import { runStatewideLiveVerification } from "../../api-server/src/lib/providers/runStatewideLiveVerification";

runStatewideLiveVerification().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
