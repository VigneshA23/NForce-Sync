package com.nforceone.sync.org;

import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.project.ProjectRepository;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Department and Designation lists: default returns every row, activeOnly hides deactivated ones. */
class OrgServiceMasterListTest {

    private final DepartmentRepository departmentRepository = mock(DepartmentRepository.class);
    private final DesignationRepository designationRepository = mock(DesignationRepository.class);
    private final OrgService service = new OrgService(
            departmentRepository, designationRepository, mock(OrgLocationRepository.class),
            mock(ProjectTypeRepository.class), mock(AppUserRepository.class), mock(ProjectRepository.class));

    private final Department engineering = Department.builder().id(1L).name("Engineering").active(true).build();
    private final Department legacy = Department.builder().id(2L).name("Legacy").active(false).build();
    private final Designation analyst = Designation.builder().id(1L).title("Analyst").active(true).build();
    private final Designation retired = Designation.builder().id(2L).title("Retired").active(false).build();

    @Test
    void departments_activeOnly_listsOnlyActive() {
        when(departmentRepository.findAllByActiveTrueOrderByNameAsc()).thenReturn(List.of(engineering));
        assertEquals(List.of("Engineering"), service.listDepartments(true).stream().map(DepartmentDto::name).toList());
    }

    @Test
    void departments_default_listsEveryDepartmentIncludingInactive() {
        when(departmentRepository.findAllByOrderByNameAsc()).thenReturn(List.of(engineering, legacy));
        assertEquals(2, service.listDepartments(false).size());
    }

    @Test
    void designations_activeOnly_listsOnlyActive() {
        when(designationRepository.findAllByActiveTrueOrderByTitleAsc()).thenReturn(List.of(analyst));
        assertEquals(List.of("Analyst"), service.listDesignations(true).stream().map(DesignationDto::title).toList());
    }

    @Test
    void designations_default_listsEveryDesignationIncludingInactive() {
        when(designationRepository.findAllByOrderByTitleAsc()).thenReturn(List.of(analyst, retired));
        assertEquals(2, service.listDesignations(false).size());
    }
}
