/**
 * Telegram message formatter
 *
 * Converts HTML content (from Plane API) into Telegram-friendly HTML format.
 * Uses Telegram's HTML parse mode for better mobile readability with strategic
 * emoji placement and proper formatting.
 *
 * Supported Telegram HTML tags:
 * - <b>, <strong> - bold
 * - <i>, <em> - italic
 * - <code> - inline code
 * - <pre> - code block
 * - <a href=""> - links
 */

const MAX_TELEGRAM_MESSAGE_LENGTH = 4096;
const TRUNCATION_BUFFER = 200; // Reserve space for truncation notice
const SAFE_LENGTH = MAX_TELEGRAM_MESSAGE_LENGTH - TRUNCATION_BUFFER;

/**
 * Emoji map for strategic visual hierarchy
 */
const EMOJI = {
  heading: "📋",
  success: "✅",
  warning: "⚠️",
  comment: "💬",
  link: "🔗",
  label: "🏷️",
} as const;

/**
 * Escape HTML special characters for Telegram HTML mode
 */
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Convert HTML content to Telegram-friendly HTML format
 */
function convertHtmlToTelegram(html: string): string {
  let result = html;

  // Handle headings (h1-h6) → Bold with emoji
  result = result.replace(
    /<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi,
    (_, content) => `<b>${EMOJI.heading} ${content.trim()}</b>\n\n`
  );

  // Handle paragraphs → Text with spacing
  result = result.replace(/<p[^>]*>(.*?)<\/p>/gi, (_, content) => `${content.trim()}\n\n`);

  // Handle unordered lists
  result = result.replace(/<ul[^>]*>(.*?)<\/ul>/gis, (_, listContent) => {
    const items = listContent.match(/<li[^>]*>(.*?)<\/li>/gi) || [];
    const bullets = items
      .map((item: string) => {
        const content = item.replace(/<li[^>]*>(.*?)<\/li>/i, "$1").trim();
        return `• ${content}`;
      })
      .join("\n");
    return `${bullets}\n\n`;
  });

  // Handle ordered lists
  result = result.replace(/<ol[^>]*>(.*?)<\/ol>/gis, (_, listContent) => {
    const items = listContent.match(/<li[^>]*>(.*?)<\/li>/gi) || [];
    const numbered = items
      .map((item: string, index: number) => {
        const content = item.replace(/<li[^>]*>(.*?)<\/li>/i, "$1").trim();
        return `${index + 1}. ${content}`;
      })
      .join("\n");
    return `${numbered}\n\n`;
  });

  // Handle <strong> → <b>
  result = result.replace(/<strong[^>]*>(.*?)<\/strong>/gi, "<b>$1</b>");

  // Handle <em> → <i>
  result = result.replace(/<em[^>]*>(.*?)<\/em>/gi, "<i>$1</i>");

  // Handle <pre> and <code> blocks - keep as-is (Telegram supports them)
  // But ensure content is properly escaped if not already
  result = result.replace(/<pre[^>]*>(.*?)<\/pre>/gis, (match, content) => {
    // Keep pre blocks as-is, they're supported by Telegram
    return `<pre>${content}</pre>`;
  });

  // Handle inline <code> - keep as-is
  result = result.replace(/<code[^>]*>(.*?)<\/code>/gi, (match, content) => {
    return `<code>${content}</code>`;
  });

  // Handle links - keep as-is (Telegram supports <a href="">)
  result = result.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '<a href="$1">$2</a>');

  // Remove any remaining unsupported tags but keep their content
  result = result.replace(/<(?!\/?(b|i|code|pre|a)\b)[^>]+>/gi, "");

  // Clean up excessive whitespace
  result = result.replace(/\n{3,}/g, "\n\n");

  // Only trim leading whitespace, keep intentional trailing newlines
  result = result.replace(/^\s+/, "");

  return result;
}

/**
 * Add strategic emojis to enhance readability
 * Only adds emojis in specific patterns to avoid overuse
 */
function addStrategicEmojis(text: string): string {
  let result = text;

  // Add ✅ to success patterns (not overused - only specific patterns)
  result = result.replace(
    /\b(completed|done|success|passed)\b/gi,
    (match) => `${EMOJI.success} ${match}`
  );

  // Add ⚠️ to warning/error patterns
  result = result.replace(
    /\b(error|warning|failed|blocked)\b/gi,
    (match) => `${EMOJI.warning} ${match}`
  );

  return result;
}

/**
 * Truncate message if it exceeds Telegram's limit
 * Adds a "Read more" notice with link if available
 */
function truncateIfNeeded(text: string, url?: string): string {
  if (text.length <= MAX_TELEGRAM_MESSAGE_LENGTH) {
    return text;
  }

  // Truncate at a reasonable point
  let truncated = text.substring(0, SAFE_LENGTH);

  // Try to truncate at a paragraph boundary
  const lastNewline = truncated.lastIndexOf("\n\n");
  if (lastNewline > SAFE_LENGTH / 2) {
    truncated = truncated.substring(0, lastNewline);
  }

  // Add truncation notice
  const notice = url
    ? `\n\n... (content truncated)\n\n${EMOJI.link} <a href="${url}">Read full details in Plane</a>`
    : "\n\n... (content truncated)";

  return truncated + notice;
}

/**
 * Main formatter function - converts HTML to Telegram-friendly format
 *
 * @param html - HTML content from Plane API
 * @param options - Optional configuration
 * @returns Formatted text ready for Telegram with parse_mode: "HTML"
 */
export function formatForTelegram(
  html: string,
  options?: {
    url?: string;
    addEmojis?: boolean;
  }
): string {
  if (!html || html.trim() === "") {
    return "";
  }

  // Convert HTML to Telegram HTML
  let formatted = convertHtmlToTelegram(html);

  // Add strategic emojis (user feedback: yes, but don't overuse)
  if (options?.addEmojis !== false) {
    formatted = addStrategicEmojis(formatted);
  }

  // Truncate if needed (user feedback: prefer "Read more" link)
  formatted = truncateIfNeeded(formatted, options?.url);

  return formatted;
}

/**
 * Enhanced message chunking that respects HTML tag boundaries
 * Used when message is still too long after formatting
 */
export function smartChunkMessage(text: string, maxLen = MAX_TELEGRAM_MESSAGE_LENGTH): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    // Try to find a good breaking point
    let breakPoint = maxLen;

    // Try to break at paragraph boundary
    const lastParagraph = remaining.lastIndexOf("\n\n", maxLen);
    if (lastParagraph > maxLen / 2) {
      breakPoint = lastParagraph + 2; // Include the newlines
    } else {
      // Try to break at newline
      const lastNewline = remaining.lastIndexOf("\n", maxLen);
      if (lastNewline > maxLen / 2) {
        breakPoint = lastNewline + 1;
      }
    }

    chunks.push(remaining.substring(0, breakPoint).trim());
    remaining = remaining.substring(breakPoint).trim();
  }

  return chunks;
}

/**
 * Format task details for display in Telegram
 * Creates a nicely formatted message for task information
 */
export function formatTaskDetails(task: {
  id: string;
  title: string;
  description_html?: string;
  state?: string;
  priority?: string;
  created_at?: string;
  updated_at?: string;
  url?: string;
}): string {
  const parts: string[] = [];

  // Header with task ID and title
  parts.push(`<b>${EMOJI.heading} ${task.id}: ${task.title}</b>\n`);

  // Metadata
  const metadata: string[] = [];
  if (task.state) metadata.push(`State: <b>${task.state}</b>`);
  if (task.priority) metadata.push(`Priority: ${task.priority}`);
  if (metadata.length > 0) {
    parts.push(metadata.join(" • ") + "\n");
  }

  // Description
  if (task.description_html) {
    const formatted = formatForTelegram(task.description_html, {
      url: task.url,
      addEmojis: false, // Don't add extra emojis to description
    });
    if (formatted) {
      parts.push(`\n${formatted}\n`);
    }
  }

  // Link to Plane
  if (task.url) {
    parts.push(`\n${EMOJI.link} <a href="${task.url}">View in Plane</a>`);
  }

  return parts.join("");
}

/**
 * Format comment for display in Telegram
 */
export function formatComment(comment: {
  author: string;
  comment_html: string;
  created_at: string;
}): string {
  const date = new Date(comment.created_at).toLocaleDateString();
  const formatted = formatForTelegram(comment.comment_html, { addEmojis: false });

  return `${EMOJI.comment} <b>${comment.author}</b> (${date})\n${formatted}`;
}

/**
 * Format GitHub repository options for selection
 */
export function formatRepositoryOptions(
  repos: Array<{
    full_name: string;
    description: string | null;
    language: string | null;
    stargazers_count: number;
  }>
): string {
  if (repos.length === 0) {
    return "No repositories found.";
  }

  const lines = repos.map((repo, index) => {
    const lang = repo.language ? ` • ${repo.language}` : "";
    const stars = repo.stargazers_count > 0 ? ` ⭐ ${repo.stargazers_count}` : "";
    const desc = repo.description
      ? `\n  <i>${escapeHtml(repo.description.substring(0, 80))}</i>`
      : "";
    return `${index + 1}. <b>${escapeHtml(repo.full_name)}</b>${lang}${stars}${desc}`;
  });

  return lines.join("\n\n");
}

/**
 * Format project summary for confirmation
 */
export function formatProjectSummary(project: {
  name: string;
  identifier: string;
  description?: string;
  github_url?: string;
  plane_url?: string;
}): string {
  const parts: string[] = [];

  parts.push(`<b>${EMOJI.heading} ${project.name}</b>`);
  parts.push(`Identifier: <code>${project.identifier}</code>`);

  if (project.description) {
    parts.push(`\n${escapeHtml(project.description)}`);
  }

  if (project.github_url) {
    parts.push(`\n${EMOJI.link} GitHub: <a href="${project.github_url}">${project.github_url}</a>`);
  }

  if (project.plane_url) {
    parts.push(`${EMOJI.link} Plane: <a href="${project.plane_url}">${project.plane_url}</a>`);
  }

  return parts.join("\n");
}

/**
 * Format creation confirmation message
 */
export function formatCreationConfirmation(
  type: "github" | "plane",
  details: {
    name: string;
    identifier?: string;
    url?: string;
  }
): string {
  const emoji = EMOJI.success;
  const typeName = type === "github" ? "GitHub repository" : "Plane project";

  let message = `${emoji} Created ${typeName}: <b>${escapeHtml(details.name)}</b>`;

  if (details.identifier) {
    message += `\nIdentifier: <code>${details.identifier}</code>`;
  }

  if (details.url) {
    message += `\n${EMOJI.link} <a href="${details.url}">View in ${type === "github" ? "GitHub" : "Plane"}</a>`;
  }

  return message;
}
