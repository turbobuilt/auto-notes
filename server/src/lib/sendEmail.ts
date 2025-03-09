import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

interface EmailOptions {
  to: string | string[];
  from: string;
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
    contentType?: string;
  }>;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    // Load DKIM private key from current working directory
    const dkimPrivateKey = fs.readFileSync(
      path.join(process.cwd(), 'dkim_private.key'),
      'utf8'
    );
    
    // Parse domain from the 'from' email address
    const domain = options.from.split('@')[1];
    
    // Create transporter for direct sending (no relay)
    const transporter = nodemailer.createTransport({
      direct: true,
      dkim: {
        domainName: domain,
        keySelector: 'default', // This should match your DNS selector
        privateKey: dkimPrivateKey
      }
    });
    
    // Send mail with defined transport object
    const info = await transporter.sendMail({
      from: options.from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      replyTo: options.replyTo,
      attachments: options.attachments
    });
    
    console.log('Message sent: %s', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}