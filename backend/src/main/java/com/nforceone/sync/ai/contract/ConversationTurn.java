package com.nforceone.sync.ai.contract;

/** One bounded prior turn (question + answer) replayed as context — never as authority. */
public record ConversationTurn(String userMessage, String assistantAnswer) {
}
