import { getCloudflareContext } from "@opennextjs/cloudflare";
import nodemailer from "nodemailer";
import { connect as connectTls } from "node:tls";
import { siteConfig } from "@/config";

export type ContactNotice = {
  id: string;
  name: string;
  email: string;
  topic?: string;
  message: string;
};

type SMTPEnv = { SMTP_HOST?: string; SMTP_USER?: string; SMTP_PASSWORD?: string };

// Missing credentials, an untrusted host, TLS/auth/network errors, or rejected
// recipients leave notification state pending/failed in D1. SMTP acceptance
// does not establish inbox receipt or that an organizer has read the message.
export async function notifyContact(notice: ContactNotice): Promise<{
  status: "accepted";
  messageId: string;
}> {
  const { env } = await getCloudflareContext({ async: true });
  const settings = env as unknown as SMTPEnv;
  if (!settings.SMTP_HOST || !settings.SMTP_USER || !settings.SMTP_PASSWORD) {
    throw new Error("Contact SMTP credentials are not configured");
  }
  if (!["smtp.zoho.com", "smtppro.zoho.com"].includes(settings.SMTP_HOST)) {
    throw new Error("Contact SMTP host is not an approved Zoho endpoint");
  }
  const transport = nodemailer.createTransport({
    host: settings.SMTP_HOST,
    port: 465,
    secure: true,
    auth: { user: settings.SMTP_USER, pass: settings.SMTP_PASSWORD },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    logger: false,
    debug: false,
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true, servername: settings.SMTP_HOST },
    // Keep the DNS hostname for Workers' TLS proxy rather than Nodemailer's pre-resolved IP.
    getSocket: (_options, callback) => {
      const socket = connectTls({ host: settings.SMTP_HOST, port: 465, servername: settings.SMTP_HOST, rejectUnauthorized: true });
      const timeout = setTimeout(() => socket.destroy(new Error("SMTP TLS connection timed out")), 10_000);
      const onError = (error: Error) => { clearTimeout(timeout); callback(error, {}); };
      socket.once("error", onError);
      socket.once("secureConnect", () => { clearTimeout(timeout); socket.removeListener("error", onError); callback(null, { connection: socket, secured: true }); });
    },
  });
  const result = await transport.sendMail({
    to: siteConfig.contactEmail,
    from: { address: siteConfig.contactEmail, name: siteConfig.name },
    replyTo: notice.email,
    messageId: `<abc-contact-${notice.id}@agentbuildersclub.dev>`,
    subject: `ABC contact: ${notice.topic || "General inquiry"}`,
    text: [
      `Inquiry: ${notice.id}`,
      `Name: ${notice.name}`,
      `Email: ${notice.email}`,
      `Topic: ${notice.topic || "General inquiry"}`,
      "",
      notice.message,
    ].join("\n"),
  });
  const accepted = result.accepted.some((recipient) =>
    recipient.toLowerCase() === siteConfig.contactEmail.toLowerCase(),
  );
  if (!accepted || !result.messageId) throw new Error("SMTP did not accept the organizer notification");
  return { status: "accepted", messageId: result.messageId };
}
