// The stdout a mocked `supervisor_adjudicate` returns: the JSON envelope
// `claude -p --output-format json` prints (M16.5 WP3 3.6), reduced to the fields the
// adjudicator reads. Shape captured live from CC 2.1.310 on 2026-10-26.
import { ADJUDICATOR_MODEL } from "../adjudicator";

export function claudeJsonReply(
  result: string,
  models: readonly string[] = [ADJUDICATOR_MODEL],
  isError = false,
): string {
  return JSON.stringify({
    type: "result",
    subtype: isError ? "error_during_execution" : "success",
    is_error: isError,
    result,
    modelUsage: Object.fromEntries(models.map((m) => [m, { inputTokens: 1 }])),
  });
}
