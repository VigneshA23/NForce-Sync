package com.nforceone.sync.ai.service;

import com.nforceone.sync.ai.config.AiProperties;
import com.nforceone.sync.ai.contract.ConversationTurn;
import com.nforceone.sync.ai.dto.AssistantMessageDto;
import com.nforceone.sync.ai.entity.AiConversation;
import com.nforceone.sync.ai.entity.AiConversationMessage;
import com.nforceone.sync.ai.repository.AiConversationMessageRepository;
import com.nforceone.sync.ai.repository.AiConversationRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

/**
 * Owner-scoped conversation storage. A foreign or invalid conversation id always safely starts a
 * fresh thread rather than exposing — or erroring on — someone else's (I12/I17 in the plan).
 */
@Service
public class ConversationService {

    private final AiConversationRepository conversationRepository;
    private final AiConversationMessageRepository messageRepository;
    private final AiProperties properties;

    public ConversationService(AiConversationRepository conversationRepository,
            AiConversationMessageRepository messageRepository, AiProperties properties) {
        this.conversationRepository = conversationRepository;
        this.messageRepository = messageRepository;
        this.properties = properties;
    }

    /** Resolves an existing owned conversation, or transparently starts a new one. Never exposes another user's id as if it were the caller's. */
    @Transactional
    public AiConversation resolve(String requestedConversationId, Long userId) {
        UUID id = parseUuid(requestedConversationId);
        if (id != null) {
            var existing = conversationRepository.findByIdAndUserId(id, userId);
            if (existing.isPresent()) {
                return existing.get();
            }
        }
        AiConversation fresh = new AiConversation();
        fresh.setId(UUID.randomUUID());
        fresh.setUserId(userId);
        OffsetDateTime now = OffsetDateTime.now();
        fresh.setCreatedAt(now);
        fresh.setLastMessageAt(now);
        return conversationRepository.save(fresh);
    }

    /**
     * The last {@code maxHistoryTurns} USER/ASSISTANT pairs, oldest first, paired by row id order
     * (never by timestamp alone — two rows written in the same millisecond could otherwise be
     * mispaired, I17).
     */
    public List<ConversationTurn> recentTurns(UUID conversationId) {
        int maxTurns = properties.getLimits().getMaxHistoryTurns();
        // Fetch up to 2x the turn count (a USER + ASSISTANT row per turn), newest first.
        List<AiConversationMessage> recentDesc = messageRepository.findByConversationIdOrderByIdDesc(
                conversationId, PageRequest.of(0, maxTurns * 2));
        List<AiConversationMessage> chronological = new ArrayList<>(recentDesc);
        Collections.reverse(chronological);

        List<ConversationTurn> turns = new ArrayList<>();
        String pendingUserMessage = null;
        for (AiConversationMessage message : chronological) {
            if ("USER".equals(message.getSender())) {
                pendingUserMessage = message.getContent();
            } else if ("ASSISTANT".equals(message.getSender()) && pendingUserMessage != null) {
                turns.add(new ConversationTurn(pendingUserMessage, message.getContent()));
                pendingUserMessage = null;
            }
        }
        if (turns.size() > maxTurns) {
            turns = turns.subList(turns.size() - maxTurns, turns.size());
        }
        return turns;
    }

    /** Records both sides of a turn and bumps the conversation's last-activity time. Returns the assistant message's id. */
    @Transactional
    public Long recordTurn(AiConversation conversation, String userMessage, String assistantAnswer, String responseType) {
        OffsetDateTime now = OffsetDateTime.now();

        AiConversationMessage userRow = new AiConversationMessage();
        userRow.setConversationId(conversation.getId());
        userRow.setSender("USER");
        userRow.setContent(userMessage);
        userRow.setCreatedAt(now);
        messageRepository.save(userRow);

        AiConversationMessage assistantRow = new AiConversationMessage();
        assistantRow.setConversationId(conversation.getId());
        assistantRow.setSender("ASSISTANT");
        assistantRow.setContent(assistantAnswer);
        assistantRow.setResponseType(responseType);
        assistantRow.setCreatedAt(now);
        AiConversationMessage saved = messageRepository.save(assistantRow);

        conversation.setLastMessageAt(now);
        conversationRepository.save(conversation);

        return saved.getId();
    }

    /** Owner-scoped transcript for GET /conversations/{id}. A foreign id returns an empty list, never a 403 — see class javadoc. */
    public List<AssistantMessageDto> transcript(String requestedConversationId, Long userId) {
        UUID id = parseUuid(requestedConversationId);
        if (id == null || conversationRepository.findByIdAndUserId(id, userId).isEmpty()) {
            return List.of();
        }
        List<AiConversationMessage> messages = messageRepository.findByConversationIdOrderByIdDesc(
                id, PageRequest.of(0, Integer.MAX_VALUE - 1));
        Collections.reverse(messages);
        return messages.stream()
                .map(m -> new AssistantMessageDto(m.getId(), m.getSender(), m.getContent(), m.getResponseType(), m.getCreatedAt()))
                .toList();
    }

    /** Deletes messages but keeps the conversation row and id, so the active tab stays coherent. Silently a no-op for a foreign/unknown id. */
    @Transactional
    public void clear(String requestedConversationId, Long userId) {
        UUID id = parseUuid(requestedConversationId);
        if (id == null || conversationRepository.findByIdAndUserId(id, userId).isEmpty()) {
            return;
        }
        messageRepository.deleteByConversationId(id);
    }

    private static UUID parseUuid(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(value.trim());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
