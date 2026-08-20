package com.nforceone.sync.email;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.net.URI;
import java.util.Arrays;
import java.util.List;

/**
 * Which front end an emailed link should point at.
 *
 * <p>One backend serves several front ends (local dev and the deployed site), so a single
 * configured URL is always wrong for somebody: a reset requested from the deployed app was
 * mailing a localhost link. The origin of the request that triggered the email is the only
 * thing that knows where the user actually is, so the link is built from that.
 *
 * <p>The header is NEVER trusted on its own — an attacker who could set it would otherwise
 * redirect password-reset links to a site they control. It is only honoured when it exactly
 * matches an entry in the CORS allow-list (the same property that decides who may call the API);
 * anything else falls back to the configured default.
 */
@Component
public class AppBaseUrlResolver {

    private final String defaultBaseUrl;
    private final List<String> allowedOrigins;

    public AppBaseUrlResolver(
            @Value("${app.base-url:http://localhost:5173}") String defaultBaseUrl,
            @Value("${app.cors.allowed-origins:http://localhost:5173}") String allowedOrigins) {
        this.defaultBaseUrl = stripTrailingSlash(defaultBaseUrl);
        this.allowedOrigins = Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(AppBaseUrlResolver::stripTrailingSlash)
                .toList();
    }

    /** The allow-listed origin this request came from, or the configured default. */
    public String resolve() {
        HttpServletRequest request = currentRequest();
        if (request == null) return defaultBaseUrl;

        String origin = request.getHeader("Origin");
        if (origin == null) origin = originOf(request.getHeader("Referer"));
        if (origin == null) return defaultBaseUrl;

        String candidate = stripTrailingSlash(origin);
        return allowedOrigins.stream()
                .filter(allowed -> allowed.equalsIgnoreCase(candidate))
                .findFirst()
                .orElse(defaultBaseUrl);
    }

    /** Scheme + host + port of a Referer, since that header carries a full URL, not an origin. */
    private static String originOf(String referer) {
        if (referer == null || referer.isBlank()) return null;
        try {
            URI uri = URI.create(referer);
            if (uri.getScheme() == null || uri.getHost() == null) return null;
            return uri.getPort() == -1
                    ? uri.getScheme() + "://" + uri.getHost()
                    : uri.getScheme() + "://" + uri.getHost() + ":" + uri.getPort();
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    /** Null outside a request — e.g. the scheduled EOD reminder job. */
    private static HttpServletRequest currentRequest() {
        return RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attrs
                ? attrs.getRequest()
                : null;
    }

    private static String stripTrailingSlash(String url) {
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
