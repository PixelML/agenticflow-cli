/**
 * Exception hierarchy for the AgenticFlow SDK.
 */

export class AgenticFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgenticFlowError";
  }
}

export class NetworkError extends AgenticFlowError {
  cause?: Error;

  constructor(message: string, options?: { cause?: Error }) {
    super(message);
    this.name = "NetworkError";
    this.cause = options?.cause;
  }
}

export class RequestTimeoutError extends NetworkError {
  constructor(message: string = "Request timed out.", options?: { cause?: Error }) {
    super(message, options);
    this.name = "RequestTimeoutError";
  }
}

export class APIError extends AgenticFlowError {
  statusCode: number;
  payload: unknown;
  requestId: string | null;

  constructor(options: {
    statusCode: number;
    message: string;
    payload?: unknown;
    requestId?: string | null;
  }) {
    super(options.message);
    this.name = "APIError";
    this.statusCode = options.statusCode;
    this.payload = options.payload ?? null;
    this.requestId = options.requestId ?? null;
  }
}

export class ValidationError extends APIError {
  constructor(options: ConstructorParameters<typeof APIError>[0]) {
    super(options);
    this.name = "ValidationError";
  }
}

export class AuthenticationError extends APIError {
  constructor(options: ConstructorParameters<typeof APIError>[0]) {
    super(options);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends APIError {
  constructor(options: ConstructorParameters<typeof APIError>[0]) {
    super(options);
    this.name = "AuthorizationError";
  }
}

export class NotFoundError extends APIError {
  constructor(options: ConstructorParameters<typeof APIError>[0]) {
    super(options);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends APIError {
  constructor(options: ConstructorParameters<typeof APIError>[0]) {
    super(options);
    this.name = "ConflictError";
  }
}

export class RateLimitError extends APIError {
  constructor(options: ConstructorParameters<typeof APIError>[0]) {
    super(options);
    this.name = "RateLimitError";
  }
}

export class ServerError extends APIError {
  constructor(options: ConstructorParameters<typeof APIError>[0]) {
    super(options);
    this.name = "ServerError";
  }
}
