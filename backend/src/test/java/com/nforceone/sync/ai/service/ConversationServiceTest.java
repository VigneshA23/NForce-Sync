package com.nforceone.sync.ai.service;

import com.nforceone.sync.ai.config.AiProperties;
import com.nforceone.sync.ai.contract.ConversationTurn;
import com.nforceone.sync.ai.entity.AiConversation;
import com.nforceone.sync.ai.entity.AiConversationMessage;
import com.nforceone.sync.ai.repository.AiConversationMessageRepository;
import com.nforceone.sync.ai.repository.AiConversationRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class ConversationServiceTest {

    private AiConversationRepository conversationRepository;
    private AiConversationMessageRepository messageRepository;
    private ConversationService service;

    @BeforeEach
    void setUp() {
        conversationRepository = mock(AiConversationRepository.class);
        messageRepository = mock(AiConversationMessageRepository.class);
        AiProperties properties = new AiProperties();
        service = new ConversationService(conversationRepository, messageRepository, properties);

        when(conversationRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(messageRepository.save(any())).thenAnswer(inv -> {
            AiConversationMessage m = inv.getArgument(0);
            if (m.getId() == null) {
                m.setId((long) (Math.random() * 1_000_000));
            }
            return m;
        });
    }

    @Test
    void resolveStartsAFreshConversationWhenNoIdIsSupplied() {
        AiConversation result = service.resolve(null, 42L);
        assertNotNull(result.getId());
        assertEquals(42L, result.getUserId());
        verify(conversationRepository, never()).findByIdAndUserId(any(), any());
    }

    @Test
    void resolveStartsAFreshConversationForAnUnparsableId() {
        AiConversation result = service.resolve("not-a-uuid", 42L);
        assertNotNull(result.getId());
        assertEquals(42L, result.getUserId());
    }

    @Test
    void resolveStartsAFreshConversationForAForeignOrUnknownId() {
        UUID foreignId = UUID.randomUUID();
        when(conversationRepository.findByIdAndUserId(foreignId, 42L)).thenReturn(Optional.empty());

        AiConversation result = service.resolve(foreignId.toString(), 42L);

        assertNotEquals(foreignId, result.getId(), "a foreign id must never be reused as the caller's own conversation");
        assertEquals(42L, result.getUserId());
    }

    @Test
    void resolveReturnsTheExistingOwnedConversation() {
        UUID id = UUID.randomUUID();
        AiConversation existing = new AiConversation();
        existing.setId(id);
        existing.setUserId(42L);
        when(conversationRepository.findByIdAndUserId(id, 42L)).thenReturn(Optional.of(existing));

        AiConversation result = service.resolve(id.toString(), 42L);

        assertSame(existing, result);
        verify(conversationRepository, never()).save(any());
    }

    @Test
    void recordTurnSavesBothSidesAndReturnsTheAssistantMessageId() {
        AiConversation conversation = new AiConversation();
        conversation.setId(UUID.randomUUID());
        conversation.setUserId(42L);

        Long messageId = service.recordTurn(conversation, "question", "answer", "HOW_TO");

        assertNotNull(messageId);
        ArgumentCaptor<AiConversationMessage> captor = ArgumentCaptor.forClass(AiConversationMessage.class);
        verify(messageRepository, times(2)).save(captor.capture());
        List<AiConversationMessage> saved = captor.getAllValues();
        assertEquals("USER", saved.get(0).getSender());
        assertEquals("question", saved.get(0).getContent());
        assertEquals("ASSISTANT", saved.get(1).getSender());
        assertEquals("answer", saved.get(1).getContent());
        assertEquals("HOW_TO", saved.get(1).getResponseType());
        verify(conversationRepository).save(conversation);
    }

    @Test
    void transcriptIsEmptyForAForeignConversationId() {
        UUID id = UUID.randomUUID();
        when(conversationRepository.findByIdAndUserId(id, 99L)).thenReturn(Optional.empty());
        assertTrue(service.transcript(id.toString(), 99L).isEmpty());
        verify(messageRepository, never()).findByConversationIdOrderByIdDesc(any(), any());
    }

    @Test
    void clearDeletesMessagesButKeepsTheConversationRow() {
        UUID id = UUID.randomUUID();
        AiConversation existing = new AiConversation();
        existing.setId(id);
        existing.setUserId(42L);
        when(conversationRepository.findByIdAndUserId(id, 42L)).thenReturn(Optional.of(existing));

        service.clear(id.toString(), 42L);

        verify(messageRepository).deleteByConversationId(id);
        verify(conversationRepository, never()).save(any());
        // AiConversationRepository has no delete method at all — a stronger, compile-time
        // guarantee that clear() can never remove the conversation row, so no runtime check needed.
    }

    @Test
    void clearIsANoOpForAForeignConversationId() {
        UUID id = UUID.randomUUID();
        when(conversationRepository.findByIdAndUserId(id, 99L)).thenReturn(Optional.empty());
        service.clear(id.toString(), 99L);
        verify(messageRepository, never()).deleteByConversationId(any());
    }

    @Test
    void recentTurnsPairsUserAndAssistantMessagesInOrder() {
        UUID conversationId = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now();

        // Repository returns newest-first, as ConversationService requests.
        AiConversationMessage a2 = message(4L, "ASSISTANT", "answer2", now.plusSeconds(3));
        AiConversationMessage u2 = message(3L, "USER", "question2", now.plusSeconds(2));
        AiConversationMessage a1 = message(2L, "ASSISTANT", "answer1", now.plusSeconds(1));
        AiConversationMessage u1 = message(1L, "USER", "question1", now);
        when(messageRepository.findByConversationIdOrderByIdDesc(eq(conversationId), any()))
                .thenReturn(List.of(a2, u2, a1, u1));

        List<ConversationTurn> turns = service.recentTurns(conversationId);

        assertEquals(2, turns.size());
        assertEquals("question1", turns.get(0).userMessage());
        assertEquals("answer1", turns.get(0).assistantAnswer());
        assertEquals("question2", turns.get(1).userMessage());
        assertEquals("answer2", turns.get(1).assistantAnswer());
    }

    private static AiConversationMessage message(Long id, String sender, String content, OffsetDateTime createdAt) {
        AiConversationMessage m = new AiConversationMessage();
        m.setId(id);
        m.setSender(sender);
        m.setContent(content);
        m.setCreatedAt(createdAt);
        return m;
    }
}
