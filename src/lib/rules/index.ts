import type { Rule } from "./types";
import { forceUnwrapRule } from "./general/force-unwrap";
import { unsafeUncheckedSendableRule } from "./concurrency/unsafe-unchecked-sendable";
import { actorIsolationViolationRule } from "./concurrency/actor-isolation-violation";
import { nonSendableBoundaryRule } from "./concurrency/non-sendable-boundary";
import { taskDataRaceRule } from "./concurrency/task-data-race";

export const allRules: Rule[] = [forceUnwrapRule, unsafeUncheckedSendableRule, actorIsolationViolationRule, nonSendableBoundaryRule, taskDataRaceRule];
