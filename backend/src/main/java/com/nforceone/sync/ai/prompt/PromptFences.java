package com.nforceone.sync.ai.prompt;

import java.util.regex.Pattern;

/**
 * Neutralises fence-marker text inside data before it is written into a prompt, so content
 * cannot promote itself from data to instruction by closing a fence early and having the rest of
 * itself read as prompt.
 *
 * <p>Two fixes relative to OneHR's equivalent (I5):
 * <ul>
 *   <li>Case-insensitive — OneHR's fence neutraliser was a case-sensitive {@code replace}, so
 *       {@code </KNOWLEDGE>} passed through untouched.</li>
 *   <li>Covers {@code <history>} too, and is applied to conversation history as well as
 *       knowledge/live-data — OneHR replayed prior turns unfenced, which meant an earlier
 *       assistant answer that had echoed injected {@code <userdata>} text (e.g. a manager's
 *       free-text rejection comment) came back into a later prompt as plain, unescaped text.
 * </ul>
 */
public final class PromptFences {

    private static final Pattern KNOWLEDGE_OPEN = Pattern.compile("(?i)<knowledge\\b");
    private static final Pattern KNOWLEDGE_CLOSE = Pattern.compile("(?i)</knowledge\\s*>");
    private static final Pattern USERDATA_OPEN = Pattern.compile("(?i)<userdata\\b");
    private static final Pattern USERDATA_CLOSE = Pattern.compile("(?i)</userdata\\s*>");
    private static final Pattern HISTORY_OPEN = Pattern.compile("(?i)<history\\b");
    private static final Pattern HISTORY_CLOSE = Pattern.compile("(?i)</history\\s*>");

    private PromptFences() {
    }

    /** Escapes any of this module's fence markers found inside {@code text}, whatever their case. */
    public static String sanitize(String text) {
        if (text == null || text.isEmpty()) {
            return text;
        }
        String result = text;
        result = KNOWLEDGE_CLOSE.matcher(result).replaceAll("&lt;/knowledge&gt;");
        result = KNOWLEDGE_OPEN.matcher(result).replaceAll("&lt;knowledge");
        result = USERDATA_CLOSE.matcher(result).replaceAll("&lt;/userdata&gt;");
        result = USERDATA_OPEN.matcher(result).replaceAll("&lt;userdata");
        result = HISTORY_CLOSE.matcher(result).replaceAll("&lt;/history&gt;");
        result = HISTORY_OPEN.matcher(result).replaceAll("&lt;history");
        return result;
    }
}
