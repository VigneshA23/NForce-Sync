package com.nforceone.sync.businessrules;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.auth.AuditLogRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Shift and holiday names are stored trimmed, and the duplicate check runs on the trimmed text: the form trims before
 * it sends, but the API must not depend on that. Names that differ only by case are still distinct (a unique-column
 * and data question, tracked separately).
 */
class BusinessRuleServiceNameTrimTest {

    private final ShiftDefinitionRepository shiftRepository = mock(ShiftDefinitionRepository.class);
    private final HolidayRepository holidayRepository = mock(HolidayRepository.class);
    private final AppUserRepository userRepository = mock(AppUserRepository.class);
    private final BusinessRuleService service = new BusinessRuleService(
            mock(BusinessRuleConfigRepository.class), shiftRepository, holidayRepository,
            userRepository, mock(AuditLogRepository.class), new ObjectMapper());

    private static final LocalTime NINE = LocalTime.of(9, 0);
    private static final LocalTime SIX_PM = LocalTime.of(18, 0);
    private static final LocalDate DAY = LocalDate.of(2026, 8, 15);

    @BeforeEach
    void setUp() {
        when(userRepository.findByEmailAndDeletedAtIsNull("admin@nforceone.com")).thenReturn(Optional.of(new AppUser()));
        when(shiftRepository.save(any(ShiftDefinition.class))).thenAnswer(i -> i.getArgument(0));
        when(holidayRepository.save(any(Holiday.class))).thenAnswer(i -> i.getArgument(0));
    }

    @Test
    void createShift_storesTheTrimmedName_andChecksDuplicatesOnIt() {
        ShiftDefinitionDto created = service.createShift(
                new CreateShiftRequest("  General  ", NINE, SIX_PM, null), "admin@nforceone.com");

        assertEquals("General", created.name());
        verify(shiftRepository).existsByName("General");
    }

    @Test
    void createShift_paddedDuplicateIsStillADuplicate() {
        when(shiftRepository.existsByName("General")).thenReturn(true);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
                service.createShift(new CreateShiftRequest("General ", NINE, SIX_PM, null), "admin@nforceone.com"));

        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
        verify(shiftRepository, never()).save(any());
    }

    @Test
    void updateShift_storesTheTrimmedName_andKeepingTheSameNameIsNotADuplicate() {
        ShiftDefinition existing = ShiftDefinition.builder().id(7L).name("General").startTime(NINE).endTime(SIX_PM).active(true).build();
        when(shiftRepository.findById(7L)).thenReturn(Optional.of(existing));
        when(shiftRepository.existsByName("General")).thenReturn(true);   // it is its own name

        ShiftDefinitionDto updated = service.updateShift(
                7L, new UpdateShiftRequest(" General ", NINE, SIX_PM, null), "admin@nforceone.com");

        assertEquals("General", updated.name());
    }

    @Test
    void createHoliday_storesTheTrimmedName() {
        HolidayDto created = service.createHoliday(new CreateHolidayRequest("  Independence Day ", DAY), "admin@nforceone.com");
        assertEquals("Independence Day", created.name());
    }

    @Test
    void updateHoliday_storesTheTrimmedName() {
        Holiday existing = Holiday.builder().id(3L).name("Old").holidayDate(DAY).build();
        when(holidayRepository.findById(3L)).thenReturn(Optional.of(existing));

        HolidayDto updated = service.updateHoliday(3L, new UpdateHolidayRequest(" Republic Day ", DAY), "admin@nforceone.com");

        assertEquals("Republic Day", updated.name());
    }
}
