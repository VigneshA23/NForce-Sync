package com.nforceone.sync.ai.data;

import com.nforceone.sync.ai.config.AiProperties;
import com.nforceone.sync.ai.contract.AssistantRequestContext;
import com.nforceone.sync.ai.contract.LiveDataSection;
import com.nforceone.sync.ai.contract.RetrievalResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Selects and runs at most {@value #MAX_PROVIDERS_PER_TURN} live-data providers per turn,
 * deterministically from what retrieval already matched — never a generic "ask the model what
 * data it wants" tool.
 *
 * <p>No provider beans exist until a later milestone registers real ones (see
 * {@link AssistantDataProvider}'s javadoc); Spring injects an empty {@code List<AssistantDataProvider>}
 * until then, so this class's selection algorithm is fully exercised by its tests today even
 * though {@link #fetch} returns nothing in production until providers are added.
 */
@Service
public class AssistantDataService {

    private static final Logger log = LoggerFactory.getLogger(AssistantDataService.class);
    private static final int MAX_PROVIDERS_PER_TURN = 3;
    /** How strongly the caller's current page counts toward a module's relevance, alongside retrieval scores. */
    private static final double CURRENT_PAGE_RELEVANCE = 0.75;

    public record Selection(List<LiveDataSection> sections, List<String> providerIds) {
        static final Selection EMPTY = new Selection(List.of(), List.of());
    }

    private record ScoredProvider(AssistantDataProvider provider, double relevance) {
    }

    private final List<AssistantDataProvider> providers;
    private final AiProperties properties;

    public AssistantDataService(List<AssistantDataProvider> providers, AiProperties properties) {
        this.providers = providers;
        this.properties = properties;
    }

    public Selection fetch(AssistantRequestContext context, List<RetrievalResult> knowledge, String currentModule) {
        if (!properties.isLiveDataEnabled() || providers.isEmpty()) {
            return Selection.EMPTY;
        }

        Map<String, Double> moduleRelevance = new HashMap<>();
        for (RetrievalResult r : knowledge) {
            if (r.module() != null) {
                moduleRelevance.merge(r.module(), r.score(), Math::max);
            }
        }
        if (currentModule != null) {
            moduleRelevance.merge(currentModule, CURRENT_PAGE_RELEVANCE, Math::max);
        }

        List<ScoredProvider> eligible = new ArrayList<>();
        for (AssistantDataProvider provider : providers) {
            if (!provider.audiences().contains(context.role())) {
                continue;
            }
            double best = 0.0;
            for (String module : provider.modules()) {
                best = Math.max(best, moduleRelevance.getOrDefault(module, 0.0));
            }
            if (best > 0.0) {
                eligible.add(new ScoredProvider(provider, best));
            }
        }
        if (eligible.isEmpty()) {
            return Selection.EMPTY;
        }

        List<AssistantDataProvider> selected = selectDiverse(eligible);

        List<LiveDataSection> sections = new ArrayList<>();
        List<String> ranProviderIds = new ArrayList<>();
        for (AssistantDataProvider provider : selected) {
            ranProviderIds.add(provider.id());
            try {
                Optional<String> body = provider.fetch(context);
                if (body.isPresent() && !body.get().isBlank()) {
                    sections.add(new LiveDataSection(provider.id(), provider.title(), body.get()));
                }
            } catch (RuntimeException e) {
                // A provider outage costs its own figure, not the turn — the answer falls back
                // to the static explanation, which is still useful.
                log.warn("Live-data provider '{}' failed; continuing without it", provider.id(), e);
            }
        }
        return new Selection(sections, ranProviderIds);
    }

    /**
     * Groups eligible providers by "family" (the id prefix up to the first '.') and fills the
     * {@value #MAX_PROVIDERS_PER_TURN} slots round-robin across families in relevance order, so
     * one family with several own-topic providers cannot crowd out every other relevant family.
     */
    private List<AssistantDataProvider> selectDiverse(List<ScoredProvider> eligible) {
        Map<String, List<ScoredProvider>> byFamily = new HashMap<>();
        for (ScoredProvider sp : eligible) {
            byFamily.computeIfAbsent(family(sp.provider().id()), k -> new ArrayList<>()).add(sp);
        }
        for (List<ScoredProvider> group : byFamily.values()) {
            group.sort(Comparator.comparingDouble(ScoredProvider::relevance).reversed());
        }
        List<String> familyOrder = new ArrayList<>(byFamily.keySet());
        familyOrder.sort(Comparator.comparingDouble((String fam) -> byFamily.get(fam).get(0).relevance()).reversed());

        List<AssistantDataProvider> selected = new ArrayList<>();
        int round = 0;
        boolean addedAny = true;
        while (selected.size() < MAX_PROVIDERS_PER_TURN && addedAny) {
            addedAny = false;
            for (String family : familyOrder) {
                if (selected.size() >= MAX_PROVIDERS_PER_TURN) {
                    break;
                }
                List<ScoredProvider> group = byFamily.get(family);
                if (round < group.size()) {
                    selected.add(group.get(round).provider());
                    addedAny = true;
                }
            }
            round++;
        }
        return selected;
    }

    private static String family(String providerId) {
        int dot = providerId.indexOf('.');
        return dot < 0 ? providerId : providerId.substring(0, dot);
    }
}
