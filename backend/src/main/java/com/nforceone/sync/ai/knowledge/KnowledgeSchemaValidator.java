package com.nforceone.sync.ai.knowledge;

import com.nforceone.sync.ai.contract.KnowledgeDocument;
import com.nforceone.sync.ai.contract.KnowledgeType;
import com.nforceone.sync.ai.contract.PageReference;
import com.nforceone.sync.ai.exception.KnowledgeValidationException;
import com.nforceone.sync.ai.navigation.PageRegistry;
import com.nforceone.sync.auth.AppUser;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * Validates every loaded {@link KnowledgeDocument} before a reindex writes anything. Collects
 * <b>every</b> problem across every source rather than throwing on the first, so a broken edit
 * reports the whole list of things to fix in one pass — the same posture as
 * {@link com.nforceone.sync.ai.navigation.PageRegistry}, extended to per-unit content problems.
 *
 * <p>Deliberately filesystem-free: it never checks that a {@code sources:} path exists on disk.
 * A reindex can run against a deployed Sync instance where the repository source tree does not
 * exist at all — that check belongs to {@code KnowledgeSourceTraceabilityTest}, which runs only
 * at build time against the actual checked-out repository.
 */
@Component
public class KnowledgeSchemaValidator {

    private static final int MIN_BODY_CHARS = 40;
    private static final int MAX_BODY_CHARS = 4000;

    private final PageRegistry pageRegistry;

    public KnowledgeSchemaValidator(PageRegistry pageRegistry) {
        this.pageRegistry = pageRegistry;
    }

    /** @throws KnowledgeValidationException carrying every problem found, if any. */
    public void validate(List<KnowledgeDocument> documents) {
        List<String> problems = new ArrayList<>();
        Set<String> seenIds = new HashSet<>();
        for (KnowledgeDocument doc : documents) {
            validateOne(doc, seenIds, problems);
        }
        if (!problems.isEmpty()) {
            throw new KnowledgeValidationException(problems);
        }
    }

    private void validateOne(KnowledgeDocument doc, Set<String> seenIds, List<String> problems) {
        String id = doc.knowledgeId();
        String where = (id == null || id.isBlank())
                ? "<missing knowledgeId> in " + doc.sourceRef()
                : id;

        if (id == null || id.isBlank()) {
            problems.add(where + ": knowledgeId is required");
        } else if (!seenIds.add(id)) {
            // Duplicates silently overwrite each other at upsert time (same knowledgeId, chunk
            // ordinal 0) — the most damaging kind of drift to let through unreported.
            problems.add("duplicate knowledgeId: " + id);
        }

        if (doc.type() == null) {
            problems.add(where + ": type is missing or not a recognised KnowledgeType");
        }

        Set<AppUser.Role> audience = doc.audience();
        if (audience == null || audience.isEmpty()) {
            problems.add(where + ": audience must not be empty — an untagged unit is fail-closed "
                    + "(visible to nobody), never fall back to visible-to-everyone");
        }

        String body = doc.body() == null ? "" : doc.body().trim();
        if (body.length() < MIN_BODY_CHARS) {
            problems.add(where + ": body is only " + body.length() + " characters (minimum "
                    + MIN_BODY_CHARS + ") — still embeds to a valid vector and can win a retrieval "
                    + "slot while answering nothing");
        } else if (body.length() > MAX_BODY_CHARS) {
            problems.add(where + ": body is " + body.length() + " characters (maximum "
                    + MAX_BODY_CHARS + ") — split it by hand into two properly-titled units instead "
                    + "of relying on the chunker's paragraph-boundary backstop");
        }

        if (doc.title() == null || doc.title().isBlank()) {
            problems.add(where + ": title is required");
        }

        if (doc.version() < 1) {
            problems.add(where + ": version must be >= 1");
        }

        validatePageId(doc, where, audience, problems);
        validateTypeSpecificFields(doc, where, problems);
    }

    private void validatePageId(KnowledgeDocument doc, String where, Set<AppUser.Role> audience, List<String> problems) {
        String pageId = doc.pageId();
        if (pageId == null || pageId.isBlank()) {
            return;
        }
        if (!pageRegistry.exists(pageId)) {
            // The most damaging failure this system has: the model reads "go to X", proposes X,
            // NavigationValidator correctly refuses it, and the user gets an answer describing a
            // destination with no way to reach it.
            problems.add(where + ": pageId '" + pageId + "' does not exist in the page registry");
            return;
        }
        if (audience == null) {
            return;
        }
        for (AppUser.Role role : audience) {
            Optional<PageReference> ref = pageRegistry.find(pageId, role);
            if (ref.isEmpty()) {
                problems.add(where + ": audience includes " + role + " but pageId '" + pageId
                        + "' has no variant for that role");
            } else if (ref.get().placeholder()) {
                problems.add(where + ": pageId '" + pageId + "' is a placeholder for role " + role
                        + " — knowledge must not describe a roadmap page as currently available");
            }
        }
    }

    private void validateTypeSpecificFields(KnowledgeDocument doc, String where, List<String> problems) {
        KnowledgeType type = doc.type();
        if (type == null) {
            return;
        }
        boolean requiresSources = type == KnowledgeType.PAGE || type == KnowledgeType.ACTION
                || type == KnowledgeType.WORKFLOW || type == KnowledgeType.ERROR;
        if (requiresSources && doc.sources().isEmpty()) {
            problems.add(where + ": type " + type + " requires at least one entry in 'sources' "
                    + "(the controller/service/DTO file(s) this unit was authored from)");
        }
        if (type == KnowledgeType.ERROR && doc.errorMessages().isEmpty()) {
            problems.add(where + ": type ERROR requires at least one entry in 'errorMessages'");
        }
    }
}
