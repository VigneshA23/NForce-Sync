package com.nforceone.sync.org;

import com.nforceone.sync.auth.AppUserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
@Transactional
public class OrgService {

    private final DepartmentRepository departmentRepository;
    private final DesignationRepository designationRepository;
    private final OrgLocationRepository locationRepository;
    private final AppUserRepository appUserRepository;

    public OrgService(DepartmentRepository departmentRepository,
                      DesignationRepository designationRepository,
                      OrgLocationRepository locationRepository,
                      AppUserRepository appUserRepository) {
        this.departmentRepository = departmentRepository;
        this.designationRepository = designationRepository;
        this.locationRepository = locationRepository;
        this.appUserRepository = appUserRepository;
    }

    // ── Department ────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<DepartmentDto> listDepartments() {
        return departmentRepository.findAllByOrderByNameAsc()
                .stream()
                .map(DepartmentDto::from)
                .toList();
    }

    public DepartmentDto createDepartment(CreateDepartmentRequest req) {
        if (departmentRepository.existsByName(req.name())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "A department with this name already exists");
        }
        Department dept = Department.builder()
                .name(req.name())
                .active(true)
                .build();
        return DepartmentDto.from(departmentRepository.save(dept));
    }

    public DepartmentDto toggleDepartment(Long id) {
        Department dept = departmentRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Department not found"));
        dept.setActive(!dept.isActive());
        return DepartmentDto.from(departmentRepository.save(dept));
    }

    // ── Designation ───────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<DesignationDto> listDesignations() {
        return designationRepository.findAllByOrderByTitleAsc()
                .stream()
                .map(DesignationDto::from)
                .toList();
    }

    public DesignationDto createDesignation(CreateDesignationRequest req) {
        if (designationRepository.existsByTitle(req.title())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "A designation with this title already exists");
        }
        Designation designation = Designation.builder()
                .title(req.title())
                .active(true)
                .build();
        return DesignationDto.from(designationRepository.save(designation));
    }

    public DesignationDto toggleDesignation(Long id) {
        Designation designation = designationRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Designation not found"));
        designation.setActive(!designation.isActive());
        return DesignationDto.from(designationRepository.save(designation));
    }

    // ── Location ──────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<OrgLocationDto> listLocations() {
        return locationRepository.findAllByOrderByNameAsc()
                .stream()
                .map(OrgLocationDto::from)
                .toList();
    }

    public OrgLocationDto createLocation(CreateLocationRequest req) {
        if (locationRepository.existsByName(req.name())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "A location with this name already exists");
        }
        OrgLocation location = OrgLocation.builder()
                .name(req.name())
                .active(true)
                .build();
        return OrgLocationDto.from(locationRepository.save(location));
    }

    public OrgLocationDto toggleLocation(Long id) {
        OrgLocation location = locationRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Location not found"));
        location.setActive(!location.isActive());
        return OrgLocationDto.from(locationRepository.save(location));
    }

    // ── Fix 2: Delete with FK safety check ───────────────────────────────────

    public void deleteDepartment(Long id) {
        departmentRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Department not found"));
        long count = appUserRepository.countByDepartmentId(id);
        if (count > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Cannot delete — " + count + " employee" + (count == 1 ? " is" : "s are") + " assigned to this department");
        }
        departmentRepository.deleteById(id);
    }

    public void deleteDesignation(Long id) {
        designationRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Designation not found"));
        long count = appUserRepository.countByDesignationId(id);
        if (count > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Cannot delete — " + count + " employee" + (count == 1 ? " is" : "s are") + " assigned to this designation");
        }
        designationRepository.deleteById(id);
    }

    public void deleteLocation(Long id) {
        locationRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Location not found"));
        long count = appUserRepository.countByLocationId(id);
        if (count > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Cannot delete — " + count + " employee" + (count == 1 ? " is" : "s are") + " assigned to this location");
        }
        locationRepository.deleteById(id);
    }
}
