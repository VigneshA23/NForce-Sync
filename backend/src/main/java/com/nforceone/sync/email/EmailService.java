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

    // Same logo image the app itself renders (frontend/src/assets/nforce-logo.png, via
    // BrandMark.tsx) — also served statically from frontend/public/nf1-logo.png at the app's own
    // root path. Referenced as a normal hosted <img src>, not a base64 data URI: most mail
    // clients (notably Outlook desktop) strip/ignore `data:` image sources.
    //
    // Deliberately NOT built from baseUrlResolver.resolve(): that resolves per-request to
    // whichever origin triggered the call, which in local dev is http://localhost:5173 — fine for
    // the CTA/nav links (the recipient opens those after this reaches their inbox, from their own
    // browser, so localhost only works when dev and recipient are on the same machine), but no
    // mail client can ever fetch an *image* from localhost to render inline. The logo always
    // points at the one public deployment (already an allowed CORS origin — see
    // app.cors.allowed-origins in application.yml) so it renders regardless of which environment
    // sent the email.
    private static final String LOGO_URL =
            "https://nforce-sync-git-dev-nforce-one.vercel.app/nf1-logo.png";

    // Decorative red/grey stripes for the bottom of the dark sidebar (frontend/public/email-sidebar-art.png).
    // Same hosting rule as the logo: must be a public URL. Falls back to plain black if unreachable.
    private static final String SIDEBAR_ART_URL =
            "https://nforce-sync-git-dev-nforce-one.vercel.app/email-sidebar-art.png";

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
        sendInviteEmail(toEmail, fullName, tempPassword, null, null);
    }

    public void sendInviteEmail(String toEmail, String fullName, String tempPassword, String role, String invitedBy) {
        String subject = "Welcome to NForce Sync | your account is ready";
        String html = buildInviteHtml(fullName, toEmail, tempPassword, role, invitedBy);
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

    private String buildInviteHtml(String fullName, String email, String tempPassword, String role, String invitedBy) {
        String baseUrl = baseUrlResolver.resolve();
        String intro = (invitedBy == null || invitedBy.isBlank())
                ? "Your account has been created in <strong>NForce Sync</strong>. Use the temporary password below to sign in and start submitting your EOD status."
                : ("Your account has been created in <strong>NForce Sync</strong> by <strong>" + escape(invitedBy)
                   + "</strong>. Use the temporary password below to sign in and start submitting your EOD status.");

        String credentialRows = credentialRow("&#64;", "EMAIL", escape(email))
                + credentialRow("&#8226;&#8226;&#8226;", "TEMPORARY PASSWORD", passwordPill(tempPassword))
                + ((role == null || role.isBlank()) ? "" : credentialRow("&#9679;", "ROLE", escape(role)));

        return emailShell(
                "WELCOME",
                "Welcome to NForce Sync",
                "Hi " + escape(fullName) + ", " + intro,
                credentialRows,
                "You'll be asked to set a new password the first time you sign in. Don't share this password with anyone.",
                baseUrl + "/login?newUser=1",
                "If you weren't expecting this email, you can ignore it or contact your HR administrator.",
                baseUrl);
    }

    private String buildResetHtml(String fullName, String email, String tempPassword, String resetToken, String expiryDate) {
        String baseUrl = baseUrlResolver.resolve();

        String credentialRows = credentialRow("&#64;", "EMAIL", escape(email))
                + credentialRow("&#8226;&#8226;&#8226;", "TEMPORARY PASSWORD", passwordPill(tempPassword))
                + ((expiryDate == null || expiryDate.isBlank()) ? "" : credentialRow("&#128337;", "EXPIRES ON", escape(expiryDate)));

        return emailShell(
                "PASSWORD RESET",
                "Reset your password",
                "Hi " + escape(fullName) + ", A password reset was requested for your <strong>NForce Sync</strong> account. "
                        + "Use the temporary password below to sign in.",
                credentialRows,
                "You'll be required to set a new password on sign-in. If you didn't request this, contact your HR administrator immediately.",
                baseUrl + "/login?resetToken=" + resetToken,
                "If you didn't request a password reset, you can ignore this email.",
                baseUrl);
    }

    /** One row of the light-gray credential card: a small circular glyph badge, an uppercase label, and a value. */
    private String credentialRow(String glyph, String label, String valueHtml) {
        return """
                <tr><td style="padding:16px 20px;border-bottom:1px solid #E5E7EB;">
                  <table cellpadding="0" cellspacing="0"><tr>
                    <td style="width:40px;vertical-align:middle;">
                      <table cellpadding="0" cellspacing="0"><tr><td style="width:32px;height:32px;border-radius:50%%;background:#E5E7EB;text-align:center;vertical-align:middle;font-size:13px;color:#6B7280;">%s</td></tr></table>
                    </td>
                    <td style="vertical-align:middle;">
                      <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#9CA3AF;letter-spacing:.06em;">%s</p>
                      <p style="margin:0;font-size:16px;font-weight:600;color:#111827;">%s</p>
                    </td>
                  </tr></table>
                </td></tr>
                """.formatted(glyph, label, valueHtml);
    }

    /** The temp password value: plain text, styled the same as every other credential value. */
    private String passwordPill(String tempPassword) {
        return escape(tempPassword);
    }

    /**
     * The shared chrome for both emails: a dark left "sidebar" (brand mark + real nav links into
     * the app) beside a white content panel (eyebrow, heading, body, credential card, CTA,
     * sign-off, footer). Only the per-email pieces differ between invite and reset.
     */
    private String emailShell(String eyebrow, String heading, String bodyHtml, String credentialRows,
                               String helperText, String ctaHref, String footerNote, String baseUrl) {
        int year = java.time.Year.now().getValue();
        return """
                <!DOCTYPE html>
                <html lang="en">
                <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
                <body style="margin:0;padding:0;background:#EEF0F3;font-family:Inter,Arial,sans-serif;">
                  <table width="100%%" cellpadding="0" cellspacing="0" style="background:#EEF0F3;padding:40px 16px;">
                    <tr><td align="center">
                      <table width="680" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.06);">
                        <tr>
                          <!-- Dark sidebar -->
                          <td width="100" valign="top" bgcolor="#000000" style="background:#000000;padding:0;">
                            <table width="100" height="100%%" cellpadding="0" cellspacing="0" bgcolor="#000000"><tr><td valign="top" style="padding:28px 18px 24px;">
                            <img src="%s" alt="NForce — Let's Do IT!" width="96" height="96" style="display:block;border-radius:50%%;margin:0 0 22px;" />
                            <p style="margin:0 0 4px;font-size:11px;color:#9CA3AF;">Submit. Approve.</p>
                            <p style="margin:0 0 22px;font-size:11px;color:#9CA3AF;">Track.</p>
                            <div style="border-top:1px solid #E4373D;width:28px;margin-bottom:18px;"></div>
                            <table cellpadding="0" cellspacing="0">
                              <tr><td style="padding:6px 0;"><a href="%s/eod/submit" style="font-size:11px;letter-spacing:.06em;color:#D1D5DB;text-decoration:none;font-weight:600;">EOD</a></td></tr>
                              <tr><td style="padding:6px 0;"><a href="%s/blockers" style="font-size:11px;letter-spacing:.06em;color:#D1D5DB;text-decoration:none;font-weight:600;">BLOCKERS</a></td></tr>
                              <tr><td style="padding:6px 0;"><a href="%s/team/approvals" style="font-size:11px;letter-spacing:.06em;color:#D1D5DB;text-decoration:none;font-weight:600;">APPROVALS</a></td></tr>
                              <tr><td style="padding:6px 0;"><a href="%s/utilization" style="font-size:11px;letter-spacing:.06em;color:#D1D5DB;text-decoration:none;font-weight:600;">UTILIZATION</a></td></tr>
                            </table>
                            </td></tr>
                            <tr><td valign="bottom" style="padding:0;line-height:0;font-size:0;"><img src="%s" alt="" width="100" style="display:block;width:100px;height:auto;border:0;" /></td></tr></table>
                          </td>
                          <!-- White content panel -->
                          <td valign="top" style="padding:36px 46px;">
                            <table width="100%%" cellpadding="0" cellspacing="0"><tr>
                              <td style="vertical-align:top;">
                                <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:.1em;color:#6B7280;">%s</p>
                                <div style="border-top:2px solid #E4373D;width:30px;margin-bottom:22px;"></div>
                              </td>
                              <td align="right" style="vertical-align:top;">
                                <table cellpadding="0" cellspacing="0"><tr><td style="width:48px;height:48px;border-radius:50%%;background:#F3F4F6;text-align:center;vertical-align:middle;font-size:18px;color:#6B7280;">&#9993;</td></tr></table>
                              </td>
                            </tr></table>

                            <h1 style="font-family:Inter,Arial,sans-serif;font-size:26px;font-weight:800;color:#111827;margin:0 0 14px;letter-spacing:-0.01em;">%s</h1>
                            <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 24px;">%s</p>

                            <table width="100%%" cellpadding="0" cellspacing="0" style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;margin-bottom:22px;">
                              %s
                            </table>

                            <p style="margin:0 0 24px;font-size:13px;color:#B1111E;line-height:1.5;">%s</p>

                            <a href="%s" style="display:inline-block;background:#E4373D;color:#ffffff;font-weight:700;font-size:14px;text-decoration:none;padding:13px 28px;border-radius:8px;">Sign in to NForce Sync &#8594;</a>

                            <hr style="border:none;border-top:1px solid #E5E7EB;margin:28px 0 18px;" />
                            <p style="margin:0 0 2px;font-size:13px;color:#374151;">Thank you,</p>
                            <p style="margin:0 0 18px;font-size:13px;font-weight:700;color:#B1111E;">NForce Sync Team</p>
                            <p style="margin:0 0 4px;font-size:11px;color:#9CA3AF;line-height:1.5;">%s</p>
                            <p style="margin:0;font-size:11px;color:#9CA3AF;">This is an automated email. Please do not reply. &#169; %d NForce One</p>
                          </td>
                        </tr>
                      </table>
                    </td></tr>
                  </table>
                </body>
                </html>
                """.formatted(LOGO_URL, baseUrl, baseUrl, baseUrl, baseUrl, SIDEBAR_ART_URL, eyebrow, heading, bodyHtml,
                        credentialRows, helperText, ctaHref, footerNote, year);
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
