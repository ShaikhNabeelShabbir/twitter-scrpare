import * as Sentry from "@sentry/node";

export interface TwitterError {
  code: number;
  message: string;
}

export interface TwitterResponse {
  ok?: boolean;
  errors?: TwitterError[];
  success?: boolean;
  authenticated?: boolean;
  headers?: Headers;
  status?: number;
  statusText?: string;
}

export class TwitterResponseError extends Error {
  constructor(
    message: string,
    public context: string,
    public statusCode?: number,
    public errorCode?: number,
    public response?: TwitterResponse
  ) {
    super(message);
    this.name = "TwitterResponseError";
  }
}

export function validateTwitterResponse(
  response: any,
  context: string
): TwitterResponse {
  if (!response) {
    throw new TwitterResponseError(`No response received`, context);
  }

  // Check HTTP status code
  if (response.status && response.status >= 400) {
    throw new TwitterResponseError(
      `HTTP Error: ${response.status} ${response.statusText || ""}`,
      context,
      response.status
    );
  }

  // Check for error in response data
  if (response.errors && response.errors.length > 0) {
    const error = response.errors[0];
    throw new TwitterResponseError(
      `API Error: ${error.message}`,
      context,
      response.status,
      error.code,
      response
    );
  }

  // Check for ok status
  if (response.ok === false) {
    throw new TwitterResponseError(
      `API returned ok=false`,
      context,
      response.status,
      undefined,
      response
    );
  }

  // Check for successful login indicators
  if (context === "login" && !response.success && !response.authenticated) {
    throw new TwitterResponseError(
      `Authentication not confirmed`,
      context,
      response.status,
      undefined,
      response
    );
  }

  return response;
}
