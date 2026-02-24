import { describe, it, expect } from "vitest";
import {
  AgenticFlowError,
  NetworkError,
  RequestTimeoutError,
  APIError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ServerError,
} from "../src/exceptions.js";

describe("SDK Exceptions", () => {
  it("AgenticFlowError is an instance of Error", () => {
    const err = new AgenticFlowError("test");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AgenticFlowError);
    expect(err.message).toBe("test");
    expect(err.name).toBe("AgenticFlowError");
  });

  it("NetworkError extends AgenticFlowError", () => {
    const cause = new Error("socket hang up");
    const err = new NetworkError("network failed", { cause });
    expect(err).toBeInstanceOf(AgenticFlowError);
    expect(err).toBeInstanceOf(NetworkError);
    expect(err.cause).toBe(cause);
  });

  it("RequestTimeoutError extends NetworkError", () => {
    const err = new RequestTimeoutError();
    expect(err).toBeInstanceOf(NetworkError);
    expect(err.message).toBe("Request timed out.");
    expect(err.name).toBe("RequestTimeoutError");
  });

  it("APIError carries status code and payload", () => {
    const err = new APIError({
      statusCode: 500,
      message: "Internal Server Error",
      payload: { detail: "oops" },
      requestId: "req-123",
    });
    expect(err).toBeInstanceOf(AgenticFlowError);
    expect(err.statusCode).toBe(500);
    expect(err.payload).toEqual({ detail: "oops" });
    expect(err.requestId).toBe("req-123");
  });

  it("ValidationError has status code from options", () => {
    const err = new ValidationError({ statusCode: 422, message: "bad input" });
    expect(err).toBeInstanceOf(APIError);
    expect(err.name).toBe("ValidationError");
    expect(err.statusCode).toBe(422);
  });

  it("AuthenticationError has correct name", () => {
    const err = new AuthenticationError({ statusCode: 401, message: "unauth" });
    expect(err).toBeInstanceOf(APIError);
    expect(err.name).toBe("AuthenticationError");
  });

  it("AuthorizationError has correct name", () => {
    const err = new AuthorizationError({ statusCode: 403, message: "forbidden" });
    expect(err.name).toBe("AuthorizationError");
  });

  it("NotFoundError has correct name", () => {
    const err = new NotFoundError({ statusCode: 404, message: "not found" });
    expect(err.name).toBe("NotFoundError");
  });

  it("ConflictError has correct name", () => {
    const err = new ConflictError({ statusCode: 409, message: "conflict" });
    expect(err.name).toBe("ConflictError");
  });

  it("RateLimitError has correct name", () => {
    const err = new RateLimitError({ statusCode: 429, message: "rate limited" });
    expect(err.name).toBe("RateLimitError");
  });

  it("ServerError has correct name", () => {
    const err = new ServerError({ statusCode: 500, message: "server error" });
    expect(err.name).toBe("ServerError");
  });

  it("APIError defaults payload and requestId to null", () => {
    const err = new APIError({ statusCode: 400, message: "bad" });
    expect(err.payload).toBeNull();
    expect(err.requestId).toBeNull();
  });
});
