import { createHmac, timingSafeEqual } from "node:crypto";
import { serve } from "@hono/node-server";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Config, Env, PlaneConfig } from "../config";
import type { TaskPoller } from "../poller/task-poller";
import { handlePullRequestEvent } from "./handler";
import { GitHubPullRequestEventSchema } from "./types";

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

  if (actualSignature.length !== expectedSignature.length) {
    return false;
  }

  return timingSafeEqual(
    Buffer.from(actualSignature, "hex"),
    Buffer.from(expectedSignature, "hex"),
  );
};

// Response schemas
const WebhookSuccessResponseSchema = z.object({
  message: z.string(),
});

const ErrorResponseSchema = z.object({
  error: z.string(),
});

const HealthResponseSchema = z.object({
  status: z.literal("ok"),
});

/**
 * Creates a Hono webhook application
 *
 * @param config - Application configuration
 * @param env - Environment variables
 * @param planeConfig - Plane API configuration
 * @param taskPoller - Task poller with project caches
 * @returns Hono app instance
 */
export const createWebhookApp = (
  config: Config,
  env: Env,
  planeConfig: PlaneConfig,
  taskPoller: TaskPoller,
): OpenAPIHono<{}> => {
  const app = new OpenAPIHono<{}>();

  // Global error handlers — consistent JSON responses
  app.onError((err, c) => {
    console.error(`[Webhook] ${err.message}`, err.stack);
    return c.json({ error: "Internal server error" }, 500);
  });

  app.notFound((c) => {
    return c.json({ error: "Not found" }, 404);
  });

  // Webhook endpoint — body is read as raw text for HMAC signature verification,
  // then parsed and validated with Zod manually (can't use OpenAPI body validation
  // because we need the raw string before JSON parsing for signature check).
  const webhookRoute = createRoute({
    method: "post",
    path: config.webhook.path,
    responses: {
      200: {
        content: {
          "application/json": {
            schema: WebhookSuccessResponseSchema,
          },
        },
        description: "Webhook received successfully",
      },
      400: {
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
          },
        },
        description: "Invalid payload",
      },
      401: {
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
          },
        },
        description: "Missing or invalid signature",
      },
      500: {
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
          },
        },
        description: "Internal server error",
      },
    },
  });

  app.openapi(webhookRoute, async (c) => {
    try {
      // Get raw body text for signature verification
      const body = await c.req.text();

      // Verify signature if secret is configured
      if (env.GITHUB_WEBHOOK_SECRET) {
        const signature = c.req.header("x-hub-signature-256");
        if (!signature) {
          console.error("❌ Webhook: Missing x-hub-signature-256 header");
          return c.json({ error: "Missing signature" }, 401);
        }

        if (!verifySignature(body, signature, env.GITHUB_WEBHOOK_SECRET)) {
          console.error("❌ Webhook: Invalid signature");
          return c.json({ error: "Invalid signature" }, 401);
        }
      } else {
        console.warn(
          "⚠️  Webhook: GITHUB_WEBHOOK_SECRET not configured, skipping signature validation",
        );
      }

      // Check event type
      const eventType = c.req.header("x-github-event");
      if (eventType !== "pull_request") {
        console.log(`ℹ️  Webhook: Ignoring event type: ${eventType}`);
        return c.json({ message: "Event ignored" }, 200);
      }

      // Parse and validate event payload at the boundary
      const parsed = GitHubPullRequestEventSchema.safeParse(JSON.parse(body));
      if (!parsed.success) {
        console.error("❌ Webhook: Invalid payload:", parsed.error.message);
        return c.json({ error: "Invalid payload" }, 400);
      }

      const event = parsed.data;

      // Process webhook asynchronously — respond 200 immediately to GitHub
      void handlePullRequestEvent(event, planeConfig, config, taskPoller).catch(
        (err) => {
          console.error(
            `❌ Webhook: Error processing PR #${event.number}:`,
            err,
          );
        },
      );

      return c.json({ message: "Webhook received" }, 200);
    } catch (err) {
      console.error("❌ Webhook: Error handling request:", err);
      return c.json({ error: "Internal server error" }, 500);
    }
  });

  // Health check endpoint
  const healthRoute = createRoute({
    method: "get",
    path: "/health",
    responses: {
      200: {
        content: {
          "application/json": {
            schema: HealthResponseSchema,
          },
        },
        description: "Service health status",
      },
    },
  });

  app.openapi(healthRoute, (c) => {
    return c.json({ status: "ok" as const }, 200);
  });

  return app;
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
    try {
      const app = createWebhookApp(config, env, planeConfig, taskPoller);

      const server = serve(
        {
          fetch: app.fetch,
          port: config.webhook.port,
        },
        () => {
          console.log(
            `🌐 Webhook server listening on http://localhost:${config.webhook.port}${config.webhook.path}`,
          );
          resolve();
        },
      );

      server.on("error", (err: Error) => {
        console.error("❌ Webhook server error:", err);
        reject(err);
      });
    } catch (err) {
      console.error("❌ Failed to create webhook server:", err);
      reject(err);
    }
  });
};
