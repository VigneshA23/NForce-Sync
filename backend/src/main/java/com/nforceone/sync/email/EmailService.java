package com.nforceone.sync.email;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

@Service
public class EmailService {

    private static final Logger log = LoggerFactory.getLogger(EmailService.class);
    private static final String RESEND_URL = "https://api.resend.com/emails";

    // Referenced as a normal hosted <img src>, not a base64 data URI: most mail clients (notably
    // Outlook desktop) strip/ignore `data:` image sources.
    //
    // Deliberately NOT built from baseUrlResolver.resolve(): that resolves per-request to
    // whichever origin triggered the call, which in local dev is http://localhost:5173 — fine for
    // the CTA link (the recipient opens that after this reaches their inbox, from their own
    // browser, so localhost only works when dev and recipient are on the same machine), but no
    // mail client can ever fetch an *image* from localhost to render inline. The banner always
    // points at the one public deployment (already an allowed CORS origin — see
    // app.cors.allowed-origins in application.yml) so it renders regardless of which environment
    // sent the email.
    private static final String ASSET_BASE = "https://nforce-sync-git-dev-nforce-one.vercel.app/";

    // Decorative header photo behind the "NForce Sync" wordmark (frontend/public/email-header-banner.jpg).
    private static final String HEADER_BANNER_URL = ASSET_BASE + "email-header-banner.jpg";

    @Value("${resend.api-key}")
    private String apiKey;

    @Value("${resend.from}")
    private String fromAddress;

    // Resolved per request rather than injected: an emailed link must point at whichever front
    // end the user is actually on (local dev or the deployed site), not one fixed environment.
    private final AppBaseUrlResolver baseUrlResolver;

    public EmailService(AppBaseUrlResolver baseUrlResolver) {
        this.baseUrlResolver = baseUrlResolver;
    }

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    public void sendInviteEmail(String toEmail, String fullName, String tempPassword) {
        String subject = "Welcome to NForce Sync | your account is ready";
        String html = buildInviteHtml(fullName, toEmail, tempPassword);
        sendAsync(toEmail, subject, html);
    }

    public void sendPasswordResetEmail(String toEmail, String fullName, String tempPassword, String resetToken) {
        sendPasswordResetEmail(toEmail, fullName, tempPassword, resetToken, null);
    }

    public void sendPasswordResetEmail(String toEmail, String fullName, String tempPassword, String resetToken, String expiryDate) {
        String subject = "NForce Sync | Password Reset Request";
        String html = buildResetHtml(fullName, toEmail, tempPassword, resetToken, expiryDate);
        sendAsync(toEmail, subject, html);
    }

    /**
     * Blocking variant for the self-service reset, where the temp password exists nowhere else.
     *
     * <p>The caller must know whether delivery was accepted BEFORE it overwrites the stored
     * password: a fire-and-forget send that fails (expired key, exhausted quota, Resend outage)
     * leaves the account with a password nobody can ever learn, locking the user out with no
     * recovery path but an admin. Returning the outcome lets the caller abandon the reset instead.
     *
     * @return true when Resend accepted the message (2xx)
     */
    public boolean sendPasswordResetEmailSync(String toEmail, String fullName, String tempPassword, String resetToken) {
        return sendPasswordResetEmailSync(toEmail, fullName, tempPassword, resetToken, null);
    }

    public boolean sendPasswordResetEmailSync(String toEmail, String fullName, String tempPassword, String resetToken, String expiryDate) {
        String subject = "NForce Sync | Password Reset Request";
        String html = buildResetHtml(fullName, toEmail, tempPassword, resetToken, expiryDate);
        return sendBlocking(toEmail, subject, html);
    }

    /** Shares the request shape with {@link #sendAsync}; only the waiting differs. */
    private boolean sendBlocking(String to, String subject, String html) {
        try {
            HttpResponse<String> res = httpClient.send(
                    buildRequest(to, subject, html), HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() >= 200 && res.statusCode() < 300) {
                log.info("Email sent to {} (subject: {})", to, subject);
                return true;
            }
            log.error("Resend API error: status={} body={}", res.statusCode(), res.body());
            return false;
        } catch (java.io.IOException e) {
            log.error("Failed to send email to {}: {}", to, e.getMessage());
            return false;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("Interrupted sending email to {}", to);
            return false;
        }
    }

    /** One place where the Resend request is shaped, so blocking and async sends cannot drift. */
    private HttpRequest buildRequest(String to, String subject, String html) {
        String body = """
                {
                  "from": "%s",
                  "to": ["%s"],
                  "subject": "%s",
                  "html": %s
                }
                """.formatted(fromAddress, to, subject, jsonString(html));

        return HttpRequest.newBuilder()
                .uri(URI.create(RESEND_URL))
                .header("Authorization", "Bearer " + apiKey)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .timeout(Duration.ofSeconds(10))
                .build();
    }

    private void sendAsync(String to, String subject, String html) {
        httpClient.sendAsync(buildRequest(to, subject, html), HttpResponse.BodyHandlers.ofString())
                .thenAccept(res -> {
                    if (res.statusCode() >= 200 && res.statusCode() < 300) {
                        log.info("Email sent to {} (subject: {})", to, subject);
                    } else {
                        log.error("Resend API error: status={} body={}", res.statusCode(), res.body());
                    }
                })
                .exceptionally(ex -> {
                    log.error("Failed to send email to {} — underlying action was not affected: {}",
                            to, ex.getMessage());
                    return null;
                });
    }

    private String buildInviteHtml(String fullName, String email, String tempPassword) {
        String baseUrl = baseUrlResolver.resolve();
        String body = "Hi " + escape(fullName) + ", Your NForce Sync account is ready. Use the temporary password "
                + "below to sign in with <strong style=\"color:#0b1330;\">" + escape(email) + "</strong>. "
                + "You'll be asked to create a new one on your first login.";

        String credentialCard = """
                <table width="100%%" cellpadding="0" cellspacing="0" style="background:#f5f5f9;border:1.5px dashed #b6bad0;border-radius:14px;margin-bottom:22px;">
                  <tr><td height="128" align="center" valign="middle" style="height:128px;padding:16px 20px;">
                    %s
                  </td></tr>
                </table>
                """.formatted(passwordRow(tempPassword));

        return emailShell("Welcome, " + escape(fullName) + "!", body, credentialCard, null,
                baseUrl + "/login?newUser=1");
    }

    private String buildResetHtml(String fullName, String email, String tempPassword, String resetToken, String expiryDate) {
        String baseUrl = baseUrlResolver.resolve();
        String body = "Hi " + escape(fullName) + ", a password reset was requested for your NForce Sync account. "
                + "Use the temporary password below to sign in with <strong style=\"color:#0b1330;\">" + escape(email) + "</strong>. "
                + "You'll be asked to create a new one on sign-in.";

        String expiryRow = (expiryDate == null || expiryDate.isBlank()) ? "" : """
                <div style="width:100%%;height:1px;background:#dcdee8;margin:14px 0 2px;">&nbsp;</div>
                %s
                """.formatted(credentialValueRow("EXPIRES ON", escape(expiryDate), false));

        String credentialCard = """
                <table width="100%%" cellpadding="0" cellspacing="0" style="background:#f5f5f9;border:1.5px dashed #b6bad0;border-radius:14px;margin-bottom:22px;">
                  <tr><td align="center" valign="middle" style="padding:26px 20px 22px;">
                    %s
                    %s
                  </td></tr>
                </table>
                """.formatted(passwordRow(tempPassword), expiryRow);

        String warning = """
                <p style="margin:22px 0 0;font-size:14px;line-height:20px;color:#c4000e;text-align:center;">If you didn't request this, contact your HR administrator immediately.</p>
                """;

        return emailShell("Reset your password", body, credentialCard, warning,
                baseUrl + "/login?resetToken=" + resetToken);
    }

    /** The TEMPORARY PASSWORD row — monospace value, used by both emails' credential card. */
    private String passwordRow(String tempPassword) {
        return credentialValueRow("TEMPORARY PASSWORD",
                "<span style=\"font-family:'Courier New',Courier,monospace;font-size:28px;font-weight:700;"
                        + "letter-spacing:2px;color:#0b1330;\">" + escape(tempPassword) + "</span>",
                true);
    }

    /** One label+value pair in the dashed credential card. */
    private String credentialValueRow(String label, String valueHtml, boolean passwordSized) {
        String valueStyle = passwordSized ? "" :
                "font-size:17px;font-weight:600;color:#0b1330;";
        return """
                <div style="margin:0 0 4px;font-size:12px;letter-spacing:3.2px;color:#6b7287;">%s</div>
                <div style="margin:0;%s">%s</div>
                """.formatted(label, valueStyle, valueHtml);
    }

    /**
     * The shared chrome for both emails: a single centered white card — header photo banner with
     * the "NForce Sync" wordmark, heading, body paragraph, credential card, optional extra note
     * (e.g. the reset email's red warning line), CTA button, helper text, footer. Only the
     * per-email pieces (heading/body/credential card/extra note/CTA link) differ between invite
     * and reset.
     */
    private String emailShell(String heading, String bodyHtml, String credentialCard, String extraNote, String ctaHref) {
        int year = java.time.Year.now().getValue();
        return """
                <!DOCTYPE html>
                <html lang="en">
                <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
                <body style="margin:0;padding:0;background:#ffffff;">
                  <table width="100%%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
                    <tr><td align="center" style="padding:17px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
                      <table width="634" cellpadding="0" cellspacing="0" style="width:100%%;max-width:634px;background:#fdfdfe;border:1px solid #a9adc4;border-radius:16px;overflow:hidden;box-shadow:0 2px 10px rgba(30,34,80,0.12);">
                        <tr><td style="padding:0;">
                          <!-- Header banner — a single flattened image (photo + "NForce Sync"
                               wordmark baked in, see frontend/public/email-header-banner.jpg).
                               Overlaying live HTML text on a CSS/table background (position:absolute
                               divs, then a table `background` attribute) both got silently dropped by
                               Outlook's Word rendering engine — an <img> is the only approach every
                               client renders identically. -->
                          <img src="%s" width="634" height="110" alt="NForce Sync" style="display:block;width:100%%;max-width:634px;height:auto;border:0;" />
                          <!-- Body -->
                          <div style="padding:44px 44px 0;">
                            <h1 style="margin:0 0 18px;font-size:28px;line-height:1.25;font-weight:700;color:#0b1330;">%s</h1>
                            <p style="font-size:16px;line-height:28px;color:#5a6275;margin:0 0 24px;">%s</p>
                            %s
                            %s
                            <table width="100%%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:30px 0 20px;">
                              <a href="%s" style="display:inline-block;width:242px;padding:16px 0;border-radius:10px;background:#c4000e;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;text-align:center;text-decoration:none;">Sign in to NForce Sync</a>
                            </td></tr></table>
                            <p style="font-size:15px;line-height:20px;color:#5a6275;margin:0 0 4px;">Need help? Contact your manager or your HR administrator.</p>
                            <p style="font-size:15px;line-height:20px;color:#5a6275;margin:0 0 24px;">This is an automated message, please do not reply.</p>
                          </div>
                          <!-- Footer -->
                          <div style="border-top:1px solid #e4e6ee;background:#f7f8fa;padding:22px 24px;text-align:center;font-size:14px;color:#5d6479;">&#169; %d NForce Sync &middot; All rights reserved</div>
                        </td></tr>
                      </table>
                    </td></tr>
                  </table>
                </body>
                </html>
                """.formatted(HEADER_BANNER_URL, heading, bodyHtml, credentialCard,
                        extraNote == null ? "" : extraNote, ctaHref, year);
    }

    /** Minimal HTML escaping for values interpolated into the email body — all are plain text, never markup. */
    private String escape(String raw) {
        if (raw == null) return "";
        return raw.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }

    private String jsonString(String raw) {
        return "\"" + raw
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t")
                + "\"";
    }
}
