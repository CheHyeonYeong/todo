import nodemailer from "nodemailer";
import { ArchiveMailer } from "../application/ports.js";

export class SmtpArchiveMailer extends ArchiveMailer {
  constructor({ host, port, user, pass }) {
    super();
    this.settings = { host, port, user, pass };
  }

  async send(to, report) {
    const { host, port, user, pass } = this.settings;
    const transport = nodemailer.createTransport({
      host, port, secure: port === 465, auth: { user, pass },
    });
    await transport.sendMail({
      from: `Todo <${user}>`,
      to,
      subject: report.subject,
      text: report.text,
      attachments: [report.attachment],
    });
  }
}
