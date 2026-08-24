import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Resend } from 'resend';
import * as dns from 'dns';

@Injectable()
export class EmailService {
private readonly resend: Resend;

constructor() {
  this.resend = new Resend(process.env.RESEND_API_KEY);
}

 async sendProposalEmail(params: {
  to: string;
  clientName: string;
  proposal: any;
}) {
  const { to, clientName, proposal } = params;

  if (!to) {
    throw new InternalServerErrorException(
      'Client email is required',
    );
  }

  try {
    const { data, error } = await this.resend.emails.send({
      from: 'AYORIX <hello.ayorix@gmail.com>',
      to: [to],
      subject:
        proposal?.title ||
        'Your AYORIX Project Proposal',
      text: this.buildProposalText(
        clientName,
        proposal,
      ),
      html: this.buildProposalHtml(
        clientName,
        proposal,
      ),
    });

    if (error) {
      console.error(
        '[AIRA EMAIL] Resend failed:',
        error,
      );

      throw new InternalServerErrorException(
        error.message || 'Failed to send proposal email',
      );
    }

    console.log('[AIRA EMAIL] Proposal sent:', {
      to,
      id: data?.id,
    });

    return {
      success: true,
      messageId: data?.id,
    };
  } catch (error) {
    console.error(
      '[AIRA EMAIL] Failed to send proposal:',
      error,
    );

    if (error instanceof InternalServerErrorException) {
      throw error;
    }

    throw new InternalServerErrorException(
      'Failed to send proposal email',
    );
  }
}

  async testConnection() {
  try {
    // Resend's Emails client does not expose a `verify` method. Use a
    // read-only domains request to validate the configured connection.
    await this.resend.domains.list();

    console.log('[AIRA EMAIL] Resend connection successful');

    return {
      success: true,
      message: 'Resend connection successful',
    };
} catch (error) {
  console.error(
    '[AIRA EMAIL] Resend connection failed:',
    error,
  );

  return {
    success: false,
    message:
      error instanceof Error
        ? error.message
        : String(error),
    code: (error as any)?.code,
    command: (error as any)?.command,
  };
}
}

  private buildProposalText(
  clientName: string,
  proposal: any,
): string {
  return `
AYORIX
Digital Solutions

PROJECT PROPOSAL

Hello ${clientName || 'there'},

Thank you for choosing AYORIX.

We’ve prepared the following project overview based on the requirements discussed with you.

PROJECT
${proposal?.title || 'Website Project'}

PROJECT SUMMARY
${proposal?.projectSummary || 'A tailored digital solution based on the discussed requirements.'}

SCOPE
${(proposal?.scope || []).map((item: string) => `• ${item}`).join('\n') || 'To be confirmed'}

TECHNOLOGY
${(proposal?.technology || []).join(', ') || 'To be confirmed'}

SEO
${(proposal?.seo || []).join(', ') || 'To be confirmed'}

TIMELINE
${proposal?.timeline || 'To be confirmed'}

ESTIMATED PROJECT COST
${proposal?.budget || 'To be confirmed'}

Please note: This is an estimated project cost based on the requirements discussed. The final project cost will be confirmed by AYORIX after reviewing the complete requirements.

NEXT STEP
${proposal?.nextStep || 'AYORIX will review your project details and reach out to you shortly.'}

If you have any questions or would like to discuss anything further, simply reply to this email.

Regards,

AYORIX
Digital Solutions

Built on Values. Driven by Innovation.
`.trim();
}

private buildProposalHtml(
  clientName: string,
  proposal: any,
): string {
  const scope = proposal?.scope || [];
  const technology = proposal?.technology || [];
  const seo = proposal?.seo || [];

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${proposal?.title || 'AYORIX Project Proposal'}</title>
</head>

<body
  style="
    margin:0;
    padding:0;
    background:#f4f4f2;
    font-family:Arial, Helvetica, sans-serif;
    color:#171717;
  "
>

  <div style="padding:40px 16px;">

    <table
      width="100%"
      cellpadding="0"
      cellspacing="0"
      border="0"
      style="max-width:680px;margin:0 auto;background:#ffffff;"
    >

      <!-- HEADER -->
      <tr>
        <td
          style="
            padding:32px 36px;
            border-bottom:1px solid #e8e8e8;
          "
        >
          <div
            style="
              font-size:22px;
              font-weight:700;
              letter-spacing:-0.8px;
              color:#111111;
            "
          >
            AYORIX
          </div>

          <div
            style="
              margin-top:6px;
              font-size:10px;
              letter-spacing:2px;
              text-transform:uppercase;
              color:#888888;
            "
          >
            Digital Solutions
          </div>
        </td>
      </tr>

      <!-- INTRO -->
      <tr>
        <td style="padding:38px 36px 24px;">

          <div
            style="
              font-size:10px;
              letter-spacing:2px;
              text-transform:uppercase;
              color:#9B6CFF;
              font-weight:600;
            "
          >
            Project Proposal
          </div>

          <h1
            style="
              margin:12px 0 16px;
              font-size:28px;
              line-height:1.2;
              letter-spacing:-1px;
              font-weight:600;
              color:#111111;
            "
          >
            ${proposal?.title || 'Website Project'}
          </h1>

          <p
            style="
              margin:0;
              font-size:14px;
              line-height:1.8;
              color:#666666;
            "
          >
            Hello ${clientName || 'there'},
          </p>

          <p
            style="
              margin:14px 0 0;
              font-size:14px;
              line-height:1.8;
              color:#666666;
            "
          >
            Thank you for choosing AYORIX. I have prepared this
            project overview based on the requirements discussed.
          </p>

        </td>
      </tr>

      <!-- SUMMARY -->
      <tr>
        <td style="padding:10px 36px 28px;">

          <div
            style="
              padding:22px;
              background:#fafafa;
              border:1px solid #eeeeee;
            "
          >

            <div
              style="
                font-size:10px;
                letter-spacing:1.6px;
                text-transform:uppercase;
                color:#999999;
                margin-bottom:9px;
              "
            >
              Project Summary
            </div>

            <div
              style="
                font-size:14px;
                line-height:1.7;
                color:#333333;
              "
            >
              ${proposal?.projectSummary || 'A tailored digital solution based on the discussed requirements.'}
            </div>

          </div>

        </td>
      </tr>

      <!-- DETAILS -->
      <tr>
        <td style="padding:0 36px 10px;">

          <div
            style="
              font-size:10px;
              letter-spacing:1.8px;
              text-transform:uppercase;
              color:#999999;
              margin-bottom:18px;
            "
          >
            Project Details
          </div>

          <!-- SCOPE -->
          <div style="margin-bottom:25px;">
            <div
              style="
                font-size:12px;
                font-weight:600;
                color:#222222;
                margin-bottom:10px;
              "
            >
              Scope
            </div>

            <ul
              style="
                margin:0;
                padding-left:20px;
                color:#555555;
                font-size:13px;
                line-height:2;
              "
            >
              ${
                scope.length
                  ? scope
                      .map(
                        (item: string) =>
                          `<li>${item}</li>`,
                      )
                      .join('')
                  : '<li>To be confirmed</li>'
              }
            </ul>
          </div>

          <!-- TECHNOLOGY -->
          <div style="margin-bottom:25px;">
            <div
              style="
                font-size:12px;
                font-weight:600;
                color:#222222;
                margin-bottom:7px;
              "
            >
              Technology
            </div>

            <div
              style="
                font-size:13px;
                color:#666666;
                line-height:1.7;
              "
            >
              ${
                technology.length
                  ? technology.join(', ')
                  : 'To be confirmed'
              }
            </div>
          </div>

          <!-- SEO -->
          <div style="margin-bottom:25px;">
            <div
              style="
                font-size:12px;
                font-weight:600;
                color:#222222;
                margin-bottom:7px;
              "
            >
              SEO
            </div>

            <div
              style="
                font-size:13px;
                color:#666666;
                line-height:1.7;
              "
            >
              ${
                seo.length
                  ? seo.join(', ')
                  : 'To be confirmed'
              }
            </div>
          </div>

        </td>
      </tr>

      <!-- TIMELINE + BUDGET -->
      <tr>
        <td style="padding:10px 36px 30px;">

          <table
            width="100%"
            cellpadding="0"
            cellspacing="0"
            border="0"
          >
            <tr>

              <td
                width="50%"
                style="
                  padding:22px;
                  background:#fafafa;
                  border:1px solid #eeeeee;
                "
              >
                <div
                  style="
                    font-size:9px;
                    letter-spacing:1.5px;
                    text-transform:uppercase;
                    color:#999999;
                  "
                >
                  Timeline
                </div>

                <div
                  style="
                    margin-top:8px;
                    font-size:17px;
                    font-weight:600;
                    color:#222222;
                  "
                >
                  ${proposal?.timeline || 'To be confirmed'}
                </div>
              </td>

              <td width="14"></td>

              <td
                width="50%"
                style="
                  padding:22px;
                  background:#fafafa;
                  border:1px solid #eeeeee;
                "
              >
                <div
                  style="
                    font-size:9px;
                    letter-spacing:1.5px;
                    text-transform:uppercase;
                    color:#999999;
                  "
                >
                  Estimated Cost
                </div>

                <div
                  style="
                    margin-top:8px;
                    font-size:17px;
                    font-weight:600;
                    color:#222222;
                  "
                >
                  ${proposal?.budget || 'To be confirmed'}
                </div>
              </td>

            </tr>
          </table>

        </td>
      </tr>

      <!-- PRICE NOTE -->
      <tr>
        <td style="padding:0 36px 30px;">

          <div
            style="
              padding:18px 20px;
              border-left:2px solid #9B6CFF;
              background:#faf9ff;
            "
          >
            <div
              style="
                font-size:12px;
                line-height:1.7;
                color:#666666;
              "
            >
              This is an estimated project cost based on the
              requirements discussed. The final project cost
              will be confirmed by AYORIX after reviewing the
              complete requirements.
            </div>
          </div>

        </td>
      </tr>

      <!-- NEXT STEP -->
      <tr>
        <td style="padding:0 36px 38px;">

          <div
            style="
              font-size:10px;
              letter-spacing:1.8px;
              text-transform:uppercase;
              color:#999999;
              margin-bottom:10px;
            "
          >
            Next Step
          </div>

          <p
            style="
              margin:0;
              font-size:14px;
              line-height:1.8;
              color:#444444;
            "
          >
            ${proposal?.nextStep || 'AYORIX will review your project details and reach out to you shortly.'}
          </p>

          <p
            style="
              margin:14px 0 0;
              font-size:13px;
              line-height:1.7;
              color:#888888;
            "
          >
            If you have any questions or would like to discuss
            anything further, simply reply to this email.
          </p>

        </td>
      </tr>

      <!-- FOOTER -->
      <tr>
        <td
          style="
            padding:24px 36px;
            background:#111111;
          "
        >

          <div
            style="
              font-size:16px;
              font-weight:600;
              color:#ffffff;
              letter-spacing:-0.3px;
            "
          >
            AYORIX
          </div>

          <div
            style="
              margin-top:5px;
              font-size:10px;
              letter-spacing:1.5px;
              text-transform:uppercase;
              color:#777777;
            "
          >
            Digital Solutions
          </div>

          <div
            style="
              margin-top:16px;
              font-size:10px;
              color:#666666;
            "
          >
            Built on Values. Driven by Innovation.
          </div>

        </td>
      </tr>

    </table>

  </div>

</body>
</html>
`.trim();
}
}