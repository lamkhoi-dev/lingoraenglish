import nodemailer from "nodemailer";

/**
 * SMTP is one of the things the project owner still needs to provide (see
 * KE_HOACH_REBUILD_FULLSTACK.md Giai đoạn 0). Until SMTP_HOST is set this
 * logs instead of sending — same "clearly show not connected, never
 * fabricate" convention src/lib/ai-providers.server.ts already uses for
 * missing AI keys, applied here to missing email config.
 */
let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  const host = process.env["SMTP_HOST"];
  if (!host) return null;
  if (!transporter) {
    const user = process.env["SMTP_USER"];
    transporter = nodemailer.createTransport({
      host,
      port: Number(process.env["SMTP_PORT"] ?? 587),
      secure: process.env["SMTP_SECURE"] === "true",
      auth: user ? { user, pass: process.env["SMTP_PASS"] } : undefined,
    });
  }
  return transporter;
}

export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<void> {
  const t = getTransporter();
  if (!t) {
    console.warn(
      `[email] SMTP_HOST not configured — email NOT sent.\n  to: ${opts.to}\n  subject: ${opts.subject}\n  body: ${opts.html}`,
    );
    return;
  }
  await t.sendMail({
    from: process.env["SMTP_FROM"] ?? "Lingora English <no-reply@lingoraenglishai.com>",
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
}
