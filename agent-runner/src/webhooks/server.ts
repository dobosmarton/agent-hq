import { createHmac, timingSafeEqual } from "node:crypto";
import { serve } from "@hono/node-server";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Config, Env, PlaneConfig } from "../config";
import type { TaskPoller } from "../poller/task-poller";
import type { ReviewOrchestrator } from "../review-agent/orchestrator";
import { handlePullRequestEvent, handlePullRequestReviewTrigger } from "./handler";
import { GitHubPullRequestEventSchema } from "./types";

// --- Types ---

export type WebhookDeps = {
  config: Config;
  env: Env;
  planeConfig: PlaneConfig;
  taskPoller: TaskPoller;
  reviewAgent?: ReviewOrchestrator;
};

type WebhookEnv = {
  Variables: {
    deps: WebhookDeps;
  };
};

// --- Helpers ---

const verifySignature = (payload: string, signature: string, secret: string): boolean => {
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
    Buffer.from(expectedSignature, "hex")
  );
};

// --- Zod schemas ---

const WebhookSuccessResponseSchema = z.object({
  message: z.string(),
});

const ErrorResponseSchema = z.object({
  error: z.string(),
});

const HealthResponseSchema = z.object({
  status: z.literal("ok"),
});

// --- Route definitions (static, no runtime deps) ---

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

// --- App factory (deps injected via middleware) ---

export const createWebhookApp = (deps: WebhookDeps): OpenAPIHono<WebhookEnv> => {
  const app = new OpenAPIHono<WebhookEnv>();

  app.onError((err, c) => {
    console.error(`[Webhook] ${err.message}`, err.stack);
    return c.json({ error: "Internal server error" }, 500);
  });

  app.notFound((c) => {
    return c.json({ error: "Not found" }, 404);
  });

  // Inject deps into every request
  app.use("*", async (c, next) => {
    c.set("deps", deps);
    await next();
  });

  // Webhook endpoint — body is read as raw text for HMAC signature verification,
  // then parsed and validated with Zod manually (can't use OpenAPI body validation
  // because we need the raw string before JSON parsing for signature check).
  // Route path is dynamic (from config), so this route definition stays inline.
  const webhookRoute = createRoute({
    method: "post",
    path: deps.config.webhook.path,
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
    const { env, planeConfig, config, taskPoller, reviewAgent } = c.var.deps;

    try {
      const body = await c.req.text();

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
          "⚠️  Webhook: GITHUB_WEBHOOK_SECRET not configured, skipping signature validation"
        );
      }

      const eventType = c.req.header("x-github-event");
      if (eventType !== "pull_request") {
        console.log(`ℹ️  Webhook: Ignoring event type: ${eventType}`);
        return c.json({ message: "Event ignored" }, 200);
      }

      const parsed = GitHubPullRequestEventSchema.safeParse(JSON.parse(body));
      if (!parsed.success) {
        console.error("❌ Webhook: Invalid payload:", parsed.error.message);
        return c.json({ error: "Invalid payload" }, 400);
      }

      const event = parsed.data;

      // Process webhook asynchronously — respond 200 immediately to GitHub

      // Handle merged PRs (update task status)
      if (event.action === "closed" && event.pull_request.merged) {
        void handlePullRequestEvent(event, planeConfig, config, taskPoller).catch((err) => {
          console.error(`❌ Webhook: Error processing merged PR #${event.number}:`, err);
        });
      }

      // Handle opened/synchronize PRs (trigger review)
      if (event.action === "opened" || event.action === "synchronize") {
        void handlePullRequestReviewTrigger(event, reviewAgent, taskPoller, config).catch((err) => {
          console.error(`❌ Webhook: Error triggering review for PR #${event.number}:`, err);
        });
      }

      return c.json({ message: "Webhook received" }, 200);
    } catch (err) {
      console.error("❌ Webhook: Error handling request:", err);
      return c.json({ error: "Internal server error" }, 500);
    }
  });

  // Health check
  app.openapi(healthRoute, (c) => {
    return c.json({ status: "ok" as const }, 200);
  });

  return app;
};

// --- Server startup ---

export const startWebhookServer = (deps: WebhookDeps): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      const app = createWebhookApp(deps);

      const server = serve(
        {
          fetch: app.fetch,
          port: deps.config.webhook.port,
        },
        () => {
          console.log(
            `🌐 Webhook server listening on http://localhost:${deps.config.webhook.port}${deps.config.webhook.path}`
          );
          resolve();
        }
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
