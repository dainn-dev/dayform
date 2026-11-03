package dev.dayform.ssh

import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private const val MAX_COMMAND_CHARS = 4000
private const val MAX_TIMEOUT_MS = 120_000
private const val MAX_OUTPUT_BYTES = 1_000_000

/** What `exec` needs; the credentials arrive per call from the secure storage and are never kept. */
internal class ExecRequest : Record {
  @Field var host: String = ""
  @Field var port: Int = 22
  @Field var user: String = ""
  @Field var password: String? = null
  @Field var privateKey: String? = null
  @Field var passphrase: String? = null
  /** The fingerprint the user trusted; a call without one is refused. */
  @Field var fingerprint: String = ""
  @Field var command: String = ""
  @Field var timeoutMs: Int = 30_000
  @Field var maxBytes: Int = 65_536
}

class DayformSshModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DayformSsh")

    // The server's key, read without logging in, so the user can compare it and trust it.
    AsyncFunction("fetchFingerprint") Coroutine { host: String, port: Int, timeoutMs: Int ->
      withContext(Dispatchers.IO) {
        try {
          SshClient.fetchFingerprint(host, port, timeoutMs)
        } catch (failure: SshFailure) {
          throw CodedException(failure.code, failure.message, null)
        }
      }
    }

    // Runs one command and returns its output; the host key is checked against the trusted fingerprint before any login.
    AsyncFunction("exec") Coroutine { request: ExecRequest ->
      withContext(Dispatchers.IO) {
        try {
          if (request.fingerprint.isBlank()) throw SshFailure("HOST_KEY_UNKNOWN", "The server's key is not trusted yet.")
          if (request.command.isBlank() || request.command.length > MAX_COMMAND_CHARS) throw SshFailure("BAD_REQUEST", "The command is empty or too long.")
          val target = Target(request.host, request.port, request.user, request.password, request.privateKey, request.passphrase)
          val outcome = SshClient.exec(target, request.fingerprint, request.command, request.timeoutMs.coerceIn(1_000, MAX_TIMEOUT_MS), request.maxBytes.coerceIn(1, MAX_OUTPUT_BYTES))
          mapOf(
            "exitCode" to outcome.exitCode,
            "stdout" to outcome.stdout,
            "stderr" to outcome.stderr,
            "truncated" to outcome.truncated,
            "timedOut" to outcome.timedOut,
            "fingerprint" to outcome.fingerprint,
          )
        } catch (failure: SshFailure) {
          throw CodedException(failure.code, failure.message, null)
        }
      }
    }
  }
}
