package com.nforceone.sync.ai.navigation;

import com.nforceone.sync.ai.contract.PageReference;
import com.nforceone.sync.auth.AppUser;
import jakarta.annotation.PostConstruct;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.yaml.snakeyaml.Yaml;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * The only source of navigable AI-assistant targets, loaded once at startup from
 * {@code classpath:ai-knowledge/pages/registry.yaml} and never touched again at runtime. The
 * model may only ever return a {@code pageId} from here; it never sees or invents a route.
 *
 * <p><b>Fails Spring context startup on any malformed or duplicate entry</b> — this file is
 * authored and reviewed like source code (see {@code PageRegistryParityTest}, which fails the
 * build if it drifts from {@code nav.ts}/{@code App.tsx}), so a startup failure here is exactly
 * as appropriate as a compile error would be. This is unconditional, regardless of
 * {@code app.ai.enabled} — the assistant being switched off does not mean Sync should tolerate a
 * broken navigation registry silently.
 *
 * <p>One {@code pageId} (e.g. {@code "dashboard"}) has one {@link PageReference} variant per role
 * whose route/label/placeholder-status differs for that role, mirroring how {@code nav.ts} and
 * {@code App.tsx} are actually organised — a Project Manager's "dashboard" is a real page at
 * {@code /projects/dashboard}; a Delivery Manager's is a placeholder at {@code /dm/dashboard}.
 */
@Component
public class PageRegistry {

    private static final String CLASSPATH_LOCATION = "ai-knowledge/pages/registry.yaml";

    // LinkedHashMap throughout: declaration order is preserved and stays stable across restarts
    // (improvement I6 over OneHR's Map.copyOf, whose iteration order is not guaranteed and moved
    // the prompt's REACHABLE PAGES section around between JVM runs).
    private final Map<String, Map<AppUser.Role, PageReference>> pagesById = new LinkedHashMap<>();

    // Public rather than package-private: @PostConstruct still runs it automatically in a Spring
    // context, but tests in other ai/** packages (KnowledgeSchemaValidatorTest,
    // KnowledgeIndexingServiceTest) also construct a PageRegistry directly and need to call this
    // themselves, without a full Spring context just to validate against real registry entries.
    @PostConstruct
    public void load() {
        Map<String, Object> root = readYaml();
        List<String> problems = new ArrayList<>();
        Object rawPages = root == null ? null : root.get("pages");
        if (!(rawPages instanceof List<?> pageList) || pageList.isEmpty()) {
            throw new IllegalStateException(
                    "ai-knowledge/pages/registry.yaml must have a non-empty top-level 'pages' list");
        }

        for (Object pageObj : pageList) {
            if (!(pageObj instanceof Map<?, ?> pageMap)) {
                problems.add("a 'pages' entry is not a mapping: " + pageObj);
                continue;
            }
            parsePage(asStringKeyedMap(pageMap), problems);
        }

        if (!problems.isEmpty()) {
            throw new IllegalStateException("registry.yaml is invalid (" + problems.size() + " problem(s)): "
                    + String.join("; ", problems));
        }
    }

    private void parsePage(Map<String, Object> pageMap, List<String> problems) {
        String pageId = stringOf(pageMap.get("pageId"));
        String module = stringOf(pageMap.get("module"));

        if (pageId == null || pageId.isBlank()) {
            problems.add("a page is missing 'pageId': " + pageMap);
            return;
        }
        if (pagesById.containsKey(pageId)) {
            problems.add("duplicate pageId: " + pageId);
            return;
        }
        if (module == null || module.isBlank()) {
            problems.add(pageId + ": 'module' is required");
        }

        Object rawVariants = pageMap.get("variants");
        if (!(rawVariants instanceof List<?> variantList) || variantList.isEmpty()) {
            problems.add(pageId + ": must have at least one entry in 'variants'");
            return;
        }

        Map<AppUser.Role, PageReference> variantsByRole = new LinkedHashMap<>();
        for (Object variantObj : variantList) {
            if (!(variantObj instanceof Map<?, ?> variantMap)) {
                problems.add(pageId + ": a variant is not a mapping: " + variantObj);
                continue;
            }
            parseVariant(pageId, module, asStringKeyedMap(variantMap), variantsByRole, problems);
        }

        if (!variantsByRole.isEmpty()) {
            pagesById.put(pageId, variantsByRole);
        }
    }

    private void parseVariant(String pageId, String module, Map<String, Object> variantMap,
            Map<AppUser.Role, PageReference> variantsByRole, List<String> problems) {
        Set<AppUser.Role> roles = parseRoles(pageId, variantMap.get("roles"), problems);
        String label = stringOf(variantMap.get("label"));
        String route = stringOf(variantMap.get("route"));
        String description = stringOf(variantMap.get("description"));
        boolean placeholder = Boolean.TRUE.equals(variantMap.get("placeholder"));

        if (roles.isEmpty()) {
            problems.add(pageId + ": a variant needs at least one valid role");
        }
        if (label == null || label.isBlank()) {
            problems.add(pageId + ": a variant is missing 'label'");
        }
        if (route == null || route.isBlank() || !route.startsWith("/")) {
            problems.add(pageId + ": a variant needs a 'route' starting with '/'");
        }
        if (description == null || description.isBlank()) {
            problems.add(pageId + ": a variant is missing 'description'");
        }

        for (AppUser.Role role : roles) {
            if (variantsByRole.containsKey(role)) {
                problems.add(pageId + ": role " + role + " appears in more than one variant");
                continue;
            }
            variantsByRole.put(role, new PageReference(pageId, module, roles, label, route, description, placeholder));
        }
    }

    private Set<AppUser.Role> parseRoles(String pageId, Object rawRoles, List<String> problems) {
        if (!(rawRoles instanceof List<?> roleList) || roleList.isEmpty()) {
            return Set.of();
        }
        Set<AppUser.Role> roles = new java.util.LinkedHashSet<>();
        for (Object roleObj : roleList) {
            String code = stringOf(roleObj);
            try {
                roles.add(AppUser.Role.valueOf(code == null ? "" : code.trim().toUpperCase(Locale.ROOT)));
            } catch (IllegalArgumentException e) {
                problems.add(pageId + ": unknown role '" + roleObj + "'");
            }
        }
        return roles;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> readYaml() {
        try (InputStream in = new ClassPathResource(CLASSPATH_LOCATION).getInputStream()) {
            return (Map<String, Object>) new Yaml().load(in);
        } catch (IOException e) {
            throw new IllegalStateException("could not read " + CLASSPATH_LOCATION, e);
        } catch (ClassCastException e) {
            throw new IllegalStateException(CLASSPATH_LOCATION + " does not parse as a YAML mapping", e);
        }
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asStringKeyedMap(Map<?, ?> map) {
        return (Map<String, Object>) map;
    }

    private static String stringOf(Object value) {
        return value == null ? null : value.toString();
    }

    // ---- public API -----------------------------------------------------------------------

    /** The page's variant for this role, whether or not it is a placeholder. Empty if the role has none. */
    public Optional<PageReference> find(String pageId, AppUser.Role role) {
        Map<AppUser.Role, PageReference> variants = pagesById.get(pageId);
        if (variants == null || role == null) {
            return Optional.empty();
        }
        return Optional.ofNullable(variants.get(role));
    }

    public boolean exists(String pageId) {
        return pagesById.containsKey(pageId);
    }

    /** Real (non-placeholder) pages this role can reach, in registry declaration order. */
    public List<PageReference> forRole(AppUser.Role role) {
        List<PageReference> result = new ArrayList<>();
        for (Map<AppUser.Role, PageReference> variants : pagesById.values()) {
            PageReference ref = variants.get(role);
            if (ref != null && !ref.placeholder()) {
                result.add(ref);
            }
        }
        return result;
    }

    /** Placeholder pages visible to this role's sidebar — described as "not yet available", never navigated to. */
    public List<PageReference> placeholdersForRole(AppUser.Role role) {
        List<PageReference> result = new ArrayList<>();
        for (Map<AppUser.Role, PageReference> variants : pagesById.values()) {
            PageReference ref = variants.get(role);
            if (ref != null && ref.placeholder()) {
                result.add(ref);
            }
        }
        return result;
    }

    public Set<String> allPageIds() {
        return pagesById.keySet();
    }

    public int size() {
        return pagesById.size();
    }
}
