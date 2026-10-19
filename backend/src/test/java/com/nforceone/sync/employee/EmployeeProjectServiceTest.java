package com.nforceone.sync.employee;

import com.nforceone.sync.project.Allocation;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class EmployeeProjectServiceTest {

    private static Allocation alloc(LocalDate from, LocalDate to) {
        Allocation a = new Allocation();
        a.setEffectiveFrom(from);
        a.setEffectiveTo(to);
        return a;
    }

    private static final LocalDate TODAY = LocalDate.of(2026, 10, 19);

    @Test
    void picksTheAllocationActiveToday() {
        Allocation past = alloc(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 8, 31));
        Allocation current = alloc(LocalDate.of(2026, 10, 1), null);
        assertEquals(current, EmployeeProjectService.pickAllocation(List.of(past, current), TODAY).orElseThrow());
    }

    @Test
    void fallsBackToMostRecentWhenNoneIsActive() {
        Allocation older = alloc(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 3, 31));
        Allocation newer = alloc(LocalDate.of(2026, 4, 1), LocalDate.of(2026, 6, 30));
        assertEquals(newer, EmployeeProjectService.pickAllocation(List.of(older, newer), TODAY).orElseThrow());
    }

    @Test
    void emptyWhenNoAllocations() {
        assertTrue(EmployeeProjectService.pickAllocation(List.of(), TODAY).isEmpty());
    }
}
