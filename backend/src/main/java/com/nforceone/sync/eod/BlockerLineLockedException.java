package com.nforceone.sync.eod;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * A saved Daily Log line cannot be removed because its blocker already has a conversation. A plain 409, but it
 * carries the line's id so the form can show the message next to THAT line (the response body gains "lineId";
 * the "error" text is unchanged).
 */
public class BlockerLineLockedException extends ResponseStatusException {

    private final Long lineId;

    public BlockerLineLockedException(Long lineId, int rowNumber) {
        super(HttpStatus.CONFLICT, "Row " + rowNumber + " has a blocker conversation, so it cannot be removed. "
                + "Change its status instead.");
        this.lineId = lineId;
    }

    public Long getLineId() {
        return lineId;
    }
}
