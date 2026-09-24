package com.nforceone.sync.ai.retrieval;

import com.nforceone.sync.ai.config.AiProperties;
import com.nforceone.sync.ai.contract.EmbeddingProvider;
import com.nforceone.sync.ai.contract.KnowledgeIndexRepository;
import com.nforceone.sync.ai.contract.KnowledgeRetriever;
import com.nforceone.sync.ai.contract.RetrievalQuery;
import com.nforceone.sync.ai.contract.RetrievalResult;
import com.nforceone.sync.ai.exception.AiProviderException;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Query embedding, over-fetch, page/module boosting, dedup by knowledge unit, and context-budget
 * trimming — everything between "the caller's question" and "a bounded list of chunks ready to
 * fence into the prompt". The audience filter itself lives in
 * {@link KnowledgeIndexRepository#search}'s SQL, not here.
 */
@Component
public class VectorKnowledgeRetriever implements KnowledgeRetriever {

    private static final double PAGE_BOOST = 0.05;
    private static final double MODULE_BOOST = 0.03;

    private final EmbeddingProvider embeddingProvider;
    private final KnowledgeIndexRepository indexRepository;
    private final AiProperties properties;

    public VectorKnowledgeRetriever(EmbeddingProvider embeddingProvider, KnowledgeIndexRepository indexRepository,
            AiProperties properties) {
        this.embeddingProvider = embeddingProvider;
        this.indexRepository = indexRepository;
        this.properties = properties;
    }

    /**
     * @param query {@code embedding} is ignored (computed here); {@code topK}/{@code minScore},
     *              if zero/non-positive, fall back to the configured defaults.
     * @param deadline the remaining budget for this turn — bounds the embedding call's retries.
     */
    @Override
    public List<RetrievalResult> retrieve(RetrievalQuery query, Instant deadline) throws AiProviderException {
        AiProperties.Retrieval retrievalConfig = properties.getRetrieval();
        int finalTopK = query.topK() > 0 ? query.topK() : retrievalConfig.getTopK();
        double minScore = query.minScore() > 0 ? query.minScore() : retrievalConfig.getMinScore();
        int candidateCount = finalTopK * Math.max(1, retrievalConfig.getCandidateMultiplier());

        float[] embedding = embeddingProvider.embed(query.rawQuery(), deadline);

        RetrievalQuery candidateQuery = new RetrievalQuery(
                query.rawQuery(), embedding, query.audience(), query.moduleHint(), query.pageIdHint(),
                candidateCount, minScore);
        List<RetrievalResult> candidates = indexRepository.search(candidateQuery);

        List<RetrievalResult> boosted = applyBoosts(candidates, query.moduleHint(), query.pageIdHint());
        List<RetrievalResult> deduped = dedupeByKnowledgeUnit(boosted);
        return applyTopKAndBudget(deduped, finalTopK, retrievalConfig.getMaxContextChars());
    }

    private List<RetrievalResult> applyBoosts(List<RetrievalResult> candidates, String moduleHint, String pageIdHint) {
        List<RetrievalResult> boosted = new ArrayList<>(candidates.size());
        for (RetrievalResult r : candidates) {
            double score = r.score();
            if (pageIdHint != null && pageIdHint.equals(r.pageId())) {
                score += PAGE_BOOST;
            }
            if (moduleHint != null && moduleHint.equals(r.module())) {
                score += MODULE_BOOST;
            }
            score = Math.min(1.0, score);
            boosted.add(score == r.score() ? r : new RetrievalResult(r.knowledgeId(), r.chunkOrdinal(), r.type(),
                    r.module(), r.pageId(), r.sourceRef(), r.title(), r.body(), score));
        }
        boosted.sort((a, b) -> Double.compare(b.score(), a.score()));
        return boosted;
    }

    private List<RetrievalResult> dedupeByKnowledgeUnit(List<RetrievalResult> boosted) {
        Map<String, RetrievalResult> best = new LinkedHashMap<>();
        for (RetrievalResult r : boosted) {
            best.merge(r.knowledgeId(), r, (existing, incoming) -> incoming.score() > existing.score() ? incoming : existing);
        }
        List<RetrievalResult> deduped = new ArrayList<>(best.values());
        deduped.sort((a, b) -> Double.compare(b.score(), a.score()));
        return deduped;
    }

    private List<RetrievalResult> applyTopKAndBudget(List<RetrievalResult> deduped, int topK, int maxContextChars) {
        List<RetrievalResult> result = new ArrayList<>();
        int used = 0;
        for (RetrievalResult r : deduped) {
            if (result.size() >= topK) {
                break;
            }
            int size = (r.title() == null ? 0 : r.title().length()) + (r.body() == null ? 0 : r.body().length());
            // The first chunk is always kept even if it alone exceeds the budget — a budget of
            // zero results would be worse than one slightly-over-budget chunk.
            if (!result.isEmpty() && used + size > maxContextChars) {
                break;
            }
            result.add(r);
            used += size;
        }
        return result;
    }
}
