export const JEV_SYSTEM_ONE_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const JEV_MODEL = 'jev-latest';
export const JEV_TIMEOUT_MS = 2_000;

export const JEV_INTENTS = [
  'server_rules',
  'command_help',
  'casual_chat',
  'spam_or_abuse'
] as const;

export type JevIntent = (typeof JEV_INTENTS)[number];
export type JevContent = string | Record<string, unknown> | readonly unknown[];

export interface JevChoiceQuestion<TChoice extends string = JevIntent> {
  type: 'choice';
  instructions: JevContent;
  criteria: Partial<Record<TChoice, JevContent | null>>;
}

export interface JevScoreQuestion {
  type: 'score';
  instructions: JevContent;
  criteria: readonly [JevContent, JevContent];
}

export interface JevNoulQuestion {
  type: 'noul';
  instructions: JevContent;
  criteria: {
    true: JevContent;
    false: JevContent;
  };
}

export interface JevSystemOneRequest<TChoice extends string = JevIntent> {
  state: JevContent;
  model: string;
  questions: {
    intent: JevChoiceQuestion<TChoice>;
    toxicity: JevScoreQuestion;
    need_llm: JevScoreQuestion;
    not_conversational: JevNoulQuestion;
  };
}

export interface JevChoiceAnswer<TChoice extends string = JevIntent> {
  type: 'choice';
  choice: TChoice;
  probabilities: Record<TChoice, number>;
  confidence: number;
}

export interface JevScoreAnswer {
  type: 'score';
  score: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
}

export interface JevNoulAnswer {
  type: 'noul';
  noul: number;
}

export interface JevSystemOneResponse<TChoice extends string = JevIntent> {
  model: string;
  answers: {
    intent: JevChoiceAnswer<TChoice>;
    toxicity: JevScoreAnswer;
    need_llm: JevScoreAnswer;
    not_conversational: JevNoulAnswer;
  };
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface JevEnv {
  JEV_API_KEY?: string;
  JEV_ENDPOINT?: string;
}

export interface JevClientOptions {
  timeoutMs?: number;
  maxRetries?: number;
  fetcher?: typeof fetch;
}

export class JevApiError extends Error {
  readonly status: number;
  readonly retryAfterMs?: number;

  constructor(status: number, retryAfterMs?: number) {
    super(`Jev API returned HTTP ${status}`);
    this.name = 'JevApiError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export class JevConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JevConfigurationError';
  }
}

export class JevProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JevProtocolError';
  }
}

export class JevTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Jev API request timed out after ${timeoutMs}ms`);
    this.name = 'JevTimeoutError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumberInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function parseProbabilities(value: unknown, name: string): Record<string, number> {
  if (!isRecord(value)) throw new JevProtocolError(`Jev ${name} answer must contain probabilities`);
  const probabilities: Record<string, number> = {};
  for (const [key, probability] of Object.entries(value)) {
    if (!isFiniteNumberInRange(probability, 0, 1)) {
      throw new JevProtocolError(`Jev ${name} answer contains an invalid probability`);
    }
    probabilities[key] = probability;
  }
  return probabilities;
}

function parseScoreAnswer(value: unknown, name: string): JevScoreAnswer {
  if (!isRecord(value) || value.type !== 'score') {
    throw new JevProtocolError(`Jev ${name} answer has an invalid score shape`);
  }
  const score = value.score;
  const confidence = value.confidence;
  const rawLegend = value.legend;
  if (!isFiniteNumberInRange(score, 0, 1) || !isFiniteNumberInRange(confidence, 0, 1) ||
      !isRecord(rawLegend)) {
    throw new JevProtocolError(`Jev ${name} answer has an invalid score shape`);
  }
  for (const description of Object.values(rawLegend)) {
    if (typeof description !== 'string') {
      throw new JevProtocolError(`Jev ${name} answer contains an invalid legend`);
    }
  }

  const probabilities = parseProbabilities(value.probabilities, name);
  if (Object.keys(probabilities).length !== 2) {
    throw new JevProtocolError(`Jev ${name} answer must contain two level probabilities`);
  }
  const legend: Record<string, string> = {};
  const legendEntries = Object.entries(rawLegend);
  for (const [key, description] of legendEntries) {
    if (typeof description !== 'string') {
      throw new JevProtocolError(`Jev ${name} answer contains an invalid legend`);
    }
    legend[key] = description;
  }
  if (legendEntries.length !== 2 ||
      legendEntries.some(([key]) => !(key in probabilities)) ||
      Object.keys(probabilities).some((key) => !(key in rawLegend))) {
    throw new JevProtocolError(`Jev ${name} answer contains mismatched levels`);
  }

  return {
    type: 'score',
    score,
    legend,
    probabilities,
    confidence
  };
}

function parseSystemOneResponse<TChoice extends string>(
  value: unknown,
  allowedChoices: readonly TChoice[]
): JevSystemOneResponse<TChoice> {
  if (!isRecord(value) || typeof value.model !== 'string' || !value.model ||
      !isRecord(value.answers) || !isRecord(value.usage)) {
    throw new JevProtocolError('Jev response must contain model, answers, and usage');
  }

  const answers = value.answers;
  const intent = answers.intent;
  if (!isRecord(intent) || intent.type !== 'choice' ||
      typeof intent.choice !== 'string' || !allowedChoices.includes(intent.choice as TChoice) ||
      !isFiniteNumberInRange(intent.confidence, 0, 1)) {
    throw new JevProtocolError('Jev intent answer has an invalid choice shape');
  }
  const intentProbabilities = parseProbabilities(intent.probabilities, 'intent');
  if (allowedChoices.length === 0 ||
      allowedChoices.some((option) => !(option in intentProbabilities)) ||
      Object.keys(intentProbabilities).length !== allowedChoices.length) {
    throw new JevProtocolError('Jev intent answer contains unexpected choice probabilities');
  }
  const choiceProbabilities = {} as Record<TChoice, number>;
  for (const option of allowedChoices) choiceProbabilities[option] = intentProbabilities[option];

  const notConversational = answers.not_conversational;
  if (!isRecord(notConversational) || notConversational.type !== 'noul' ||
      !isFiniteNumberInRange(notConversational.noul, 0, 1)) {
    throw new JevProtocolError('Jev Noul answer has an invalid probability');
  }

  const { input_tokens: inputTokens, output_tokens: outputTokens } = value.usage;
  if (typeof inputTokens !== 'number' || !Number.isSafeInteger(inputTokens) || inputTokens < 0 ||
      typeof outputTokens !== 'number' || !Number.isSafeInteger(outputTokens) || outputTokens < 0) {
    throw new JevProtocolError('Jev response contains invalid token usage');
  }

  return {
    model: value.model,
    answers: {
      intent: {
        type: 'choice',
        choice: intent.choice as TChoice,
        probabilities: choiceProbabilities,
        confidence: intent.confidence
      },
      toxicity: parseScoreAnswer(answers.toxicity, 'toxicity'),
      need_llm: parseScoreAnswer(answers.need_llm, 'need_llm'),
      not_conversational: {
        type: 'noul',
        noul: notConversational.noul
      }
    },
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens
    }
  };
}

function retryAfterMilliseconds(response: Response): number | undefined {
  const value = response.headers.get('retry-after');
  if (!value) return undefined;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;

  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

function shouldRetry(error: unknown): boolean {
  if (error instanceof JevTimeoutError) return true;
  if (error instanceof JevApiError) {
    return error.status === 408 || error.status === 425 || error.status === 429 ||
      error.status === 529 || error.status >= 500;
  }
  return !(error instanceof JevConfigurationError) && !(error instanceof JevProtocolError);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function callSystemOne<TChoice extends string = JevIntent>(
  request: JevSystemOneRequest<TChoice>,
  env: JevEnv,
  options: JevClientOptions = {}
): Promise<JevSystemOneResponse<TChoice>> {
  const apiKey = env.JEV_API_KEY?.trim();
  if (!apiKey) throw new JevConfigurationError('JEV_API_KEY is not configured');

  const endpoint = env.JEV_ENDPOINT?.trim() || JEV_SYSTEM_ONE_ENDPOINT;
  let endpointUrl: URL;
  try {
    endpointUrl = new URL(endpoint);
  } catch {
    throw new JevConfigurationError('JEV_ENDPOINT must be an absolute URL');
  }
  const isLocalHttpEndpoint = endpointUrl.protocol === 'http:' &&
    (endpointUrl.hostname === 'localhost' || endpointUrl.hostname === '127.0.0.1');
  if (endpointUrl.protocol !== 'https:' && !isLocalHttpEndpoint) {
    throw new JevConfigurationError('JEV_ENDPOINT must use HTTPS');
  }

  const timeoutMs = options.timeoutMs ?? JEV_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? 1;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new JevConfigurationError('Jev timeout must be a positive integer');
  }
  if (!Number.isSafeInteger(maxRetries) || maxRetries < 0) {
    throw new JevConfigurationError('Jev maxRetries must be a non-negative integer');
  }

  const fetcher = options.fetcher ?? fetch;
  for (let attempt = 0; ; attempt += 1) {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetcher(endpointUrl, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          accept: 'application/json'
        },
        body: JSON.stringify(request),
        signal: controller.signal
      });
      if (!response.ok) throw new JevApiError(response.status, retryAfterMilliseconds(response));

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new JevProtocolError('Jev API response was not valid JSON');
      }
      return parseSystemOneResponse(payload, Object.keys(request.questions.intent.criteria) as TChoice[]);
    } catch (error) {
      const normalizedError = timedOut ? new JevTimeoutError(timeoutMs) : error;
      if (attempt >= maxRetries || !shouldRetry(normalizedError)) throw normalizedError;
      const retryAfter = normalizedError instanceof JevApiError ? normalizedError.retryAfterMs : undefined;
      await wait(retryAfter ?? Math.min(1_000 * (2 ** attempt), 8_000));
    } finally {
      clearTimeout(timeout);
    }
  }
}
