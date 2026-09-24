package com.nforceone.sync.ai.navigation;

import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Fails the build if {@code ai-knowledge/pages/registry.yaml} drifts from the frontend's actual
 * navigation and routing — text-based checks against {@code nav.ts}, {@code App.tsx},
 * {@code Shell.tsx} and {@code auth.ts}, not a full JSX/TS parser, but enough to catch a route or
 * label being renamed or removed, or a page flipping between real and Placeholder, without the
 * registry being updated to match. No backend code imports these frontend files, so nothing else
 * would ever notice them diverging.
 */
class PageRegistryParityTest {

    private static final Path FRONTEND_SRC = Path.of("..", "frontend", "src");

    @Test
    void everyNonSharedRouteExistsInNavTs() throws IOException {
        String navTs = readFrontendFile("lib/nav.ts");
        for (Map<String, Object> variant : allVariants()) {
            if ("shared".equals(pageModule(variant))) {
                continue; // shared pages aren't in nav.ts — see sharedPagesAreInShellAllowlist
            }
            String route = (String) variant.get("route");
            assertTrue(navTs.contains("'" + route + "'") || navTs.contains("\"" + route + "\""),
                    "registry route " + route + " (pageId " + variant.get("__pageId") + ") not found in nav.ts");
        }
    }

    @Test
    void everyRouteExistsInAppTsxWithCorrectPlaceholderStatus() throws IOException {
        String appTsx = readFrontendFile("App.tsx");
        Map<String, Boolean> routeIsPlaceholder = parseAppTsxRoutes(appTsx);

        for (Map<String, Object> variant : allVariants()) {
            String route = (String) variant.get("route");
            String pageId = (String) variant.get("__pageId");
            boolean expectedPlaceholder = Boolean.TRUE.equals(variant.get("placeholder"));

            Boolean actualPlaceholder = routeIsPlaceholder.get(route);
            assertNotNull(actualPlaceholder,
                    "registry route " + route + " (pageId " + pageId + ") has no <Route path=\"...\"> in App.tsx");
            assertEquals(expectedPlaceholder, actualPlaceholder,
                    "registry route " + route + " (pageId " + pageId + "): registry says placeholder="
                            + expectedPlaceholder + " but App.tsx renders " + (actualPlaceholder ? "a Placeholder" : "a real page"));
        }
    }

    @Test
    void sharedPagesAreInShellAllowlist() throws IOException {
        String shellTsx = readFrontendFile("components/Shell.tsx");
        for (String route : List.of("/notifications", "/profile", "/change-password", "/preferences")) {
            assertTrue(shellTsx.contains("'" + route + "'"),
                    "shared route " + route + " not found in Shell.tsx's outside-getNavPaths allowlist");
        }
    }

    @Test
    void backendRoleMapMatchesAuthTs() throws IOException {
        String authTs = readFrontendFile("api/auth.ts");
        // Mirrors RoleLabels' implicit pairing (backend AppUser.Role -> frontend UI role key) —
        // confirms e.g. MANAGER still maps to the UI's "lead" (Team Lead), not "manager".
        Map<String, String> expected = Map.of(
                "EMPLOYEE", "employee", "MANAGER", "lead", "SUPERADMIN", "superadmin",
                "PM", "pm", "DM", "dm", "FINANCE", "finance", "LEADERSHIP", "leadership", "ADMIN", "admin");
        for (Map.Entry<String, String> e : expected.entrySet()) {
            Pattern p = Pattern.compile(e.getKey() + "\\s*:\\s*'" + e.getValue() + "'");
            assertTrue(p.matcher(authTs).find(),
                    "auth.ts BACKEND_ROLE_MAP no longer maps " + e.getKey() + " -> '" + e.getValue() + "'");
        }
    }

    // ---- helpers ------------------------------------------------------------------------------

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> allVariants() throws IOException {
        Path registryPath = Path.of("src", "main", "resources", "ai-knowledge", "pages", "registry.yaml");
        Map<String, Object> root;
        try (var in = Files.newInputStream(registryPath)) {
            root = (Map<String, Object>) new Yaml().load(in);
        }
        List<Map<String, Object>> pages = (List<Map<String, Object>>) root.get("pages");
        List<Map<String, Object>> variants = new ArrayList<>();
        for (Map<String, Object> page : pages) {
            for (Map<String, Object> variant : (List<Map<String, Object>>) page.get("variants")) {
                variant.put("__pageId", page.get("pageId"));
                variant.put("__module", page.get("module"));
                variants.add(variant);
            }
        }
        return variants;
    }

    private static String pageModule(Map<String, Object> variant) {
        return (String) variant.get("__module");
    }

    private String readFrontendFile(String relativePath) throws IOException {
        Path path = FRONTEND_SRC.resolve(relativePath);
        assertTrue(Files.exists(path), "expected frontend file not found: " + path.toAbsolutePath());
        return Files.readString(path, StandardCharsets.UTF_8);
    }

    /** route -> whether its {@code <Route>} element renders {@code <Placeholder>}, scanning up to the next {@code <Route} or {@code </Routes>}. */
    private Map<String, Boolean> parseAppTsxRoutes(String appTsx) {
        Map<String, Boolean> result = new LinkedHashMap<>();
        Matcher matcher = Pattern.compile("<Route\\s+path=\"([^\"]+)\"").matcher(appTsx);
        while (matcher.find()) {
            String route = matcher.group(1);
            int spanStart = matcher.end();
            int nextRoute = appTsx.indexOf("<Route", spanStart);
            int routesClose = appTsx.indexOf("</Routes>", spanStart);
            int spanEnd = Math.min(
                    nextRoute == -1 ? Integer.MAX_VALUE : nextRoute,
                    routesClose == -1 ? Integer.MAX_VALUE : routesClose);
            String span = appTsx.substring(spanStart, Math.min(spanEnd, appTsx.length()));
            result.put(route, span.contains("Placeholder"));
        }
        return result;
    }
}
