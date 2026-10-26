import net from "node:net";
import assert from "node:assert/strict";
import { probeSmtp } from "../src/modules/settings/smtp.probe.js";

function createMockSmtpServer({ rejectAuth = false } = {}) {
  const transcript = [];
  const server = net.createServer((socket) => {
    socket.on("error", () => {});
    socket.write("220 localhost ESMTP MockServer\r\n");

    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      while (buffer.includes("\r\n")) {
        const lineEnd = buffer.indexOf("\r\n");
        const line = buffer.slice(0, lineEnd);
        buffer = buffer.slice(lineEnd + 2);
        transcript.push(line);

        if (line.startsWith("EHLO") || line.startsWith("HELO")) {
          socket.write("250-localhost at your service\r\n250-AUTH PLAIN LOGIN\r\n250 HELP\r\n");
        } else if (line.startsWith("AUTH PLAIN")) {
          if (rejectAuth) {
            socket.write("535 5.7.8 Authentication credentials invalid\r\n");
          } else {
            socket.write("235 2.7.0 Authentication successful\r\n");
          }
        } else if (line === "QUIT") {
          socket.write("221 2.0.0 Bye\r\n");
          socket.end();
        }
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      resolve({
        port,
        transcript,
        close: () => new Promise((res) => server.close(res)),
      });
    });
  });
}

async function run() {
  console.log("======================================");
  console.log("        SMTP PROBE UNIT TESTS         ");
  console.log("======================================");

  // Test 1: Successful authentication
  {
    const mock = await createMockSmtpServer({ rejectAuth: false });
    try {
      const result = await probeSmtp({
        host: "127.0.0.1",
        port: mock.port,
        secure: false,
        username: "test@example.com",
        password: "secretpassword",
        authMode: "password",
      });

      assert.equal(result.connected, true);
      assert.equal(result.authSupported, true);
      assert.equal(result.authAttempted, true);
      assert.equal(result.authAccepted, true);

      // Verify command order: AUTH PLAIN must precede QUIT!
      const authIndex = mock.transcript.findIndex((c) => c.startsWith("AUTH PLAIN"));
      const quitIndex = mock.transcript.indexOf("QUIT");
      assert.ok(authIndex !== -1, "AUTH PLAIN was sent");
      assert.ok(quitIndex !== -1, "QUIT was sent");
      assert.ok(authIndex < quitIndex, "AUTH PLAIN must be sent BEFORE QUIT");

      console.log("✅ Successful SMTP authentication probe (AUTH before QUIT verified)");
    } finally {
      await mock.close();
    }
  }

  // Test 2: Rejected authentication
  {
    const mock = await createMockSmtpServer({ rejectAuth: true });
    try {
      await assert.rejects(
        async () => {
          await probeSmtp({
            host: "127.0.0.1",
            port: mock.port,
            secure: false,
            username: "test@example.com",
            password: "wrongpassword",
            authMode: "password",
          });
        },
        (err) => {
          assert.equal(err.appCode, "SMTP_AUTH_REJECTED");
          return true;
        }
      );
      console.log("✅ Rejected credentials correctly throw SMTP_AUTH_REJECTED");
    } finally {
      await mock.close();
    }
  }

  // Test 3: authMode = "none"
  {
    const mock = await createMockSmtpServer();
    try {
      const result = await probeSmtp({
        host: "127.0.0.1",
        port: mock.port,
        secure: false,
        authMode: "none",
      });

      assert.equal(result.connected, true);
      assert.equal(result.authAttempted, false);
      assert.equal(result.authAccepted, null);

      console.log("✅ Anonymous probe (authMode = 'none') completes without attempting auth");
    } finally {
      await mock.close();
    }
  }

  // Test 4: Missing host
  {
    await assert.rejects(
      async () => {
        await probeSmtp({ host: "" });
      },
      (err) => {
        assert.equal(err.appCode, "SMTP_HOST_REQUIRED");
        return true;
      }
    );
    console.log("✅ Missing host correctly throws SMTP_HOST_REQUIRED");
  }

  // Test 5: Missing credentials when authMode is password
  {
    const mock = await createMockSmtpServer();
    try {
      await assert.rejects(
        async () => {
          await probeSmtp({
            host: "127.0.0.1",
            port: mock.port,
            secure: false,
            username: "",
            password: "",
            authMode: "password",
          });
        },
        (err) => {
          assert.equal(err.appCode, "SMTP_CREDENTIALS_REQUIRED");
          return true;
        }
      );
      console.log("✅ Missing credentials correctly throw SMTP_CREDENTIALS_REQUIRED");
    } finally {
      await mock.close();
    }
  }

  console.log("======================================");
  console.log("All SMTP unit tests passed (5/5)!");
  console.log("======================================");
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
