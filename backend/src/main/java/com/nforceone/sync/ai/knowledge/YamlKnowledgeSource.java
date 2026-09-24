package com.nforceone.sync.ai.knowledge;

import com.nforceone.sync.ai.contract.KnowledgeDocument;
import com.nforceone.sync.ai.contract.KnowledgeType;
import com.nforceone.sync.auth.AppUser;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;
import org.yaml.snakeyaml.Yaml;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Loads every {@code knowledge:} unit from {@code classpath*:ai-knowledge/**\/*.yaml}, excluding
 * {@code pages/registry.yaml} (that file is navigation configuration, not knowledge — see
 * {@code PageRegistry}). Knowledge describes how Sync actually behaves, so it is authored beside
 * the code it describes and reviewed like a diff, the same reasoning OneHR's authoring docs give
 * for not moving this into a DB-backed admin UI.
 *
 * <p>Parsing is strict: a malformed YAML file throws immediately, since it goes through code
 * review before it can reach a reindex. This mirrors {@link com.nforceone.sync.ai.navigation.PageRegistry}'s
 * fail-fast posture, not {@code KnowledgeSchemaValidator}'s "collect every problem" posture — that
 * validator runs afterward, once every document has successfully parsed.
 */
@Component
public class YamlKnowledgeSource implements KnowledgeSource {

    private static final String CLASSPATH_PATTERN = "classpath*:ai-knowledge/**/*.yaml";
    private static final String REGISTRY_SUFFIX = "pages/registry.yaml";

    private final PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();

    @Override
    public String name() {
        return "yaml";
    }

    @Override
    public List<KnowledgeDocument> load() {
        List<KnowledgeDocument> documents = new ArrayList<>();
        Resource[] resources;
        try {
            resources = resolver.getResources(CLASSPATH_PATTERN);
        } catch (IOException e) {
            throw new IllegalStateException("failed to scan " + CLASSPATH_PATTERN, e);
        }

        for (Resource resource : resources) {
            String relativePath = relativeAiKnowledgePath(resource);
            if (relativePath.endsWith(REGISTRY_SUFFIX)) {
                continue;
            }
            documents.addAll(parseFile(resource, relativePath));
        }
        return documents;
    }

    @SuppressWarnings("unchecked")
    private List<KnowledgeDocument> parseFile(Resource resource, String relativePath) {
        String sourceRef = name() + ":" + relativePath;
        Map<String, Object> root;
        try (InputStream in = resource.getInputStream()) {
            root = (Map<String, Object>) new Yaml().load(in);
        } catch (IOException e) {
            throw new IllegalStateException("could not read " + relativePath, e);
        } catch (ClassCastException e) {
            throw new IllegalStateException(relativePath + " does not parse as a YAML mapping", e);
        }

        Object rawUnits = root == null ? null : root.get("knowledge");
        if (!(rawUnits instanceof List<?> unitList)) {
            throw new IllegalStateException(relativePath + " must have a top-level 'knowledge' list");
        }

        List<KnowledgeDocument> documents = new ArrayList<>();
        for (Object unitObj : unitList) {
            if (!(unitObj instanceof Map<?, ?> unitMap)) {
                throw new IllegalStateException(relativePath + ": a 'knowledge' entry is not a mapping: " + unitObj);
            }
            documents.add(parseUnit((Map<String, Object>) unitMap, sourceRef, relativePath));
        }
        return documents;
    }

    @SuppressWarnings("unchecked")
    private KnowledgeDocument parseUnit(Map<String, Object> unit, String sourceRef, String relativePath) {
        String knowledgeId = stringOf(unit.get("knowledgeId"));
        KnowledgeType type = KnowledgeType.fromCode(stringOf(unit.get("type")))
                .orElseThrow(() -> new IllegalStateException(
                        relativePath + ": unit '" + knowledgeId + "' has a missing/unknown 'type'"));

        int version = unit.get("version") == null ? 1 : ((Number) unit.get("version")).intValue();

        return new KnowledgeDocument(
                knowledgeId,
                type,
                stringOf(unit.get("module")),
                stringOf(unit.get("pageId")),
                stringOf(unit.get("actionId")),
                stringOf(unit.get("workflowId")),
                version,
                parseAudience(unit.get("audience")),
                sourceRef,
                stringOf(unit.get("title")),
                stringOf(unit.get("body")),
                stringListOf(unit.get("synonyms")),
                stringListOf(unit.get("sources")),
                stringListOf(unit.get("errorMessages")),
                (Map<String, Object>) unit.getOrDefault("metadata", Map.of()));
    }

    private static Set<AppUser.Role> parseAudience(Object rawAudience) {
        Set<AppUser.Role> roles = new LinkedHashSet<>();
        if (!(rawAudience instanceof List<?> list)) {
            return roles;
        }
        for (Object item : list) {
            String code = stringOf(item);
            if (code == null) {
                continue;
            }
            try {
                roles.add(AppUser.Role.valueOf(code.trim().toUpperCase(Locale.ROOT)));
            } catch (IllegalArgumentException ignored) {
                // Left out of the set on purpose — KnowledgeSchemaValidator reports an empty/short
                // audience as a problem rather than this loader guessing at silent correction.
            }
        }
        return roles;
    }

    private static List<String> stringListOf(Object raw) {
        if (!(raw instanceof List<?> list)) {
            return List.of();
        }
        List<String> result = new ArrayList<>(list.size());
        for (Object item : list) {
            String s = stringOf(item);
            if (s != null) {
                result.add(s);
            }
        }
        return result;
    }

    private static String stringOf(Object value) {
        return value == null ? null : value.toString();
    }

    private static String relativeAiKnowledgePath(Resource resource) {
        try {
            String uri = resource.getURL().toString();
            int idx = uri.indexOf("ai-knowledge/");
            return idx >= 0 ? uri.substring(idx) : "ai-knowledge/" + resource.getFilename();
        } catch (IOException e) {
            return "ai-knowledge/" + resource.getFilename();
        }
    }
}
