package com.nforceone.sync.org;

import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.project.ProjectRepository;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** GET /org/locations: default returns every location, activeOnly hides deactivated ones. */
class OrgServiceLocationListTest {

    private final OrgLocationRepository locationRepository = mock(OrgLocationRepository.class);
    private final OrgService service = new OrgService(
            mock(DepartmentRepository.class), mock(DesignationRepository.class), locationRepository,
            mock(ProjectTypeRepository.class), mock(AppUserRepository.class), mock(ProjectRepository.class));

    private final OrgLocation chennai = OrgLocation.builder().id(1L).name("Chennai").active(true).build();
    private final OrgLocation hyderabad = OrgLocation.builder().id(2L).name("Hyderabad, India").active(false).build();

    @Test
    void activeOnly_listsOnlyActiveLocations() {
        when(locationRepository.findAllByActiveTrueOrderByNameAsc()).thenReturn(List.of(chennai));
        List<OrgLocationDto> result = service.listLocations(true);
        assertEquals(List.of("Chennai"), result.stream().map(OrgLocationDto::name).toList());
    }

    @Test
    void default_listsAllLocationsIncludingInactive() {
        when(locationRepository.findAllByOrderByNameAsc()).thenReturn(List.of(chennai, hyderabad));
        List<OrgLocationDto> result = service.listLocations(false);
        assertEquals(2, result.size());
        assertEquals(false, result.get(1).active());
    }
}
