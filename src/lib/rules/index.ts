import type { Rule } from "./types";
import { unsafeUncheckedSendableRule } from "./concurrency/unsafe-unchecked-sendable";
import { actorIsolationViolationRule } from "./concurrency/actor-isolation-violation";
import { nonSendableBoundaryRule } from "./concurrency/non-sendable-boundary";
import { taskDataRaceRule } from "./concurrency/task-data-race";
import { missingSendableClosureRule } from "./concurrency/missing-sendable-closure";
import { missingSendableConformanceRule } from "./concurrency/missing-sendable-conformance";

export const allRules: Rule[] = [unsafeUncheckedSendableRule, actorIsolationViolationRule, nonSendableBoundaryRule, taskDataRaceRule, missingSendableClosureRule, missingSendableConformanceRule];
