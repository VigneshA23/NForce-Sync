package com.nforceone.sync.businessrules;

import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.auth.AuditLogRepository;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.time.LocalTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Shift Timings needs every shift to manage; the Add/Edit User picker asks for active only. */
class BusinessRuleServiceShiftListTest {

    private final ShiftDefinitionRepository shiftRepository = mock(ShiftDefinitionRepository.class);
    private final BusinessRuleService service = new BusinessRuleService(
            mock(BusinessRuleConfigRepository.class), shiftRepository, mock(HolidayRepository.class),
            mock(AppUserRepository.class), mock(AuditLogRepository.class), new ObjectMapper());

    private static ShiftDefinition shift(long id, String name, boolean active) {
        return ShiftDefinition.builder().id(id).name(name)
                .startTime(LocalTime.of(9, 0)).endTime(LocalTime.of(18, 0)).active(active).build();
    }

    @Test
    void activeOnly_listsOnlyActiveShifts() {
        when(shiftRepository.findAllByActiveTrueOrderByStartTimeAsc()).thenReturn(List.of(shift(1, "Day", true)));
        assertEquals(List.of("Day"), service.listShifts(true).stream().map(ShiftDefinitionDto::name).toList());
    }

    @Test
    void default_listsEveryShiftIncludingInactive_soTheManagementPageCanReactivateThem() {
        when(shiftRepository.findAllByOrderByStartTimeAsc())
                .thenReturn(List.of(shift(1, "Day", true), shift(2, "Night", false)));
        List<ShiftDefinitionDto> all = service.listShifts(false);
        assertEquals(2, all.size());
        assertEquals(false, all.get(1).active());
    }
}
