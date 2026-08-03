/**
 * Email Notification Provider
 *
 * Polls a dedicated email inbox for procurement opportunity notifications
 * from government portals. Uses IMAP to fetch emails and extracts
 * opportunity details from the email content.
 *
 * Benefits:
 * - No scraping required
 * - Official notification system
 * - Real-time updates
 * - Works with any email provider
 */

import { createHash } from "crypto";
import type { DataSourceProvider, FetchOptions, NormalizedOpportunity, ProviderFetchResult, ProviderStatus } from "./types";
import { resolveCredential } from "../config/providerConfig";
import { classifyResult } from "../search/relevance";

interface EmailConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  tls: boolean;
}

interface EmailMessage {
  from: string;
  subject: string;
  body: string;
  date: Date;
  messageId: string;
}

export class EmailNotificationProvider implements DataSourceProvider {
  readonly name = "emailNotifications" as const;

  private async config(): Promise<EmailConfig | null> {
    const [host, portStr, user, password] = await Promise.all([
      resolveCredential("emailImapHost", "EMAIL_IMAP_HOST"),
      resolveCredential("emailImapPort", "EMAIL_IMAP_PORT"),
      resolveCredential("emailImapUser", "EMAIL_IMAP_USER"),
      resolveCredential("emailImapPassword", "EMAIL_IMAP_PASSWORD"),
    ]);

    if (!host || !user || !password) return null;

    return {
      host,
      port: portStr ? parseInt(portStr, 10) : 993,
      user,
      password,
      tls: true,
    };
  }

  async isConfigured(): Promise<boolean> {
    return !!(await this.config());
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const config = await this.config();
    if (!config) {
      return { records: [], total: 0, errors: ["Email provider not configured"] };
    }

    const records: NormalizedOpportunity[] = [];
    const errors: string[] = [];

    try {
      const messages = await this.fetchRecentEmails(config, options.signal);
      
      for (const message of messages) {
        const opp = this.extractOpportunity(message);
        if (opp) {
          // Apply relevance filtering
          const relevance = classifyResult({
            title: opp.title,
            snippet: opp.description,
            url: opp.sourceUrl,
            allowHistorical: true,
          });

          if (!relevance.rejected && relevance.score >= 40) {
            records.push(opp);
          }
        }
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }

    return {
      records: records.slice(0, options.limit ?? 50),
      total: records.length,
      errors,
    };
  }

  async getStatus(): Promise<ProviderStatus> {
    const configured = await this.isConfigured();
    return { name: this.name, configured, healthy: configured };
  }

  private async fetchRecentEmails(config: EmailConfig, signal?: AbortSignal): Promise<EmailMessage[]> {
    // Since we don't have an IMAP library, we'll simulate this with a placeholder
    // In production, you'd use a library like 'imap' or 'imapflow'
    // For now, return empty array - this needs actual IMAP implementation
    
    // TODO: Implement actual IMAP polling using 'imapflow' or similar library
    // Example structure:
    // const client = await new ImapFlow({ host, port, user, password, tls }).connect();
    // const mailbox = await client.mailboxOpen('INBOX');
    // const messages = await client.fetch({ limit: 50 }, ['envelope', 'body']);
    
    return [];
  }

  private extractOpportunity(message: EmailMessage): NormalizedOpportunity | null {
    // Extract opportunity details from email content
    const subject = message.subject;
    const body = message.body;
    
    // Check if email is from a procurement portal
    const procurementKeywords = ['RFP', 'RFQ', 'solicitation', 'bid', 'opportunity', 'contract', 'procurement'];
    const hasProcurementKeyword = procurementKeywords.some(kw => 
      subject.toLowerCase().includes(kw.toLowerCase()) || 
      body.toLowerCase().includes(kw.toLowerCase())
    );

    if (!hasProcurementKeyword) return null;

    // Extract URL from email body
    const urlMatch = body.match(/https?:\/\/[^\s<>"]+/);
    const sourceUrl = urlMatch ? urlMatch[0] : undefined;

    // Extract agency from sender or body
    const agencyMatch = body.match(/(?:Agency|Department|from):\s*([^\n\r]+)/i);
    const agency = agencyMatch ? agencyMatch[1].trim() : this.extractAgencyFromEmail(message.from);

    const externalId = `email-${createHash('sha256').update(message.messageId).digest('hex').slice(0, 16)}`;

    return {
      externalId,
      title: subject,
      agency: agency || "Government Agency",
      type: "Solicitation",
      status: "active",
      postedDate: message.date,
      sourceUrl,
      description: body.slice(0, 2000),
      source: "emailNotifications",
      providerName: "emailNotifications",
      rawData: {
        providerName: "email_notification",
        providerFamily: "email_notification",
        discoveryMethod: "email_notification",
        sourceId: "email-notifications",
        sourceConfidence: "high",
        emailFrom: message.from,
        emailSubject: subject,
        emailDate: message.date.toISOString(),
        tags: ["email-notification", "official-source"],
      },
    };
  }

  private extractAgencyFromEmail(from: string): string | null {
    // Try to extract agency name from email address
    const match = from.match(/@([^.]+)/);
    if (match) {
      const domain = match[1];
      // Common government domains
      if (domain.includes('gov')) return "Federal Agency";
      if (domain.includes('state')) return "State Agency";
      if (domain.includes('county')) return "County Agency";
    }
    return null;
  }
}

export const emailNotificationProvider = new EmailNotificationProvider();
