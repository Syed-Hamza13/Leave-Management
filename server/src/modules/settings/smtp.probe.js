import net from "node:net";
import tls from "node:tls";

import { unprocessable } from "../../lib/appError.js";

/*
 * A bounded SMTP probe: connect, greet, upgrade to TLS when the server offers
 * it, and attempt authentication. It never queues mail, so a wrong password
 * cannot produce a half-sent message.
 *
 * Written directly against node's sockets because the platform deliberately has
 * no mail dependency yet; adding one is a decision for the settings rollout.
 * The password is only ever placed into an AUTH command and never into a
 * returned message or an audit summary.
 */

const DEFAULT_TIMEOUT_MS = 8000;
const MAX_REPLY_BYTES = 16_384;

function probeFailure(code, message) {
  return unprocessable(message, { code });
}

function readReply(socket, timeoutMs) {
  return new Promise((resolve, reject) => {
    let buffer = "";

    const timer = setTimeout(() => {
      cleanup();
      socket.destroy();
      reject(probeFailure("SMTP_TIMEOUT", "The mail server stopped responding."));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);

      socket.off("data", onData);
      socket.off("close", onClose);
      socket.off("error", onError);
    }

    function complete(lines) {
      const last = lines[lines.length - 1];

      /*
       * A reply continues while its final line carries the "-" separator, so an
       * EHLO capability list arrives as one reply, not several.
       */
      if (last && /^\d{3}-/.test(last)) return undefined;

      cleanup();

      return resolve({
        code: Number(String(lines[0] ?? "").slice(0, 3)) || 0,
        lines,
      });
    }

    function onData(chunk) {
      buffer += chunk.toString("utf8");

      if (buffer.length > MAX_REPLY_BYTES) {
        cleanup();
        socket.destroy();

        reject(probeFailure("SMTP_PROTOCOL", "The mail server sent an unexpected reply."));

        return;
      }

      if (!buffer.endsWith("\n")) return;

      complete(buffer.split(/\r?\n/).slice(0, -1));
    }

    function onClose() {
      cleanup();
      reject(probeFailure("SMTP_CLOSED", "The mail server closed the connection."));
    }

    function onError(error) {
      cleanup();
      reject(mapSocketError(error));
    }

    socket.on("data", onData);
    socket.on("close", onClose);
    socket.on("error", onError);
  });
}

function mapSocketError(error) {
  if (error?.code === "ENOTFOUND") {
    return probeFailure("SMTP_HOST_NOT_FOUND", "The mail server host could not be resolved.");
  }

  if (error?.code === "ECONNREFUSED") {
    return probeFailure("SMTP_CONNECTION_REFUSED", "The mail server refused the connection.");
  }

  if (error?.code === "ECONNRESET" || error?.code === "ETIMEDOUT") {
    return probeFailure("SMTP_TIMEOUT", "The mail server stopped responding.");
  }

  return probeFailure("SMTP_CONNECTION_FAILED", error?.message || "The mail server could not be reached.");
}

function send(socket, text) {
  return new Promise((resolve, reject) => {
    socket.write(`${text}\r\n`, (error) => {
      if (error) reject(mapSocketError(error));
      else resolve();
    });
  });
}

async function quitSafely(socket, timeoutMs = 2000) {
  try {
    await send(socket, "QUIT");
    await readReply(socket, timeoutMs);
  } catch {
    // Ignore errors during graceful shutdown
  }
}

function openSocket({ host, port, secure, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const socket = secure
      ? tls.connect({ host, port, servername: host, rejectUnauthorized: true })
      : net.connect({ host, port });

    const timer = setTimeout(() => {
      socket.destroy();
      reject(probeFailure("SMTP_TIMEOUT", "The mail server did not accept the connection in time."));
    }, timeoutMs);

    socket.once(secure ? "secureConnect" : "connect", () => {
      clearTimeout(timer);

      socket.setTimeout(timeoutMs);
      resolve(socket);
    });

    socket.once("timeout", () => {
      socket.destroy();
      reject(probeFailure("SMTP_TIMEOUT", "The mail server did not accept the connection in time."));
    });

    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(mapSocketError(error));
    });
  });
}

function expect(reply, codes, failure) {
  if (!codes.includes(reply.code)) {
    throw failure;
  }

  return reply;
}

function capabilities(reply) {
  const text = reply.lines
    .slice(1)
    .map((line) => line.replace(/^\d{3}[-\s]/, "").trim().toUpperCase())
    .join(" ");

  return {
    startTls: text.includes("STARTTLS"),
    authPlain: /\bAUTH\b.*\bPLAIN\b/.test(text) || /\bAUTH[^\s]*PLAIN\b/.test(text),
    authLogin: /\bAUTH\b.*\bLOGIN\b/.test(text),
    raw: text,
  };
}

const HELLO = "EHLO localhost";

export async function probeSmtp({ host, port, secure, username, password, authMode }) {
  if (!host) {
    throw probeFailure("SMTP_HOST_REQUIRED", "Set the mail server host before testing.");
  }

  const timeoutMs = DEFAULT_TIMEOUT_MS;

  let socket = await openSocket({ host, port, secure, timeoutMs });

  try {
    const greeting = await readReply(socket, timeoutMs);

    expect(greeting, [220], probeFailure("SMTP_PROTOCOL", "The mail server did not greet us."));

    await send(socket, HELLO);

    let hello = await readReply(socket, timeoutMs);

    if (hello.code !== 250) {
      /*
       * Some servers reject EHLO before a HELO exchange, so retry once with the
       * older command before treating it as a failure.
       */
      await send(socket, "HELO localhost");

      hello = await readReply(socket, timeoutMs);

      expect(hello, [250], probeFailure("SMTP_PROTOCOL", "The mail server rejected our introduction."));
    }

    let caps = capabilities(hello);
    let startTlsUsed = false;

    if (!secure && caps.startTls) {
      await send(socket, "STARTTLS");

      const upgraded = await readReply(socket, timeoutMs);

      expect(
        upgraded,
        [220],
        probeFailure("SMTP_STARTTLS_REJECTED", "The mail server would not start TLS.")
      );

      socket = await new Promise((resolve, reject) => {
        const secured = tls.connect({ socket, servername: host, rejectUnauthorized: true });

        const timer = setTimeout(() => {
          secured.destroy();
          reject(probeFailure("SMTP_TIMEOUT", "The TLS handshake did not finish in time."));
        }, timeoutMs);

        secured.once("secureConnect", () => {
          clearTimeout(timer);
          secured.setTimeout(timeoutMs);
          resolve(secured);
        });

        secured.once("error", (error) => {
          clearTimeout(timer);
          reject(probeFailure("SMTP_TLS_FAILED", error?.message || "The TLS handshake failed."));
        });
      });

      startTlsUsed = true;

      await send(socket, HELLO);

      hello = await readReply(socket, timeoutMs);

      expect(hello, [250], probeFailure("SMTP_PROTOCOL", "The mail server rejected us after TLS."));

      caps = capabilities(hello);
    }

    const result = {
      connected: true,
      tls: secure || startTlsUsed,
      startTls: startTlsUsed,
      authSupported: caps.authPlain || caps.authLogin,
      authAttempted: false,
      authAccepted: null,
    };

    if (authMode === "none") {
      await quitSafely(socket);
      return result;
    }

    if (!username || !password) {
      throw probeFailure(
        "SMTP_CREDENTIALS_REQUIRED",
        "Set the mail username and password before testing authentication."
      );
    }

    if (!result.authSupported) {
      throw probeFailure("SMTP_AUTH_UNAVAILABLE", "The mail server does not advertise authentication.");
    }

    result.authAttempted = true;

    if (caps.authPlain) {
      const token = Buffer.from(`\u0000${username}\u0000${password}`, "utf8").toString("base64");

      await send(socket, `AUTH PLAIN ${token}`);

      const reply = await readReply(socket, timeoutMs);

      expect(
        reply,
        [235],
        probeFailure("SMTP_AUTH_REJECTED", "The mail server rejected these credentials.")
      );

      result.authAccepted = true;

      await quitSafely(socket);

      return result;
    }

    /*
     * AUTH LOGIN sends base64 of the user then base64 of the password, each
     * after a 334 prompt. Used only when PLAIN is unavailable.
     */
    await send(socket, "AUTH LOGIN");

    const first = await readReply(socket, timeoutMs);

    expect(first, [334], probeFailure("SMTP_AUTH_UNAVAILABLE", "The mail server refused the login prompt."));

    await send(socket, Buffer.from(String(username), "utf8").toString("base64"));

    const second = await readReply(socket, timeoutMs);

    expect(second, [334], probeFailure("SMTP_AUTH_REJECTED", "The mail server rejected the username."));

    await send(socket, Buffer.from(String(password), "utf8").toString("base64"));

    const accepted = await readReply(socket, timeoutMs);

    expect(
      accepted,
      [235],
      probeFailure("SMTP_AUTH_REJECTED", "The mail server rejected these credentials.")
    );

    result.authAccepted = true;

    await quitSafely(socket);

    return result;
  } finally {
    socket.destroy();
  }
}
