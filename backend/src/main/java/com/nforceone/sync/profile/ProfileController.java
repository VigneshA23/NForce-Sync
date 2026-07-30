package com.nforceone.sync.profile;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.org.DepartmentRepository;
import com.nforceone.sync.org.DesignationRepository;
import com.nforceone.sync.org.OrgLocationRepository;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/profile")
public class ProfileController {

    private final AppUserRepository      userRepository;
    private final DepartmentRepository   departmentRepository;
    private final DesignationRepository  designationRepository;
    private final OrgLocationRepository  locationRepository;

    public ProfileController(AppUserRepository userRepository,
                             DepartmentRepository departmentRepository,
                             DesignationRepository designationRepository,
                             OrgLocationRepository locationRepository) {
        this.userRepository       = userRepository;
        this.departmentRepository = departmentRepository;
        this.designationRepository = designationRepository;
        this.locationRepository   = locationRepository;
    }

    @GetMapping
    public ProfileDto getProfile() {
        AppUser user = requireCurrentUser();
        return buildDto(user);
    }

    @PatchMapping
    public ProfileDto updateProfile(@Valid @RequestBody UpdateProfileRequest request) {
        AppUser user = requireCurrentUser();
        user.setPhone(request.phone());
        user.setEmergencyContactName(request.emergencyContactName());
        user.setEmergencyContactPhone(request.emergencyContactPhone());
        userRepository.save(user);
        return buildDto(user);
    }

    private AppUser requireCurrentUser() {
        String email = (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        return userRepository.findByEmailAndDeletedAtIsNull(email)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Authenticated user record missing"));
    }

    private ProfileDto buildDto(AppUser user) {
        String managerName    = user.getManager() != null ? user.getManager().getFullName() : null;
        String departmentName = user.getDepartmentId() != null
                ? departmentRepository.findById(user.getDepartmentId()).map(d -> d.getName()).orElse(null) : null;
        String designationName = user.getDesignationId() != null
                ? designationRepository.findById(user.getDesignationId()).map(d -> d.getTitle()).orElse(null) : null;
        String locationName   = user.getLocationId() != null
                ? locationRepository.findById(user.getLocationId()).map(l -> l.getName()).orElse(null) : null;
        return ProfileDto.from(user, managerName, departmentName, designationName, locationName);
    }
}
