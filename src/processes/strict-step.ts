/**
 * Vendored from @benkei/template-base (fragments/strict-step.ts) —
 * replace with `import { buildStrictStepPrompt } from '@benkei-ai/core'`
 * after core >=0.4.0 publishes. Keep byte-identical to the canonical
 * copy except for this header and the local `compose`.
 */

/** Join instruction fragments into a single block separated by blank lines. */
function compose(...fragments: string[]): string {
  return fragments
    .map((fragment) => fragment.trim())
    .filter((fragment) => fragment.length > 0)
    .join('\n\n');
}

const STEP_CONTRACT_HEADER: string = Object.freeze(
  '=== STEP CONTRACT — read fully before replying ===',
) as string;
const ROLE_SCOPE_HEADER: string = Object.freeze('ROLE / SCOPE') as string;
const ROLE_SCOPE_RULE: string = Object.freeze(
  "You do not run the process. You do not decide what comes next. The engine advances the run on its own the moment this step's data validates.",
) as string;
const QUESTION_WARNING: string = Object.freeze(
  'IMPORTANT — DO NOT REPEAT THE QUESTION.\nThe engine has ALREADY posted the question below to the user in this chat before invoking you. The user is reading it right now. Restating or paraphrasing it makes the chat repeat itself. Do NOT greet. Do NOT preview what comes next.',
) as string;
const PAYLOAD_SHAPE_HEADER: string = Object.freeze('PAYLOAD SHAPE') as string;
const PAYLOAD_SHAPE_RULES: string = Object.freeze(
  '- Use the EXACT field names above. Never invent, rename, or add fields.\n- A field marked nullable: if the user/source opts out ("no tengo", "skip"), submit the literal JSON value null. Do NOT omit the key.\n- A field marked optional: if unknown, OMIT the key entirely. Do NOT submit null, "", "N/A", or a guess.\n- Arrays: always resubmit the FULL cumulative array, never a delta.',
) as string;
const CONTEXT_HEADER: string = Object.freeze('CONTEXT') as string;
const YOUR_JOB_HEADER: string = Object.freeze('YOUR JOB THIS TURN') as string;
const OUTPUT_HEADER: string = Object.freeze('OUTPUT') as string;
const OUTPUT_RULES: string = Object.freeze(
  '- Reply with ONE JSON object and nothing else: no prose before it, no commentary after it, no markdown fences, no reasoning text.\n- Ground every value in the CONTEXT above. If the source material does not state a fact, do not include it — an omitted optional field is correct; an invented value is a failure.\n- If a previous attempt was rejected, the rejection reason follows this prompt — fix ONLY the named fields, change nothing else.',
) as string;
const HTML_OUTPUT_RULE: string = Object.freeze(
  '- Section values are SEMANTIC HTML fragments: <p>, <h3>, <ul>, <li>, <strong>, <em>, <a>. NEVER markdown (**, -, #), never <html>/<body> wrappers, never a top-level heading repeating the section title.',
) as string;
const FORBIDDEN_HEADER: string = Object.freeze(
  'FORBIDDEN — each of these has broken real runs:',
) as string;
const FORBIDDEN_RULES: string = Object.freeze(
  '- Asking for, or submitting, fields that belong to OTHER steps — even if the user volunteered them. The engine routes them when their step opens.\n- Asking "shall I continue?" — advancement is automatic.\n- Greeting, previewing the next step, or narrating what the system will do.\n- Inventing values that are not in the user\'s words or the CONTEXT.\n- Switching language: a LANGUAGE directive is injected by the engine and is absolute.\n- Calling any tool not explicitly allowed for this step.',
) as string;
const NOTES_HEADER: string = Object.freeze('NOTES') as string;
const STEP_CONTRACT_FOOTER: string = Object.freeze('=== END STEP CONTRACT ===') as string;

const DEFAULT_ACK_TOKENS: readonly string[] = Object.freeze([
  'Anotado.',
  'Gracias.',
  'Listo.',
]);

export type StepKind = 'collect' | 'extract' | 'compose' | 'classify';

export interface StrictStepArgs {
  processLabel: string;
  stepId: string;
  stepNumber?: number;
  totalSteps?: number;
  kind: StepKind;
  objective: string;
  question?: string;
  payloadShape: string;
  context?: string[];
  rules?: string[];
  ackTokens?: readonly string[];
  htmlOutput?: boolean;
  followUpQuestions?: boolean;
}

function buildRoleScopeSection(args: StrictStepArgs): string {
  const progressLine =
    args.stepNumber !== undefined && args.totalSteps !== undefined
      ? `You are executing step ${args.stepNumber} of ${args.totalSteps} ("${args.stepId}") of the process "${args.processLabel}".`
      : `You are executing step "${args.stepId}" of the process "${args.processLabel}".`;

  return `${ROLE_SCOPE_HEADER}\n${progressLine}\nYour ONLY job in this step is: ${args.objective}\n${ROLE_SCOPE_RULE}`;
}

function buildQuestionSection(question: string): string {
  return `${QUESTION_WARNING}\n\nQUESTION FOR THIS STEP: ${question}`;
}

function buildPayloadShapeSection(payloadShape: string): string {
  return `${PAYLOAD_SHAPE_HEADER}\n${payloadShape}\n${PAYLOAD_SHAPE_RULES}`;
}

function buildContextSection(context: string[] | undefined): string {
  if (context === undefined || context.length === 0) {
    return '';
  }

  return `${CONTEXT_HEADER}\n${context.join('\n')}`;
}

function formatAckTokens(ackTokens: readonly string[] | undefined): string {
  return (ackTokens ?? DEFAULT_ACK_TOKENS).join(', ');
}

function buildCollectInstructions(args: StrictStepArgs): string {
  const ackTokenList = formatAckTokens(args.ackTokens);

  if (args.followUpQuestions === true) {
    return `${YOUR_JOB_HEADER}\n1. Read the user's most recent message — it is their answer.\n2. Submit the data you learned for THIS step only. The system instructions appended below this prompt define the exact submission mechanism — follow them literally.\n3. If REQUIRED fields are still missing after this message: ask for EXACTLY the missing fields in ONE short message — nothing else. Never re-ask a field you already have.\n4. When no required field is missing, reply with EXACTLY one of: ${ackTokenList}. Nothing else.\n5. ONLY exception — the message is NOT an answer (a clarification, a refusal, an off-topic question): submit nothing, answer in ONE short sentence, stop.`;
  }

  return `${YOUR_JOB_HEADER}\n1. Read the user's most recent message — it is their answer.\n2. Submit the data for THIS step only. The system instructions appended below this prompt define the exact submission mechanism — follow them literally.\n3. Reply with EXACTLY one of: ${ackTokenList}. Nothing else.\n4. ONLY exception — the message is NOT an answer (a clarification, a refusal, an off-topic question): submit nothing, answer in ONE short sentence, stop.`;
}

function buildOutputSection(htmlOutput: boolean | undefined): string {
  return htmlOutput === true
    ? `${OUTPUT_HEADER}\n${OUTPUT_RULES}\n${HTML_OUTPUT_RULE}`
    : `${OUTPUT_HEADER}\n${OUTPUT_RULES}`;
}

function buildKindSection(args: StrictStepArgs): string {
  switch (args.kind) {
    case 'collect':
      return buildCollectInstructions(args);
    case 'extract':
    case 'compose':
    case 'classify':
      return buildOutputSection(args.htmlOutput);
    default: {
      const exhaustiveCheck: never = args.kind;
      return exhaustiveCheck;
    }
  }
}

function buildNotesSection(rules: string[] | undefined): string {
  if (rules === undefined || rules.length === 0) {
    return '';
  }

  return `${NOTES_HEADER}\n${rules.map((rule) => `- ${rule}`).join('\n')}`;
}

export function buildStrictStepPrompt(args: StrictStepArgs): string {
  const questionSection =
    args.kind === 'collect' && args.question !== undefined ? buildQuestionSection(args.question) : '';

  return compose(
    STEP_CONTRACT_HEADER,
    buildRoleScopeSection(args),
    questionSection,
    buildPayloadShapeSection(args.payloadShape),
    buildContextSection(args.context),
    buildKindSection(args),
    `${FORBIDDEN_HEADER}\n${FORBIDDEN_RULES}`,
    buildNotesSection(args.rules),
    STEP_CONTRACT_FOOTER,
  );
}
