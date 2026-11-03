package dev.dayform.ssh

import android.util.Base64
import com.jcraft.jsch.ChannelExec
import com.jcraft.jsch.HostKey
import com.jcraft.jsch.HostKeyRepository
import com.jcraft.jsch.JSch
import com.jcraft.jsch.JSchException
import com.jcraft.jsch.Session
import com.jcraft.jsch.UserInfo
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.security.MessageDigest

/** A failure the app can name: `code` is one of the strings of lib/ssh.ts (`SshErrorCode`). */
internal class SshFailure(val code: String, message: String) : Exception(message)

internal data class ExecOutcome(
  val exitCode: Int,
  val stdout: String,
  val stderr: String,
  val truncated: Boolean,
  val timedOut: Boolean,
  val fingerprint: String,
)

internal data class Target(
  val host: String,
  val port: Int,
  val user: String,
  val password: String?,
  val privateKey: String?,
  val passphrase: String?,
)

/**
 * One SSH connection per call, closed when the call ends. Nothing here logs, stores or returns a credential. The server's
 * host key is checked BEFORE any password or key is offered: with a trusted fingerprint a different key stops the
 * connection (HOST_KEY_MISMATCH); without one, the key is only read (see [fetchFingerprint]).
 */
internal object SshClient {
  private const val POLL_MS = 40L
  private const val MAX_CONNECT_MS = 60_000

  /** `SHA256:` + unpadded base64 of the SHA-256 of the key blob, the form `ssh-keygen -l` prints. */
  private fun fingerprintOf(key: ByteArray): String =
    "SHA256:" + Base64.encodeToString(MessageDigest.getInstance("SHA-256").digest(key), Base64.NO_PADDING or Base64.NO_WRAP)

  /** Answers the host key check from the one fingerprint the user trusted; remembers the key it saw. */
  private class PinnedKeys(private val trusted: String?) : HostKeyRepository {
    @Volatile var seen: String? = null

    override fun check(host: String?, key: ByteArray?): Int {
      if (key == null) return HostKeyRepository.NOT_INCLUDED
      val fingerprint = fingerprintOf(key)
      seen = fingerprint
      return when {
        trusted == null -> HostKeyRepository.NOT_INCLUDED
        trusted == fingerprint -> HostKeyRepository.OK
        else -> HostKeyRepository.CHANGED
      }
    }

    override fun add(hostkey: HostKey?, ui: UserInfo?) {}
    override fun remove(host: String?, type: String?) {}
    override fun remove(host: String?, type: String?, key: ByteArray?) {}
    override fun getKnownHostsRepositoryID(): String = "dayform"
    override fun getHostKey(): Array<HostKey> = emptyArray()
    override fun getHostKey(host: String?, type: String?): Array<HostKey> = emptyArray()
  }

  private fun open(target: Target, trusted: String?, timeoutMs: Int): Pair<Session, PinnedKeys> {
    val jsch = JSch()
    val keys = PinnedKeys(trusted)
    jsch.setHostKeyRepository(keys)
    val hasKey = !target.privateKey.isNullOrBlank()
    if (hasKey) {
      jsch.addIdentity("dayform", target.privateKey!!.toByteArray(Charsets.UTF_8), null, target.passphrase?.toByteArray(Charsets.UTF_8))
    }
    val session = jsch.getSession(target.user, target.host, target.port)
    // "yes" refuses an unknown or changed key before authentication; the repository above decides what is known.
    session.setConfig("StrictHostKeyChecking", "yes")
    session.setConfig("PreferredAuthentications", if (hasKey) "publickey" else "password")
    if (!hasKey && target.password != null) session.setPassword(target.password)
    try {
      session.connect(timeoutMs.coerceIn(1_000, MAX_CONNECT_MS))
    } catch (error: JSchException) {
      session.disconnect()
      throw classify(error, keys, trusted)
    }
    return session to keys
  }

  private fun classify(error: JSchException, keys: PinnedKeys, trusted: String?): SshFailure {
    val text = error.message.orEmpty()
    val seen = keys.seen
    return when {
      seen != null && trusted != null && seen != trusted -> SshFailure("HOST_KEY_MISMATCH", "The server's key changed.")
      seen != null && trusted == null && text.contains("HostKey", ignoreCase = true) -> SshFailure("HOST_KEY_UNKNOWN", "The server's key is not trusted yet.")
      text.contains("Auth", ignoreCase = true) -> SshFailure("AUTH_FAILED", "The server refused the login.")
      text.contains("invalid privatekey", ignoreCase = true) || text.contains("passphrase", ignoreCase = true) -> SshFailure("KEY_INVALID", "The private key could not be read (wrong format or passphrase).")
      text.contains("timeout", ignoreCase = true) || text.contains("timed out", ignoreCase = true) -> SshFailure("TIMEOUT", "The server did not answer in time.")
      text.contains("Algorithm negotiation", ignoreCase = true) -> SshFailure("NEGOTIATION_FAILED", "No algorithm in common with the server.")
      else -> SshFailure("CONNECT_FAILED", "Could not connect to the server.")
    }
  }

  /** Reads the server's key without logging in. */
  fun fetchFingerprint(host: String, port: Int, timeoutMs: Int): String {
    val jsch = JSch()
    val keys = PinnedKeys(null)
    jsch.setHostKeyRepository(keys)
    val session = jsch.getSession("dayform", host, port)
    session.setConfig("StrictHostKeyChecking", "yes")
    session.setConfig("PreferredAuthentications", "none")
    try {
      session.connect(timeoutMs.coerceIn(1_000, MAX_CONNECT_MS))
    } catch (error: JSchException) {
      // The check rejects the unknown key by design; the key was seen by then. No key seen means the server was not reached.
      val seen = keys.seen
      if (seen != null) return seen
      throw classify(error, keys, null)
    } finally {
      session.disconnect()
    }
    return keys.seen ?: throw SshFailure("CONNECT_FAILED", "Could not read the server's key.")
  }

  /** Reads what is available from a stream into `into`, keeping at most `room` bytes in total; returns true when bytes were dropped. */
  private fun drain(stream: InputStream, into: ByteArrayOutputStream, room: Int): Boolean {
    var dropped = false
    val chunk = ByteArray(4096)
    while (stream.available() > 0) {
      val read = stream.read(chunk, 0, chunk.size)
      if (read <= 0) break
      val keep = (room - into.size()).coerceIn(0, read)
      if (keep > 0) into.write(chunk, 0, keep)
      if (keep < read) dropped = true
    }
    return dropped
  }

  fun exec(target: Target, trusted: String, command: String, timeoutMs: Int, maxBytes: Int): ExecOutcome {
    val (session, keys) = open(target, trusted, minOf(timeoutMs, MAX_CONNECT_MS))
    val out = ByteArrayOutputStream()
    val err = ByteArrayOutputStream()
    var truncated = false
    var timedOut = false
    val channel = session.openChannel("exec") as ChannelExec
    try {
      channel.setCommand(command)
      channel.inputStream = null
      val stdout = channel.inputStream
      val stderr = channel.extInputStream
      channel.connect(timeoutMs.coerceIn(1_000, MAX_CONNECT_MS))
      val deadline = System.currentTimeMillis() + timeoutMs
      val room = maxBytes.coerceAtLeast(1)
      while (true) {
        if (drain(stdout, out, room)) truncated = true
        if (drain(stderr, err, room)) truncated = true
        if (channel.isClosed) {
          // Whatever arrived between the last poll and the close.
          if (drain(stdout, out, room)) truncated = true
          if (drain(stderr, err, room)) truncated = true
          break
        }
        if (System.currentTimeMillis() > deadline) {
          timedOut = true
          break
        }
        Thread.sleep(POLL_MS)
      }
      val code = if (timedOut) -1 else channel.exitStatus
      return ExecOutcome(
        exitCode = code,
        stdout = String(out.toByteArray(), Charsets.UTF_8),
        stderr = String(err.toByteArray(), Charsets.UTF_8),
        truncated = truncated,
        timedOut = timedOut,
        fingerprint = keys.seen ?: trusted,
      )
    } catch (error: JSchException) {
      throw SshFailure("CONNECT_FAILED", "The command could not be run.")
    } finally {
      channel.disconnect()
      session.disconnect()
    }
  }
}
