export const NUMERIC_ABSOLUTE_LIMIT = 1_000_000_000_000
const NON_CURRENCY_DECIMALS = 4

export type NumericProvenanceKind =
  | 'APP_AUTHORITATIVE'
  | 'APP_VALIDATED_PROPOSAL'
  | 'USER_CURRENT_CONVERSATIONAL'
  | 'USER_PRIOR_CONVERSATIONAL'
  | 'DERIVED_VERIFIED'

export type NumericUnit = 'PKR' | 'PERCENT' | 'SCALAR'

export type VerifiedArithmeticOperation =
  | 'add'
  | 'subtract'
  | 'multiply'
  | 'divide'
  | 'whole_units'
  | 'percentage_of'
  | 'increase_by_percentage'
  | 'decrease_by_percentage'
  | 'difference'
  | 'remaining'
  | 'average'

export interface NumericEvidence {
  id: string
  value: number
  canonical: string
  provenance: NumericProvenanceKind
  unit: NumericUnit
  source: string
  operandIds?: readonly string[]
}

export interface NumericProvenanceLedger {
  evidence: NumericEvidence[]
}

export interface NumericOperandCandidate {
  value: number
  provenance: 'APP_AUTHORITATIVE' | 'USER_CURRENT_CONVERSATIONAL' | 'USER_PRIOR_CONVERSATIONAL'
  unit: NumericUnit
}

export interface VerifiedCalculation {
  operation: VerifiedArithmeticOperation
  operands: readonly NumericEvidence[]
  providerResult: number
  result: number
  unit: NumericUnit
  corrected: boolean
  evidence: NumericEvidence
}

export type NumericProvenanceErrorCode =
  | 'calculation_schema_invalid'
  | 'calculation_operand_unverified'
  | 'calculation_operation_invalid'
  | 'calculation_result_invalid'
  | 'numeric_value_unbounded'
  | 'numeric_text_ungrounded'

export class NumericProvenanceFailure extends Error {
  readonly code: NumericProvenanceErrorCode

  constructor(code: NumericProvenanceErrorCode) {
    super(code)
    this.code = code
    this.name = 'NumericProvenanceFailure'
  }
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function bounded(value: number): number {
  if (!Number.isFinite(value) || Math.abs(value) > NUMERIC_ABSOLUTE_LIMIT) {
    throw new NumericProvenanceFailure('numeric_value_unbounded')
  }
  return Object.is(value, -0) ? 0 : value
}

function roundHalfAwayFromZero(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value))
}

export function normalizedNumericValue(value: number, unit: NumericUnit): number {
  const safe = bounded(value)
  if (unit === 'PKR') return bounded(roundHalfAwayFromZero(safe))
  const factor = 10 ** NON_CURRENCY_DECIMALS
  return bounded(roundHalfAwayFromZero(safe * factor) / factor)
}

export function canonicalNumericValue(value: number, unit: NumericUnit = 'SCALAR'): string {
  const normalized = normalizedNumericValue(value, unit)
  if (Number.isInteger(normalized)) return String(normalized)
  return normalized.toFixed(NON_CURRENCY_DECIMALS).replace(/0+$/u, '').replace(/\.$/u, '')
}

const NUMERIC_TOKEN_PATTERN = /(?<![\d,])[-+]?\d[\d,]*(?:\.\d+)?/gu

export interface NumericTextToken {
  raw: string
  canonical: string
  value: number
  start: number
  end: number
}

export function numericTextTokens(value: string): NumericTextToken[] {
  return [...value.matchAll(NUMERIC_TOKEN_PATTERN)].flatMap((match) => {
    const raw = match[0]
    const parsed = Number(raw.replaceAll(',', ''))
    const start = match.index ?? 0
    if (!Number.isFinite(parsed) || Math.abs(parsed) > NUMERIC_ABSOLUTE_LIMIT) return []
    return [{ raw, canonical: canonicalNumericValue(parsed), value: parsed, start, end: start + raw.length }]
  })
}

export function numericTokens(value: string): Set<string> {
  return new Set(numericTextTokens(value).map((token) => token.canonical))
}

function evidenceId(provenance: NumericProvenanceKind, unit: NumericUnit, source: string, canonical: string): string {
  const safeSource = source.replaceAll(/[^a-zA-Z0-9:_-]/gu, '-').slice(0, 80)
  return `${provenance}:${unit}:${safeSource}:${canonical}`
}

export function addNumericEvidence(
  ledger: NumericProvenanceLedger,
  value: number,
  provenance: NumericProvenanceKind,
  unit: NumericUnit,
  source: string,
  operandIds?: readonly string[],
): NumericEvidence {
  const normalized = normalizedNumericValue(value, unit)
  const canonical = canonicalNumericValue(normalized, unit)
  const id = evidenceId(provenance, unit, source, canonical)
  const existing = ledger.evidence.find((candidate) => candidate.id === id)
  if (existing) return existing
  const evidence: NumericEvidence = {
    id,
    value: normalized,
    canonical,
    provenance,
    unit,
    source,
    ...(operandIds?.length ? { operandIds: [...operandIds] } : {}),
  }
  ledger.evidence.push(evidence)
  return evidence
}

function addUserTextEvidence(
  ledger: NumericProvenanceLedger,
  text: string,
  provenance: 'USER_CURRENT_CONVERSATIONAL' | 'USER_PRIOR_CONVERSATIONAL',
  source: string,
): void {
  for (const token of numericTextTokens(text)) {
    // Language understanding decides whether a user number is money, a percent,
    // or a scalar. Recording all three unit candidates does not make it app truth.
    for (const unit of ['PKR', 'PERCENT', 'SCALAR'] as const) {
      addNumericEvidence(ledger, token.value, provenance, unit, source)
    }
  }
}

export function createNumericProvenance(input: {
  currentText?: string
  priorUserTexts?: readonly string[]
  legacyAllowedNumbers?: ReadonlySet<string>
} = {}): NumericProvenanceLedger {
  const ledger: NumericProvenanceLedger = { evidence: [] }
  if (input.currentText) addUserTextEvidence(ledger, input.currentText, 'USER_CURRENT_CONVERSATIONAL', 'current-user-turn')
  for (const [index, text] of (input.priorUserTexts ?? []).slice(-10).entries()) {
    addUserTextEvidence(ledger, text, 'USER_PRIOR_CONVERSATIONAL', `prior-user-turn-${index + 1}`)
  }
  for (const raw of input.legacyAllowedNumbers ?? []) {
    const value = Number(raw.replaceAll(',', ''))
    if (!Number.isFinite(value)) continue
    addNumericEvidence(ledger, value, 'APP_AUTHORITATIVE', 'PKR', 'legacy-allowed-number')
    addNumericEvidence(ledger, value, 'APP_AUTHORITATIVE', 'SCALAR', 'legacy-allowed-number')
  }
  return ledger
}

/**
 * A current-turn number plus a different authoritative PKR value is an
 * unresolved numeric relationship. The model still chooses the operation and
 * typed operands; this predicate only prevents a post-read balance summary from
 * silently ending a turn that still needs deterministic arithmetic.
 */
export function hasPendingAuthoritativeCalculation(ledger: NumericProvenanceLedger): boolean {
  if (ledger.evidence.some((entry) => entry.provenance === 'DERIVED_VERIFIED')) return false
  const authoritativeValues = new Set(
    ledger.evidence
      .filter((entry) => entry.provenance === 'APP_AUTHORITATIVE' && entry.unit === 'PKR')
      .map((entry) => entry.canonical),
  )
  if (!authoritativeValues.size) return false
  return ledger.evidence.some((entry) =>
    entry.provenance === 'USER_CURRENT_CONVERSATIONAL' &&
    !authoritativeValues.has(entry.canonical),
  )
}

/**
 * Minimal truthful prose for the narrow case where arithmetic succeeded but a
 * later provider composition round failed. It is derived exclusively from the
 * verified ledger, so conversational fake balances cannot leak into the answer.
 */
export function deterministicVerifiedCalculationText(ledger: NumericProvenanceLedger): string | undefined {
  const derived = ledger.evidence.filter((entry) => entry.provenance === 'DERIVED_VERIFIED').at(-1)
  if (!derived) return undefined
  const operands = (derived.operandIds ?? []).flatMap((id) => {
    const evidence = ledger.evidence.find((entry) => entry.id === id)
    return evidence ? [evidence] : []
  })
  if (operands.length < 2) return undefined
  const authoritative = operands.find((entry) => entry.provenance === 'APP_AUTHORITATIVE' && entry.unit === 'PKR')
  const format = (value: number, unit: NumericUnit) => unit === 'PKR'
    ? `PKR ${value.toLocaleString('en-PK', { maximumFractionDigits: 0 })}`
    : value.toLocaleString('en-PK', { maximumFractionDigits: NON_CURRENCY_DECIMALS })
  const recordedPrefix = authoritative
    ? `Using the recorded ${format(authoritative.value, authoritative.unit)} balance and the verified inputs, `
    : 'Using the verified inputs, '
  const operation = derived.source.startsWith('calculation:') ? derived.source.slice('calculation:'.length) : ''
  const result = format(derived.value, derived.unit)
  const suffix = operation === 'whole_units' ? `${result} whole units are available.` : `the result is ${result}.`
  return `${recordedPrefix}${suffix}`
}

const NON_MONETARY_FIELD_PATTERN = /(?:count|days?|rank|index|share|percent|ratio|frequency|year|month|limit)$/iu
const MONETARY_FIELD_PATTERN = /(?:amount(?:pkr)?|balance|income|expense|spend|cashflow|cash_flow|outflow|inflow|receivable|payable|commitment|opening|settled|remaining|total)$/iu

function structuredUnit(path: string): NumericUnit {
  const field = path.split('.').at(-1) ?? ''
  if (NON_MONETARY_FIELD_PATTERN.test(field)) return field.toLocaleLowerCase().includes('percent') ? 'PERCENT' : 'SCALAR'
  return MONETARY_FIELD_PATTERN.test(field) ? 'PKR' : 'SCALAR'
}

function addStructuredNumericResult(
  ledger: NumericProvenanceLedger,
  sourceName: string,
  value: unknown,
  provenance: 'APP_AUTHORITATIVE' | 'APP_VALIDATED_PROPOSAL',
  path = 'result',
): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Math.abs(value) > NUMERIC_ABSOLUTE_LIMIT) return
    addNumericEvidence(ledger, value, provenance, structuredUnit(path), `${sourceName}:${path}`)
    return
  }
  if (typeof value === 'string') {
    for (const token of numericTextTokens(value)) {
      addNumericEvidence(ledger, token.value, provenance, structuredUnit(path), `${sourceName}:${path}`)
    }
    return
  }
  if (Array.isArray(value)) {
    value.slice(0, 100).forEach((entry, index) => addStructuredNumericResult(ledger, sourceName, entry, provenance, `${path}.${index}`))
    return
  }
  const object = objectRecord(value)
  if (!object) return
  for (const [key, entry] of Object.entries(object).slice(0, 100)) {
    addStructuredNumericResult(ledger, sourceName, entry, provenance, `${path}.${key}`)
  }
}

/** Adds only values returned by a validated app read tool. */
export function addAuthoritativeToolResult(ledger: NumericProvenanceLedger, toolName: string, value: unknown): void {
  addStructuredNumericResult(ledger, toolName, value, 'APP_AUTHORITATIVE')
}

/** Adds deterministic preview details without promoting them to recorded finance truth. */
export function addValidatedProposalResult(ledger: NumericProvenanceLedger, toolName: string, value: unknown): void {
  addStructuredNumericResult(ledger, toolName, value, 'APP_VALIDATED_PROPOSAL')
}

function operandCandidate(value: unknown): NumericOperandCandidate | undefined {
  const item = objectRecord(value)
  if (!item || typeof item.value !== 'number' || !Number.isFinite(item.value)) return undefined
  const provenance = item.provenance
  const unit = item.unit
  if (provenance !== 'APP_AUTHORITATIVE' && provenance !== 'USER_CURRENT_CONVERSATIONAL' && provenance !== 'USER_PRIOR_CONVERSATIONAL') return undefined
  if (unit !== 'PKR' && unit !== 'PERCENT' && unit !== 'SCALAR') return undefined
  return { value: item.value, provenance, unit }
}

const VERIFIED_OPERATIONS = new Set<VerifiedArithmeticOperation>([
  'add', 'subtract', 'multiply', 'divide', 'whole_units', 'percentage_of',
  'increase_by_percentage', 'decrease_by_percentage', 'difference', 'remaining', 'average',
])

function expectedResultUnit(operation: VerifiedArithmeticOperation, operands: readonly NumericEvidence[]): NumericUnit | undefined {
  const [first, second] = operands
  if (!first || !second) return undefined
  if (operation === 'percentage_of' || operation === 'increase_by_percentage' || operation === 'decrease_by_percentage') {
    return second.unit === 'PERCENT' ? first.unit : undefined
  }
  if (operation === 'add' || operation === 'subtract' || operation === 'difference' || operation === 'remaining' || operation === 'average') {
    return operands.every((operand) => operand.unit === first.unit) ? first.unit : undefined
  }
  if (operation === 'multiply') {
    const currency = operands.filter((operand) => operand.unit === 'PKR')
    const scalar = operands.filter((operand) => operand.unit === 'SCALAR')
    if (currency.length === 1 && scalar.length === 1) return 'PKR'
    return operands.every((operand) => operand.unit === 'SCALAR') ? 'SCALAR' : undefined
  }
  if (operation === 'divide') {
    if (second.value === 0 || second.unit === 'PERCENT') return undefined
    if (first.unit === 'PKR' && second.unit === 'SCALAR') return 'PKR'
    if (first.unit === second.unit) return 'SCALAR'
  }
  if (operation === 'whole_units') {
    return second.value > 0 && first.unit === second.unit && first.unit !== 'PERCENT' ? 'SCALAR' : undefined
  }
  return undefined
}

function calculate(operation: VerifiedArithmeticOperation, operands: readonly NumericEvidence[]): number {
  const values = operands.map((operand) => operand.value)
  const [first = 0, second = 0] = values
  if (operation === 'add') return first + second
  if (operation === 'subtract' || operation === 'remaining') return first - second
  if (operation === 'multiply') return first * second
  if (operation === 'divide') return first / second
  if (operation === 'whole_units') return Math.max(0, Math.floor(first / second))
  if (operation === 'percentage_of') return first * (second / 100)
  if (operation === 'increase_by_percentage') return first * (1 + second / 100)
  if (operation === 'decrease_by_percentage') return first * (1 - second / 100)
  if (operation === 'difference') return Math.abs(first - second)
  return values.reduce((total, value) => total + value, 0) / values.length
}

export function verifyCalculationRequest(value: unknown, ledger: NumericProvenanceLedger): VerifiedCalculation {
  const item = objectRecord(value)
  if (!item || !VERIFIED_OPERATIONS.has(item.operation as VerifiedArithmeticOperation) || !Array.isArray(item.operands) ||
      (item.unit !== 'PKR' && item.unit !== 'PERCENT' && item.unit !== 'SCALAR')) {
    throw new NumericProvenanceFailure('calculation_schema_invalid')
  }
  const operation = item.operation as VerifiedArithmeticOperation
  const operandCandidates = item.operands.map(operandCandidate)
  const expectedCount = operation === 'average' ? undefined : 2
  if (operandCandidates.some((operand) => !operand) || item.operands.length < 2 || item.operands.length > 12 ||
      (expectedCount !== undefined && item.operands.length !== expectedCount)) {
    throw new NumericProvenanceFailure('calculation_schema_invalid')
  }
  const operands = (operandCandidates as NumericOperandCandidate[]).map((candidate) => {
    const canonical = canonicalNumericValue(candidate.value, candidate.unit)
    const evidence = ledger.evidence.find((entry) => entry.provenance === candidate.provenance && entry.unit === candidate.unit && entry.canonical === canonical)
    if (!evidence) throw new NumericProvenanceFailure('calculation_operand_unverified')
    return evidence
  })
  const unit = expectedResultUnit(operation, operands)
  if (!unit || unit !== item.unit) throw new NumericProvenanceFailure('calculation_operation_invalid')
  const result = normalizedNumericValue(calculate(operation, operands), unit)
  const evidence = addNumericEvidence(ledger, result, 'DERIVED_VERIFIED', unit, `calculation:${operation}`, operands.map((operand) => operand.id))
  return {
    operation,
    operands,
    providerResult: result,
    result,
    unit,
    corrected: false,
    evidence,
  }
}

/** Backward-compatible verification for providers that still include a result candidate in final JSON. */
export function verifyCalculationCandidate(value: unknown, ledger: NumericProvenanceLedger): VerifiedCalculation {
  const item = objectRecord(value)
  if (!item || typeof item.result !== 'number' || !Number.isFinite(item.result)) {
    throw new NumericProvenanceFailure('calculation_schema_invalid')
  }
  const verified = verifyCalculationRequest(item, ledger)
  const providerResult = normalizedNumericValue(item.result, verified.unit)
  return {
    ...verified,
    providerResult,
    corrected: canonicalNumericValue(providerResult, verified.unit) !== verified.evidence.canonical,
  }
}

function formattedReplacement(value: number, original: string, unit: NumericUnit): string {
  const normalized = normalizedNumericValue(value, unit)
  if (!original.includes(',')) return canonicalNumericValue(normalized, unit)
  return normalized.toLocaleString('en-PK', { maximumFractionDigits: NON_CURRENCY_DECIMALS })
}

/**
 * Corrects only one unambiguous displayed provider result. Operands and unrelated
 * figures are never rewritten. If the wrong result is ambiguous, validation
 * rejects the response instead of guessing which number the provider meant.
 */
export function reconcileVerifiedCalculationText(text: string, calculation: VerifiedCalculation): string {
  if (!calculation.corrected) return text
  const providerCanonical = canonicalNumericValue(calculation.providerResult, calculation.unit)
  const matches = numericTextTokens(text).filter((token) => token.canonical === providerCanonical)
  const providerValueIsOperand = calculation.operands.some((operand) => operand.canonical === providerCanonical)
  if (matches.length !== 1 || providerValueIsOperand) return text
  const [match] = matches
  if (!match) return text
  const replacement = formattedReplacement(calculation.result, match.raw, calculation.unit)
  return `${text.slice(0, match.start)}${replacement}${text.slice(match.end)}`
}

export function validateNumericResponseText(
  text: string,
  ledger: NumericProvenanceLedger,
  calculation?: VerifiedCalculation,
  allowCurrentConversational = true,
): void {
  const allowed = new Set(
    ledger.evidence
      .filter((entry) => entry.provenance === 'APP_AUTHORITATIVE' ||
        (allowCurrentConversational &&
          (entry.provenance === 'USER_CURRENT_CONVERSATIONAL' || entry.provenance === 'APP_VALIDATED_PROPOSAL')))
      .map((entry) => entry.canonical),
  )
  const derivedEvidence = ledger.evidence.filter((entry) => entry.provenance === 'DERIVED_VERIFIED')
  for (const derived of derivedEvidence) {
    allowed.add(derived.canonical)
    for (const operandId of derived.operandIds ?? []) {
      const operand = ledger.evidence.find((entry) => entry.id === operandId)
      if (operand) allowed.add(operand.canonical)
    }
  }
  if (calculation) {
    for (const operand of calculation.operands) allowed.add(operand.canonical)
    allowed.add(calculation.evidence.canonical)
  }
  const textTokens = numericTextTokens(text)
  for (const token of textTokens) {
    if (!allowed.has(token.canonical)) throw new NumericProvenanceFailure('numeric_text_ungrounded')
  }
  const displayed = new Set(textTokens.map((token) => token.canonical))
  if (derivedEvidence.some((entry) => !displayed.has(entry.canonical))) {
    throw new NumericProvenanceFailure('numeric_text_ungrounded')
  }
}

export function allowedNumericValues(ledger: NumericProvenanceLedger, calculation?: VerifiedCalculation): Set<string> {
  const allowed = new Set(
    ledger.evidence
      .filter((entry) => entry.provenance !== 'USER_PRIOR_CONVERSATIONAL')
      .map((entry) => entry.canonical),
  )
  if (calculation) for (const operand of calculation.operands) allowed.add(operand.canonical)
  return allowed
}

/** Values safe for structured finance cards, which represent app truth. */
export function authoritativeNumericValues(ledger: NumericProvenanceLedger, calculation?: VerifiedCalculation): Set<string> {
  const allowed = new Set(
    ledger.evidence
      .filter((entry) => entry.provenance === 'APP_AUTHORITATIVE' || entry.provenance === 'DERIVED_VERIFIED')
      .map((entry) => entry.canonical),
  )
  if (calculation) allowed.add(calculation.evidence.canonical)
  return allowed
}
