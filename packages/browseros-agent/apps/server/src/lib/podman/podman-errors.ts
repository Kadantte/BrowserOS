/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

export type PodmanTransportErrorKind =
  | 'not_found'
  | 'conflict'
  | 'timeout'
  | 'permission_denied'
  | 'transport_unavailable'
  | 'command_failed'
  | 'api_error'
  | 'unknown'

export interface PodmanTransportErrorDetails {
  command?: string[]
  exitCode?: number
  responseBody?: string
  statusCode?: number
  stderr?: string
  stdout?: string
}

export class PodmanTransportError extends Error {
  constructor(
    message: string,
    readonly kind: PodmanTransportErrorKind,
    readonly retryable: boolean,
    readonly details?: PodmanTransportErrorDetails,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'PodmanTransportError'
  }
}

export function buildApiError(
  message: string,
  statusCode: number,
  responseBody: string,
): PodmanTransportError {
  return new PodmanTransportError(
    message,
    getErrorKindForStatus(statusCode),
    isRetryableStatus(statusCode),
    {
      responseBody,
      statusCode,
    },
  )
}

export function buildCommandError(input: {
  command: string[]
  exitCode: number
  stderr: string
  stdout?: string
}): PodmanTransportError {
  const stderr = input.stderr.trim()
  const stdout = input.stdout?.trim()
  const message =
    stderr ||
    stdout ||
    `Podman command failed with exit code ${input.exitCode}: ${input.command.join(' ')}`

  return new PodmanTransportError(
    message,
    getErrorKindForOutput(stderr || stdout || ''),
    isRetryableExitCode(input.exitCode),
    {
      command: input.command,
      exitCode: input.exitCode,
      stderr,
      stdout,
    },
  )
}

export function isPodmanTransportError(
  error: unknown,
): error is PodmanTransportError {
  return error instanceof PodmanTransportError
}

function getErrorKindForOutput(output: string): PodmanTransportErrorKind {
  const text = output.toLowerCase()

  if (
    text.includes('no such') ||
    text.includes('not found') ||
    text.includes('does not exist')
  ) {
    return 'not_found'
  }
  if (text.includes('already exists') || text.includes('is already in use')) {
    return 'conflict'
  }
  if (
    text.includes('permission denied') ||
    text.includes('operation not permitted')
  ) {
    return 'permission_denied'
  }
  if (
    text.includes('connection refused') ||
    text.includes('broken pipe') ||
    text.includes('failed to connect') ||
    text.includes('i/o timeout') ||
    text.includes('timed out')
  ) {
    return 'transport_unavailable'
  }

  return 'command_failed'
}

function getErrorKindForStatus(statusCode: number): PodmanTransportErrorKind {
  if (statusCode === 404) return 'not_found'
  if (statusCode === 409) return 'conflict'
  if (statusCode === 408) return 'timeout'
  if (statusCode === 401 || statusCode === 403) return 'permission_denied'
  if (statusCode >= 500) return 'transport_unavailable'
  return 'api_error'
}

function isRetryableStatus(statusCode: number): boolean {
  return statusCode === 408 || statusCode === 429 || statusCode >= 500
}

function isRetryableExitCode(exitCode: number): boolean {
  return exitCode !== 0
}
