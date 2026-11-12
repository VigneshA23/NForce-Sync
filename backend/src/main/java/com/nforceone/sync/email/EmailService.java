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
    private static final String ASSET_BASE = "https://nforce-sync-git-dev-nforce-one.vercel.app/";

    // Rectangular "NF1 – Let's Do IT!" mark from the shared email design (frontend/public/email-logo.png).
    private static final String LOGO_URL = ASSET_BASE + "email-logo.png";

    // Decorative red/grey stripes for the bottom of the dark sidebar (frontend/public/email-sidebar-art.png).
    // Same hosting rule as the logo: must be a public URL. Falls back to plain black if unreachable.
    private static final String SIDEBAR_ART_URL = ASSET_BASE + "email-sidebar-art.png";

    // Envelope badge beside the eyebrow, and the per-row icon badges (frontend/public/email-icon-*.png).
    // PNG rather than inline SVG, which Gmail/Outlook strip.
    private static final String MAIL_ICON_URL = ASSET_BASE + "email-icon-mail.png";

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

        String credentialRows = credentialRow("email-icon-at.png", "EMAIL", escape(email), false)
                + credentialRow("email-icon-password.png", "TEMPORARY PASSWORD", passwordPill(tempPassword),
                        role == null || role.isBlank())
                + ((role == null || role.isBlank()) ? "" : credentialRow("email-icon-role.png", "ROLE", escape(role), true));

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

        String credentialRows = credentialRow("email-icon-at.png", "EMAIL", escape(email), false)
                + credentialRow("email-icon-password.png", "TEMPORARY PASSWORD", passwordPill(tempPassword),
                        expiryDate == null || expiryDate.isBlank())
                + ((expiryDate == null || expiryDate.isBlank()) ? "" : credentialRow("email-icon-clock.png", "EXPIRES ON", escape(expiryDate), true));

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
    private String credentialRow(String iconFile, String label, String valueHtml, boolean last) {
        return """
                <tr><td style="padding:14px 18px;%s">
                  <table cellpadding="0" cellspacing="0" width="100%%"><tr>
                    <td width="40" style="width:40px;vertical-align:middle;"><img src="%s" width="40" height="40" alt="" style="display:block;border:0;" /></td>
                    <td width="19" style="width:19px;vertical-align:middle;"></td>
                    <td width="1" style="width:1px;background:#cccccc;font-size:0;line-height:0;">&nbsp;</td>
                    <td width="17" style="width:17px;vertical-align:middle;"></td>
                    <td style="vertical-align:middle;">
                      <div style="margin:0 0 4px;font-size:10px;letter-spacing:1.5px;color:#666666;">%s</div>
                      <div style="margin:0;font-size:14px;font-weight:700;color:#000000;">%s</div>
                    </td>
                  </tr></table>
                </td></tr>
                """.formatted(last ? "" : "border-bottom:1px solid #e0e0e0;", ASSET_BASE + iconFile, label, valueHtml);
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
                <body style="margin:0;padding:0;background:#ffffff;font-family:'Segoe UI',Montserrat,Arial,sans-serif;">
                  <table width="100%%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:0;">
                    <tr><td align="center">
                      <table width="760" cellpadding="0" cellspacing="0" style="width:100%%;max-width:760px;background:#ffffff;border:1px solid #e2e2e2;overflow:hidden;">
                        <tr>
                          <!-- Dark sidebar -->
                          <td width="150" valign="top" bgcolor="#000000" style="width:150px;background:#000000;padding:0;">
                            <table width="150" height="100%%" cellpadding="0" cellspacing="0" bgcolor="#000000" style="width:150px;"><tr><td valign="top" style="padding:28px 18px 24px;">
                            <img src="%s" alt="NF1 - Let's Do IT!" width="110" style="display:block;width:110px;max-width:100%%;height:auto;border:0;margin:0 0 10px;" />
                            <div style="margin:0 0 18px;font-family:Montserrat,Arial,sans-serif;font-size:10px;line-height:1.4;color:#ffffff;">Submit. Approve. Track.</div>
                            <div style="width:28px;height:2px;line-height:2px;font-size:0;background:#c0161d;margin-bottom:18px;">&nbsp;</div>
                            <table cellpadding="0" cellspacing="0">
                              <tr><td style="padding:3px 0;"><a href="%s/eod/submit" style="font-family:Montserrat,Arial,sans-serif;font-size:10px;letter-spacing:2.5px;color:#bdbdbd;text-decoration:none;">EOD</a></td></tr>
                              <tr><td style="padding:3px 0;"><a href="%s/blockers" style="font-family:Montserrat,Arial,sans-serif;font-size:10px;letter-spacing:2.5px;color:#bdbdbd;text-decoration:none;">BLOCKERS</a></td></tr>
                              <tr><td style="padding:3px 0;"><a href="%s/team/approvals" style="font-family:Montserrat,Arial,sans-serif;font-size:10px;letter-spacing:2.5px;color:#bdbdbd;text-decoration:none;">APPROVALS</a></td></tr>
                              <tr><td style="padding:3px 0;"><a href="%s/utilization" style="font-family:Montserrat,Arial,sans-serif;font-size:10px;letter-spacing:2.5px;color:#bdbdbd;text-decoration:none;">UTILIZATION</a></td></tr>
                            </table>
                            </td></tr>
                            <tr><td valign="bottom" style="padding:0;line-height:0;font-size:0;"><img src="%s" alt="" width="150" style="display:block;width:150px;height:auto;border:0;" /></td></tr></table>
                          </td>
                          <!-- White content panel -->
                          <td valign="top" style="padding:32px 40px 16px;">
                            <table width="100%%" cellpadding="0" cellspacing="0"><tr>
                              <td style="vertical-align:top;">
                                <div style="font-size:12px;font-weight:600;letter-spacing:3px;color:#666666;margin:0 0 8px;">%s</div>
                                <div style="width:32px;height:3px;line-height:3px;font-size:0;background:#111111;margin-bottom:22px;">&nbsp;</div>
                              </td>
                              <td align="right" style="vertical-align:top;">
                                <img src="%s" width="76" height="76" alt="" style="display:block;border:0;" />
                              </td>
                            </tr></table>

                            <h1 style="margin:4px 0 16px;font-size:30px;font-weight:800;color:#000000;">%s</h1>
                            <p style="color:#222222;font-size:15px;line-height:1.5;margin:0 0 24px;">%s</p>

                            <table width="100%%" cellpadding="0" cellspacing="0" style="background:#f2f2f2;border:1px solid #e0e0e0;border-radius:6px;margin-bottom:22px;">
                              %s
                            </table>

                            <p style="margin:0 0 24px;font-size:13px;color:#a3141b;line-height:1.5;">%s</p>

                            <table width="100%%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:0 0 20px;">
                              <a href="%s" style="display:inline-block;background:#b84a4f;color:#ffffff;font-weight:600;font-size:15px;text-decoration:none;padding:14px 70px;border-radius:3px;">Sign in to NForce Sync &#8594;</a>
                            </td></tr></table>

                            <div style="height:1px;line-height:1px;font-size:0;background:#e6e6e6;margin-bottom:20px;">&nbsp;</div>
                            <div style="font-size:14px;color:#111111;">Thank you,</div>
                            <div style="font-size:15px;font-weight:700;color:#a3141b;margin-top:4px;">NForce Sync Team</div>
                            <div style="font-size:12px;color:#666666;margin-top:16px;line-height:1.5;">%s</div>
                            <div style="font-size:12px;color:#666666;margin-top:4px;padding-bottom:16px;">This is an automated email. Please do not reply. &#169; %d NForce One</div>
                          </td>
                        </tr>
                      </table>
                    </td></tr>
                  </table>
                </body>
                </html>
                """.formatted(LOGO_URL, baseUrl, baseUrl, baseUrl, baseUrl, SIDEBAR_ART_URL, eyebrow, MAIL_ICON_URL,
                        heading, bodyHtml, credentialRows, helperText, ctaHref, footerNote, year);
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
