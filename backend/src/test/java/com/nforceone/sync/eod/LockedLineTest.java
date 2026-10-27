package com.nforceone.sync.eod;

import com.nforceone.sync.config.GlobalExceptionHandler;
import com.nforceone.sync.eod.dto.EodLogLineDto;
import com.nforceone.sync.project.TaskCategory;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.math.BigDecimal;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** A Daily Log line whose blocker has a conversation cannot be removed — and the form is told which line, and why. */
class LockedLineTest {

    @Test
    void theRefusalCarriesTheLineIdAndTheSameMessageAsBefore() {
        BlockerLineLockedException ex = new BlockerLineLockedException(42L, 3);
        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
        assertEquals(42L, ex.getLineId());
        assertEquals("Row 3 has a blocker conversation, so it cannot be removed. Change its status instead.", ex.getReason());
    }

    @Test
    void theResponseBodyAddsLineId_andKeepsTheErrorText() {
        ResponseEntity<Map<String, Object>> res = new GlobalExceptionHandler()
                .handleBlockerLineLocked(new BlockerLineLockedException(42L, 3));
        assertEquals(HttpStatus.CONFLICT, res.getStatusCode());
        assertEquals(42L, res.getBody().get("lineId"));
        assertTrue(res.getBody().get("error").toString().contains("blocker conversation"));
    }

    @Test
    void otherErrorsKeepTheirPlainBody() {
        ResponseEntity<Map<String, Object>> res = new GlobalExceptionHandler().handleResponseStatus(
                new org.springframework.web.server.ResponseStatusException(HttpStatus.CONFLICT, "Entry cannot be edited"));
        assertEquals(Map.of("error", "Entry cannot be edited"), res.getBody());
    }

    @Test
    void theLineDtoSaysWhetherItsBlockerHasAThread() {
        TaskCategory c = new TaskCategory();
        c.setId(5L);
        c.setName("Training");
        EodLogLine l = new EodLogLine();
        l.setId(9L);
        l.setCategory(c);
        l.setHours(new BigDecimal("2.0"));
        l.setDescription("d");
        l.setSortOrder(0);
        assertFalse(EodLogLineDto.from(l).hasBlockerThread(), "false unless the owner's own entry says otherwise");
        assertTrue(EodLogLineDto.from(l).withBlockerThread(true).hasBlockerThread());
        assertEquals("Training", EodLogLineDto.from(l).withBlockerThread(true).categoryName());
    }
}
