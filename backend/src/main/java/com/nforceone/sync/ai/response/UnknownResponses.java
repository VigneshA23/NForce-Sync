package com.nforceone.sync.ai.response;

import com.nforceone.sync.ai.contract.AssistantResponse;
import com.nforceone.sync.ai.contract.AssistantResponseType;
import com.nforceone.sync.ai.contract.ConfidenceLevel;

import java.util.List;

/**
 * Every controlled decline the assistant can return. All are {@code type=UNKNOWN}, empty steps,
 * empty related, {@code confidence=LOW}, and no navigation — text only, since {@code conversationId}
 * and {@code messageId} are attached by the caller via {@link AssistantResponse#withConversationId}.
 *
 * <p>Unlike OneHR, Sync has no Help & Guidance feature to point a stuck user at (see the
 * implementation plan's C10 correction) — every decline here points to a person (the user's Team
 * Lead or an administrator) instead of a page that does not exist.
 */
public final class UnknownResponses {

    private UnknownResponses() {
    }

    private static AssistantResponse of(String answer) {
        return new AssistantResponse(AssistantResponseType.UNKNOWN, answer,
                List.of(), null, List.of(), ConfidenceLevel.LOW, null, null);
    }

    public static AssistantResponse disabled() {
        return of("The AI assistant isn't turned on right now. Please reach out to your Team "
                + "Lead or an administrator if you need help with something in Sync.");
    }

    public static AssistantResponse inactiveUser() {
        return of("This account isn't currently active, so the assistant can't answer for it. "
                + "Please contact an administrator.");
    }

    public static AssistantResponse emptyMessage() {
        return of("I didn't receive a question to answer. Try typing what you'd like help with.");
    }

    public static AssistantResponse messageTooLong(int maxChars) {
        return of("That question is longer than I can take in one go (limit " + maxChars
                + " characters). Try splitting it into smaller questions.");
    }

    public static AssistantResponse notEnoughKnowledge() {
        return of("I couldn't find enough information about that in Sync to answer reliably, so "
                + "I'd rather not guess. Try rephrasing with the wording Sync uses, or check with "
                + "your Team Lead or an administrator.");
    }

    public static AssistantResponse retrievalUnavailable() {
        return of("The assistant is temporarily unavailable. Please try again in a moment. If you "
                + "need an answer now, your Team Lead or an administrator can help.");
    }

    public static AssistantResponse providerUnavailable() {
        return of("The assistant is temporarily unavailable. Please try again in a moment. If you "
                + "need an answer now, your Team Lead or an administrator can help.");
    }

    public static AssistantResponse malformedResponse() {
        return of("I wasn't able to produce a reliable answer to that. Please try rephrasing the "
                + "question.");
    }

    /** I19: a model answer that falsely claims to have performed a mutating action must never reach the user as-is. */
    public static AssistantResponse claimedAction() {
        return of("I can explain how to do that in Sync, but I can't do it for you — the "
                + "assistant is read-only. Ask me how, and I'll walk you through it, or tell you "
                + "who can do it.");
    }
}
