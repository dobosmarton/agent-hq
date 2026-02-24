import { createHmac } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { Config, Env, PlaneConfig } from "../config";
import type { TaskPoller } from "../poller/task-poller";
import { handlePullRequestEvent } from "./handler";
import type { GitHubPullRequestEvent } from "./types";

/**
 * Verifies GitHub webhook signature using HMAC-SHA256
 *
 * @param payload - Raw request body
 * @param signature - Signature from x-hub-signature-256 header
 * @param secret - GitHub webhook secret
 * @returns true if signature is valid, false otherwise
 */
const verifySignature = (
  payload: string,
  signature: string,
  secret: string,
): boolean => {
  if (!signature.startsWith("sha256=")) {
    return false;
  }

  const expectedSignature = signature.substring(7);
  const hmac = createHmac("sha256", secret);
  hmac.update(payload);
  const actualSignature = hmac.digest("hex");

  return actualSignature === expectedSignature;
};

/**
 * Reads the request body as a string
 *
 * @param req - Incoming HTTP request
 * @returns Promise that resolves to the request body
 */
const readBody = (req: IncomingMessage): Promise<string> => {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
};

/**
 * Creates and starts a webhook HTTP server
 *
 * @param config - Application configuration
 * @param env - Environment variables
 * @param planeConfig - Plane API configuration
 * @param taskPoller - Task poller with project caches
 * @returns Server instance
 */
export const createWebhookServer = (
  config: Config,
  env: Env,
  planeConfig: PlaneConfig,
  taskPoller: TaskPoller,
) => {
  const server = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      // Only handle POST requests to the configured path
      if (req.method !== "POST" || req.url !== config.webhook.path) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
        return;
      }

      try {
        // Read request body
        const body = await readBody(req);

        // Verify signature if secret is configured
        if (env.GITHUB_WEBHOOK_SECRET) {
          const signature = req.headers["x-hub-signature-256"];
          if (!signature || typeof signature !== "string") {
            console.error("❌ Webhook: Missing x-hub-signature-256 header");
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Missing signature" }));
            return;
          }

          if (!verifySignature(body, signature, env.GITHUB_WEBHOOK_SECRET)) {
            console.error("❌ Webhook: Invalid signature");
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid signature" }));
            return;
          }
        } else {
          console.warn(
            "⚠️  Webhook: GITHUB_WEBHOOK_SECRET not configured, skipping signature validation",
          );
        }

        // Parse event payload
        const event = JSON.parse(body) as GitHubPullRequestEvent;

        // Check event type
        const eventType = req.headers["x-github-event"];
        if (eventType !== "pull_request") {
          console.log(`ℹ️  Webhook: Ignoring event type: ${eventType}`);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ message: "Event ignored" }));
          return;
        }

        // Return 200 OK immediately to GitHub
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Webhook received" }));

        // Process webhook asynchronously (don't block response)
        handlePullRequestEvent(event, planeConfig, config, taskPoller)
          .then((result) => {
            if (result.success && result.updatedTasks.length > 0) {
              console.log(
                `✅ Webhook: Successfully processed PR #${event.number}`,
              );
            }
          })
          .catch((err) => {
            console.error(
              `❌ Webhook: Error processing PR #${event.number}:`,
              err,
            );
          });
      } catch (err) {
        console.error("❌ Webhook: Error handling request:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    },
  );

  return server;
};

/**
 * Starts the webhook server
 *
 * @param config - Application configuration
 * @param env - Environment variables
 * @param planeConfig - Plane API configuration
 * @param taskPoller - Task poller with project caches
 * @returns Promise that resolves when server is listening
 */
export const startWebhookServer = (
  config: Config,
  env: Env,
  planeConfig: PlaneConfig,
  taskPoller: TaskPoller,
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const server = createWebhookServer(config, env, planeConfig, taskPoller);

    server.listen(config.webhook.port, () => {
      console.log(
        `🌐 Webhook server listening on http://localhost:${config.webhook.port}${config.webhook.path}`,
      );
      resolve();
    });

    server.on("error", (err) => {
      console.error("❌ Webhook server error:", err);
      reject(err);
    });
  });
};
